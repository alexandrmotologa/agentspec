import http from 'node:http';
import type { OpenAPISpec, NormalizedOperation } from '../types/openapi.js';
import type { EmulatorServerOptions, InvocationResult, SessionState } from '../types/emulator.js';
import type { BedrockLambdaResponse } from '../types/bedrock.js';
import { OpenAPILoader } from '../compiler/openapi-loader.js';
import { BedrockEnvelope } from './bedrock-envelope.js';
import { LambdaRunner } from './lambda-runner.js';
import { ResponseValidator } from './response-validator.js';
import { MockGenerator } from './mock-generator.js';

export class MockServer {
  private spec: OpenAPISpec;
  private operations: NormalizedOperation[];
  private runner?: LambdaRunner;
  private options: EmulatorServerOptions;
  private server?: http.Server;
  private sessionStore = new Map<string, SessionState>();

  constructor(options: EmulatorServerOptions) {
    this.options = options;
    this.spec = OpenAPILoader.load(options.specPath);
    this.operations = OpenAPILoader.extractOperations(this.spec);
    if (options.handlerPath && !options.mockMode) {
      this.runner = new LambdaRunner(options.handlerPath);
    }
  }

  /**
   * Starts the local emulator HTTP server and interactive studio
   */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-AgentSpec-Session-Id');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          await this.handleRequest(req, res);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Internal emulator error',
            message: String(err)
          }));
        }
      });

      this.server.on('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        const address = this.server?.address();
        const port = typeof address === 'object' && address ? address.port : this.options.port;
        resolve(port);
      });
    });
  }

  /**
   * Stops the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // 1. Studio Web UI
    if (pathname === '/' || pathname === '/_studio') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderStudioHtml());
      return;
    }

    // 2. Spec metadata API
    if (pathname === '/api/spec') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        title: this.spec.info.title,
        version: this.spec.info.version,
        operations: this.operations,
        mockMode: Boolean(this.options.mockMode || !this.runner)
      }));
      return;
    }

    // 3. Multi-turn Session Management API
    if (pathname === '/api/sessions' || pathname.startsWith('/api/sessions/')) {
      if (pathname === '/api/sessions' && req.method === 'GET') {
        const sessions = Array.from(this.sessionStore.values());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessions));
        return;
      }
      const sid = pathname.replace('/api/sessions/', '');
      if (sid && req.method === 'GET') {
        const session = this.sessionStore.get(sid);
        if (session) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(session));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
        return;
      }
      if (sid && req.method === 'DELETE') {
        this.sessionStore.delete(sid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deleted', sessionId: sid }));
        return;
      }
    }

    // Read request body
    const bodyText = await this.readRequestBody(req);
    let bodyJson: unknown;
    if (bodyText) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = bodyText;
      }
    }

    // 4. Explicit /api/invoke invocation endpoint
    if (pathname === '/api/invoke' && req.method === 'POST') {
      const invokePayload = bodyJson as {
        toolName?: string;
        operationId?: string;
        path?: string;
        method?: string;
        parameters?: Record<string, unknown>;
        body?: unknown;
        sessionId?: string;
        sessionAttributes?: Record<string, string>;
        promptSessionAttributes?: Record<string, string>;
        inputText?: string;
      };

      const matchedOp = this.findOperation(invokePayload);
      if (!matchedOp) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Operation not found',
          availableOperations: this.operations.map(o => o.id)
        }));
        return;
      }

      const sessionId = invokePayload.sessionId || (req.headers['x-agentspec-session-id'] as string) || 'default';

      const result = await this.invokeOperation(
        matchedOp,
        invokePayload.parameters || {},
        invokePayload.body,
        invokePayload.inputText,
        sessionId,
        invokePayload.sessionAttributes,
        invokePayload.promptSessionAttributes
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
      return;
    }

    // 5. Native REST path proxying (e.g. GET /pets/123)
    const matchedRoute = this.matchRoute(pathname, (req.method || 'GET').toLowerCase());
    if (matchedRoute) {
      const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());
      const combinedParams = { ...queryParams, ...matchedRoute.pathParams };
      const sessionId = (req.headers['x-agentspec-session-id'] as string) || 'default';

      const result = await this.invokeOperation(
        matchedRoute.operation,
        combinedParams,
        bodyJson,
        undefined,
        sessionId
      );

      const statusCode = result.response?.response.httpStatusCode || result.statusCode;
      const respHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

      // Attach X-AgentSpec headers
      respHeaders['X-AgentSpec-Valid'] = String(result.validationErrors.length === 0);
      respHeaders['X-AgentSpec-Duration-Ms'] = String(result.durationMs);
      respHeaders['X-AgentSpec-Session-Id'] = sessionId;

      res.writeHead(statusCode, respHeaders);
      if (result.response?.response.responseBody?.['application/json']?.body) {
        res.end(result.response.response.responseBody['application/json'].body);
      } else {
        res.end(JSON.stringify(result.rawOutput || result.response));
      }
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: `No route matching ${req.method} ${pathname}`,
      studioUrl: `http://localhost:${this.options.port}/_studio`
    }));
  }

  private findOperation(query: { toolName?: string; operationId?: string; path?: string; method?: string }): NormalizedOperation | undefined {
    const id = query.toolName || query.operationId;
    if (id) {
      return this.operations.find(o => o.id === id || o.id === id.replace(/[^a-zA-Z0-9_]/g, '_'));
    }
    if (query.path && query.method) {
      return this.operations.find(o => o.path === query.path && o.method.toLowerCase() === query.method?.toLowerCase());
    }
    return undefined;
  }

  private matchRoute(urlPath: string, method: string): { operation: NormalizedOperation; pathParams: Record<string, string> } | null {
    for (const op of this.operations) {
      if (op.method.toLowerCase() !== method.toLowerCase()) continue;

      const patternParts = op.path.split('/').filter(Boolean);
      const urlParts = urlPath.split('/').filter(Boolean);

      if (patternParts.length !== urlParts.length) continue;

      let matches = true;
      const pathParams: Record<string, string> = {};

      for (let i = 0; i < patternParts.length; i++) {
        const pPart = patternParts[i];
        const uPart = urlParts[i];

        if (pPart.startsWith('{') && pPart.endsWith('}')) {
          const paramName = pPart.slice(1, -1);
          pathParams[paramName] = decodeURIComponent(uPart);
        } else if (pPart !== uPart) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return { operation: op, pathParams };
      }
    }
    return null;
  }

  private async invokeOperation(
    operation: NormalizedOperation,
    parameters: Record<string, unknown>,
    body?: unknown,
    inputText?: string,
    sessionId = 'default',
    customSessionAttrs?: Record<string, string>,
    customPromptAttrs?: Record<string, string>
  ): Promise<InvocationResult> {
    // 1. Get or create stateful session
    let session = this.sessionStore.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        sessionAttributes: {},
        promptSessionAttributes: {},
        invocationHistory: []
      };
      this.sessionStore.set(sessionId, session);
    }

    if (customSessionAttrs) {
      session.sessionAttributes = { ...session.sessionAttributes, ...customSessionAttrs };
    }
    if (customPromptAttrs) {
      session.promptSessionAttributes = { ...session.promptSessionAttributes, ...customPromptAttrs };
    }

    // 2. Synthesize Bedrock Event with session state
    const event = BedrockEnvelope.synthesize(
      operation,
      parameters,
      body,
      {
        actionGroup: this.options.actionGroupName || 'LocalActionGroup',
        sessionAttributes: { ...session.sessionAttributes },
        promptSessionAttributes: { ...session.promptSessionAttributes },
        inputText
      }
    );

    let output: unknown;
    let durationMs = 0;
    let logs: string[] = [];

    // 3. Execute via local Lambda runner OR synthesize via MockGenerator
    if (this.runner && !this.options.mockMode) {
      const execResult = await this.runner.execute(event);
      output = execResult.output;
      durationMs = execResult.durationMs;
      logs = execResult.logs;
    } else {
      const start = performance.now();
      output = MockGenerator.generateBedrockResponse(event, operation);
      durationMs = Math.round((performance.now() - start) * 100) / 100;
      logs = [`[MOCK] Synthesized synthetic response conforming to OpenAPI 3.0 schema for ${operation.id}`];
    }

    const validation = ResponseValidator.validate(event, output, operation);
    const bedrockResp = output as BedrockLambdaResponse;

    // 4. Update multi-turn session state if returned by handler
    if (bedrockResp?.sessionAttributes) {
      session.sessionAttributes = { ...session.sessionAttributes, ...bedrockResp.sessionAttributes };
    }
    if (bedrockResp?.promptSessionAttributes) {
      session.promptSessionAttributes = { ...session.promptSessionAttributes, ...bedrockResp.promptSessionAttributes };
    }

    session.invocationHistory.push({
      timestamp: Date.now(),
      operationId: operation.id,
      statusCode: validation.statusCode,
      durationMs
    });

    return {
      statusCode: validation.statusCode,
      event,
      response: bedrockResp,
      rawOutput: output,
      durationMs,
      validationErrors: validation.errors,
      logs,
      session
    };
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  private renderStudioHtml(): string {
    const isMock = Boolean(this.options.mockMode || !this.runner);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentSpec Studio - Bedrock Lambda Fulfillment &amp; Contract Sandbox</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .code-box { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <header class="border-b border-slate-800 bg-slate-900/60 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
    <div class="flex items-center space-x-3">
      <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-lg">λ</div>
      <div>
        <h1 class="font-bold text-base sm:text-lg text-white">AgentSpec Studio</h1>
        <p class="text-[11px] sm:text-xs text-slate-400">AWS Bedrock Lambda Fulfillment &amp; Multi-Model Contract Sandbox</p>
      </div>
    </div>
    <div class="flex items-center space-x-3 sm:space-x-4">
      <span class="text-xs px-2.5 py-1 rounded-full ${
        isMock
          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      } flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full ${isMock ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
        ${isMock ? 'Autonomous Mock Server Active' : `Lambda Emulator Active (Port ${this.options.port})`}
      </span>
      <span class="text-xs text-slate-400 font-mono">${this.operations.length} operations</span>
    </div>
  </header>

  <main class="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
    <!-- Sidebar: Operations -->
    <aside class="w-full lg:w-72 lg:max-w-xs border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/40 p-4 overflow-y-auto flex flex-col gap-4 max-h-64 lg:max-h-none flex-shrink-0">
      <!-- Session Box -->
      <div class="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Active Session ID</label>
        <input type="text" id="session-id-input" value="session-default" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50" />
        <span class="text-[10px] text-slate-500 block mt-1">Multi-turn sessionAttributes persist per ID</span>
      </div>

      <div>
        <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operations</h2>
        <div class="space-y-1.5" id="op-list">
          ${this.operations.map((op, idx) => `
            <button onclick="selectOperation(${idx})" id="op-btn-${idx}" class="w-full text-left p-2.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-900/80 transition-all flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  op.method === 'get' ? 'bg-blue-500/20 text-blue-400' :
                  op.method === 'post' ? 'bg-emerald-500/20 text-emerald-400' :
                  op.method === 'put' ? 'bg-amber-500/20 text-amber-400' :
                  op.method === 'delete' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                }">${op.method.toUpperCase()}</span>
                <span class="text-xs font-mono font-medium text-slate-200 truncate">${op.id}</span>
              </div>
              <span class="text-[11px] text-slate-400 font-mono truncate">${op.path}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </aside>

    <!-- Center: Invocation & Parameters -->
    <section class="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto">
      <div id="op-detail" class="space-y-6">
        <div>
          <div class="flex items-center gap-3">
            <span id="detail-method" class="text-xs font-bold px-2 py-1 rounded bg-blue-500/20 text-blue-400 uppercase">GET</span>
            <h2 id="detail-id" class="text-lg sm:text-xl font-bold text-white font-mono">Select an operation</h2>
          </div>
          <p id="detail-desc" class="text-xs sm:text-sm text-slate-400 mt-1">Select an operation from the sidebar to inspect parameters and test local fulfillment.</p>
        </div>

        <!-- 3-Column Inspection Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- Column 1: Inputs (4 cols on lg) -->
          <div class="col-span-1 lg:col-span-4 space-y-4">
            <div class="border border-slate-800 rounded-xl bg-slate-900/40 p-4">
              <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Parameters</h3>
              <div id="params-form" class="space-y-3 text-xs">
                <p class="text-slate-500 italic">No parameters required</p>
              </div>
            </div>

            <div class="border border-slate-800 rounded-xl bg-slate-900/40 p-4">
              <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Request Body (JSON)</h3>
              <textarea id="body-input" rows="5" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50" placeholder="{}"></textarea>
            </div>

            <button onclick="executeInvocation()" id="btn-invoke" class="w-full py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-all shadow-lg shadow-cyan-950 flex items-center justify-center gap-2">
              <span>Execute Lambda Fulfillment</span>
            </button>
          </div>

          <!-- Column 2: Synthesized Bedrock Event (4 cols on lg) -->
          <div class="col-span-1 lg:col-span-4 border border-slate-800 rounded-xl bg-slate-900/40 p-4 flex flex-col">
            <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Synthesized Bedrock Event</h3>
            <pre id="event-box" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-300/90 overflow-x-auto whitespace-pre-wrap min-h-[160px] max-h-[460px]">Run invocation to synthesize event envelope</pre>
          </div>

          <!-- Column 3: Output & Validation (4 cols on lg) -->
          <div class="col-span-1 lg:col-span-4 border border-slate-800 rounded-xl bg-slate-900/40 p-4 flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Lambda Output</h3>
              <div id="status-badge" class="hidden text-[11px] px-2 py-0.5 rounded font-mono font-medium"></div>
            </div>
            <div id="validation-box" class="hidden mb-2 p-2.5 rounded-lg text-xs font-mono border"></div>
            <pre id="output-box" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap min-h-[160px] max-h-[300px]">Run invocation to see output</pre>
            <div class="mt-2 pt-2 border-t border-slate-800">
              <h4 class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Session State</h4>
              <pre id="session-box" class="bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] font-mono text-emerald-400 max-h-24 overflow-y-auto">No session state</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const operations = ${JSON.stringify(this.operations)};
    let currentOpIdx = 0;

    function selectOperation(idx) {
      currentOpIdx = idx;
      const op = operations[idx];
      document.querySelectorAll('#op-list button').forEach(b => b.classList.remove('bg-slate-800', 'border-cyan-500/40'));
      document.getElementById('op-btn-' + idx)?.classList.add('bg-slate-800', 'border-cyan-500/40');

      document.getElementById('detail-id').textContent = op.id;
      document.getElementById('detail-method').textContent = op.method.toUpperCase();
      document.getElementById('detail-desc').textContent = op.description || op.summary || 'No description provided';

      const paramsContainer = document.getElementById('params-form');
      if (op.parameters && op.parameters.length > 0) {
        paramsContainer.innerHTML = op.parameters.map(p => \`
          <div>
            <label class="block text-slate-300 font-mono mb-1 font-medium">\${p.name} \${p.required ? '<span class="text-rose-400">*</span>' : ''} <span class="text-slate-500 text-[10px]">(\${p.in})</span></label>
            <input type="text" id="param-\${p.name}" data-param-name="\${p.name}" class="param-input w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50" placeholder="\${p.description || ''}" />
          </div>
        \`).join('');
      } else {
        paramsContainer.innerHTML = '<p class="text-slate-500 italic">No parameters required</p>';
      }

      const bodyInput = document.getElementById('body-input');
      if (op.requestBodySchema) {
        bodyInput.value = JSON.stringify(op.requestBodySchema.example || {}, null, 2);
      } else {
        bodyInput.value = '';
      }
    }

    async function executeInvocation() {
      const op = operations[currentOpIdx];
      const params = {};
      document.querySelectorAll('.param-input').forEach(input => {
        if (input.value) params[input.dataset.paramName] = input.value;
      });

      let body = undefined;
      const bodyText = document.getElementById('body-input').value.trim();
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch (e) {
          alert('Invalid JSON in Request Body: ' + e.message);
          return;
        }
      }

      const sessionId = document.getElementById('session-id-input').value.trim() || 'default';

      const btn = document.getElementById('btn-invoke');
      btn.disabled = true;
      btn.textContent = 'Executing...';

      try {
        const resp = await fetch('/api/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: op.id,
            parameters: params,
            body: body,
            sessionId: sessionId
          })
        });

        const data = await resp.json();
        const eventBox = document.getElementById('event-box');
        const outputBox = document.getElementById('output-box');
        const statusBadge = document.getElementById('status-badge');
        const validationBox = document.getElementById('validation-box');
        const sessionBox = document.getElementById('session-box');

        eventBox.textContent = JSON.stringify(data.event, null, 2);

        statusBadge.classList.remove('hidden');
        if (data.statusCode >= 200 && data.statusCode < 300) {
          statusBadge.className = 'text-[11px] px-2 py-0.5 rounded font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
          statusBadge.textContent = 'HTTP ' + data.statusCode + ' (' + data.durationMs + 'ms)';
        } else {
          statusBadge.className = 'text-[11px] px-2 py-0.5 rounded font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30';
          statusBadge.textContent = 'HTTP ' + data.statusCode + ' (' + data.durationMs + 'ms)';
        }

        outputBox.textContent = JSON.stringify(data.response || data.rawOutput, null, 2);

        if (data.validationErrors && data.validationErrors.length > 0) {
          validationBox.classList.remove('hidden');
          validationBox.className = 'mb-2 p-2.5 rounded-lg text-xs font-mono border bg-rose-950/30 border-rose-800 text-rose-300';
          validationBox.innerHTML = '<strong>' + data.validationErrors.length + ' Validation Errors:</strong><br/>' +
            data.validationErrors.map(e => '&bull; [' + e.path + '] ' + e.message).join('<br/>');
        } else {
          validationBox.classList.remove('hidden');
          validationBox.className = 'mb-2 p-2.5 rounded-lg text-xs font-mono border bg-emerald-950/30 border-emerald-800 text-emerald-300';
          validationBox.innerHTML = '<strong>Bedrock Contract:</strong> 100% Conforming';
        }

        if (data.session) {
          sessionBox.textContent = JSON.stringify({
            sessionId: data.session.sessionId,
            attributes: data.session.sessionAttributes,
            historyCount: data.session.invocationHistory.length
          }, null, 2);
        }
      } catch (err) {
        alert('Invocation failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Execute Lambda Fulfillment';
      }
    }

    if (operations.length > 0) {
      selectOperation(0);
    }
  </script>
</body>
</html>`;
  }
}
