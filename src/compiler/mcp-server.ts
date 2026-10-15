import readline from 'node:readline';
import type { MCPToolDefinition } from '../types/compiler.js';
import type { OpenAPISpec } from '../types/openapi.js';
import { ClaudeCompiler } from './claude-tools.js';
import { OpenAPILoader } from './openapi-loader.js';
import { BedrockEnvelope } from '../emulator/bedrock-envelope.js';
import { LambdaRunner } from '../emulator/lambda-runner.js';

export class MCPServerGenerator {
  /**
   * Compiles an OpenAPI spec into MCP Tool Definitions
   */
  static compileTools(spec: OpenAPISpec, options: { prune?: boolean; maxDescriptionLength?: number } = {}): MCPToolDefinition[] {
    const claudeTools = ClaudeCompiler.compile(spec, options);

    return claudeTools.map(ct => ({
      name: ct.name,
      description: ct.description,
      inputSchema: {
        type: 'object',
        properties: ct.input_schema.properties,
        required: ct.input_schema.required
      }
    }));
  }

  /**
   * Generates a standalone executable MCP Server TypeScript script
   */
  static generateServerCode(spec: OpenAPISpec, handlerPath = './handler.ts'): string {
    const tools = this.compileTools(spec, { prune: true });
    const serverName = spec.info.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    return `// Model Context Protocol (MCP) Stdio Server
// Generated automatically by AgentSpec

import readline from 'node:readline';
import { handler } from '${handlerPath.replace(/\\/g, '/')}';

const TOOLS = ${JSON.stringify(tools, null, 2)};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id: string | number | null, result: unknown, error?: unknown) {
  const payload = {
    jsonrpc: '2.0',
    id,
    ...(error ? { error } : { result })
  };
  process.stdout.write(JSON.stringify(payload) + '\\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line);
    const { id, method, params } = msg;

    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: '${serverName}', version: '${spec.info.version || '1.0.0'}' }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      // Synthesize event and invoke local handler
      const mockEvent = {
        messageVersion: '1.0',
        agent: { name: '${serverName}', id: 'MCP01', alias: 'LIVE', version: '1.0' },
        actionGroup: 'MCPGroup',
        apiPath: '/' + toolName,
        httpMethod: 'POST',
        parameters: Object.entries(args).map(([name, value]) => ({
          name,
          type: typeof value,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value)
        })),
        requestBody: {
          content: {
            'application/json': {
              properties: Object.entries(args).map(([name, value]) => ({
                name,
                type: typeof value,
                value
              }))
            }
          }
        },
        sessionAttributes: {},
        promptSessionAttributes: {}
      };

      const lambdaRes = await handler(mockEvent);
      let outputBody = lambdaRes?.response?.responseBody?.['application/json']?.body;
      if (typeof outputBody === 'string') {
        try { outputBody = JSON.parse(outputBody); } catch {}
      }

      sendResponse(id, {
        content: [
          {
            type: 'text',
            text: typeof outputBody === 'object' ? JSON.stringify(outputBody, null, 2) : String(outputBody || 'OK')
          }
        ]
      });
      return;
    }

    sendResponse(id, null, { code: -32601, message: \`Method not found: \${method}\` });
  } catch (err) {
    sendResponse(null, null, { code: -32700, message: \`Parse error: \${String(err)}\` });
  }
});
`;
  }

  /**
   * Runs an in-process MCP stdio server against a spec and local Lambda handler
   */
  static async runStdioServer(specPath: string, handlerPath: string): Promise<void> {
    const spec = OpenAPILoader.load(specPath);
    const operations = OpenAPILoader.extractOperations(spec);
    const tools = this.compileTools(spec, { prune: true });
    const runner = new LambdaRunner(handlerPath);
    const serverName = spec.info.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    const sendResponse = (id: string | number | null, result: unknown, error?: unknown) => {
      const payload = {
        jsonrpc: '2.0',
        id,
        ...(error ? { error } : { result })
      };
      process.stdout.write(JSON.stringify(payload) + '\n');
    };

    rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;

        if (method === 'initialize') {
          sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: spec.info.version || '1.0.0' }
          });
          return;
        }

        if (method === 'notifications/initialized') {
          return;
        }

        if (method === 'tools/list') {
          sendResponse(id, { tools });
          return;
        }

        if (method === 'tools/call') {
          const toolName = params?.name;
          const args = (params?.arguments || {}) as Record<string, unknown>;

          const op = operations.find(o => o.id === toolName);
          if (!op) {
            sendResponse(id, null, { code: -32602, message: `Unknown tool: ${toolName}` });
            return;
          }

          const event = BedrockEnvelope.synthesize(op, args, args, { actionGroup: 'MCP' });
          const execRes = await runner.execute(event);

          const outputObj = execRes.output as any;
          let bodyText = outputObj?.response?.responseBody?.['application/json']?.body;
          if (!bodyText) {
            bodyText = JSON.stringify(outputObj || {});
          }

          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: typeof bodyText === 'string' ? bodyText : JSON.stringify(bodyText, null, 2)
              }
            ],
            isError: Boolean(execRes.error)
          });
          return;
        }

        sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
      } catch (err) {
        sendResponse(null, null, { code: -32700, message: `Parse error: ${String(err)}` });
      }
    });
  }
}
