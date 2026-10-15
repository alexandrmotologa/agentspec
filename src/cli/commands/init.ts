import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { OpenAPILoader } from '../../compiler/openapi-loader.js';
import { TypeGenerator } from '../../compiler/typegen.js';
import type { OpenAPISpec } from '../../types/openapi.js';

export interface InitCommandOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(specPathArg?: string, options: InitCommandOptions = {}) {
  try {
    let specPath = specPathArg;
    const targetDir = path.resolve(options.dir || './agentspec-starter');

    // Auto-discover spec if not provided
    if (!specPath) {
      const candidates = ['openapi.json', 'openapi.yaml', 'swagger.json', 'api-spec.json'];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          specPath = c;
          break;
        }
      }
    }

    let spec = specPath ? OpenAPILoader.load(specPath) : createStarterSpec();
    const projectName = options.name || (spec.info.title || 'agentspec-agent').toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const srcDir = path.join(targetDir, 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }

    // 1. Write api-spec.json
    const specDest = path.join(targetDir, 'api-spec.json');
    fs.writeFileSync(specDest, JSON.stringify(spec, null, 2), 'utf8');

    // 2. Generate types & schemas
    const generated = TypeGenerator.generate(spec);
    fs.writeFileSync(path.join(srcDir, 'types.ts'), generated.typeScript, 'utf8');
    fs.writeFileSync(path.join(srcDir, 'schemas.ts'), generated.zod, 'utf8');

    // 3. Generate pre-wired handler.ts
    const operations = OpenAPILoader.extractOperations(spec);
    const handlerCode = generateHandlerCode(spec.info.title, operations);
    fs.writeFileSync(path.join(srcDir, 'handler.ts'), handlerCode, 'utf8');

    // 4. Generate package.json
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: `Bedrock Lambda fulfillment handler for ${spec.info.title}`,
      type: 'module',
      scripts: {
        simulate: 'agentspec simulate ./api-spec.json --handler src/handler.ts',
        test: 'agentspec test ./api-spec.json --handler src/handler.ts',
        compile: 'agentspec compile ./api-spec.json --output dist',
        mcp: 'agentspec mcp ./api-spec.json --handler src/handler.ts',
        mock: 'agentspec mock ./api-spec.json'
      },
      dependencies: {
        agentspec: '^1.0.0',
        zod: '^3.24.2'
      },
      devDependencies: {
        typescript: '^5.7.3',
        '@types/node': '^22.13.9',
        tsx: '^4.19.3'
      }
    };
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

    // 5. Generate tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true
      },
      include: ['src/**/*']
    };
    fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');

    console.log(pc.bold(pc.green(`\n ✓ Initialized new AgentSpec project in ${targetDir}`)));
    console.log(pc.bold('\n Next steps:'));
    console.log(`  1. cd ${path.relative(process.cwd(), targetDir) || '.'}`);
    console.log('  2. npm install');
    console.log(`  3. npm run simulate   ${pc.dim('# Run local Bedrock fulfillment emulator with Web Studio')}`);
    console.log(`  4. npm run test       ${pc.dim('# Run schema fuzzing and regression tests')}`);
    console.log(`  5. npm run compile    ${pc.dim('# Compile to Claude tools, Bedrock action group, CDK, and Terraform')}\n`);
  } catch (err) {
    console.error(pc.red(`\n Failed to initialize project: ${String(err)}\n`));
    process.exit(1);
  }
}

function createStarterSpec(): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Agent Tasks API',
      version: '1.0.0',
      description: 'Starter API for AWS Bedrock and Claude Tool fulfillment'
    },
    paths: {
      '/tasks': {
        get: {
          operationId: 'listTasks',
          summary: 'List active tasks',
          parameters: [
            { name: 'limit', in: 'query' as const, schema: { type: 'integer', minimum: 1, maximum: 50 } }
          ],
          responses: {
            '200': {
              description: 'List of tasks',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'title'],
                      properties: {
                        id: { type: 'string' },
                        title: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          operationId: 'createTask',
          summary: 'Create a task',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Task created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id', 'title'],
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function generateHandlerCode(title: string, operations: any[]): string {
  const routes = operations.map(op => {
    return `    case '${op.method.toUpperCase()} ${op.path}': {
      // Operation: ${op.id} (${op.summary || ''})
      return createResponse(event, 200, {
        operation: '${op.id}',
        status: 'fulfilled',
        timestamp: new Date().toISOString()
      });
    }`;
  }).join('\n\n');

  return `import type { BedrockLambdaEvent, BedrockLambdaResponse } from 'agentspec';

/**
 * AWS Bedrock Action Group fulfillment handler for ${title}
 */
export const handler = async (event: BedrockLambdaEvent): Promise<BedrockLambdaResponse> => {
  const routeKey = \`\${event.httpMethod} \${event.apiPath}\`;
  console.log(\`[Lambda] Invoked route: \${routeKey}\`);

  // Extract query and path parameters
  const params: Record<string, string> = {};
  for (const p of event.parameters || []) {
    params[p.name] = p.value;
  }

  // Extract request body properties
  const body: Record<string, unknown> = {};
  const bodyProps = event.requestBody?.content?.['application/json']?.properties || [];
  for (const prop of bodyProps) {
    body[prop.name] = prop.value;
  }

  switch (routeKey) {
${routes}

    default:
      return createResponse(event, 404, {
        error: 'Not Found',
        message: \`No route matching \${routeKey}\`
      });
  }
};

function createResponse(event: BedrockLambdaEvent, statusCode: number, data: unknown): BedrockLambdaResponse {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify(data)
        }
      }
    }
  };
}
`;
}
