import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { MockGenerator } from '../../src/emulator/mock-generator.js';
import { MockServer } from '../../src/emulator/mock-server.js';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';

describe('MockGenerator & Stateful Multi-Turn Sessions', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const spec = OpenAPILoader.load(petstorePath);
  const operations = OpenAPILoader.extractOperations(spec);

  describe('MockGenerator Schema Synthesis', () => {
    it('should generate compliant synthetic responses for operations without handlers', () => {
      const listPets = operations.find(o => o.id === 'listPets')!;
      const resp = MockGenerator.generateResponseData(listPets, '200');

      expect(resp.statusCode).toBe(200);
      expect(Array.isArray(resp.data)).toBe(true);
      const items = resp.data as any[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('name');
    });

    it('should generate compliant Bedrock Lambda envelope response', () => {
      const getPet = operations.find(o => o.id === 'getPetById')!;
      expect(getPet).toBeDefined();

      const bedrockResp = MockGenerator.generateBedrockResponse(
        {
          messageVersion: '1.0',
          actionGroup: 'MockActionGroup',
          apiPath: '/pets/{petId}',
          httpMethod: 'GET',
          parameters: [{ name: 'petId', type: 'string', value: '123' }]
        },
        getPet
      );

      expect(bedrockResp.messageVersion).toBe('1.0');
      expect(bedrockResp.response.actionGroup).toBe('MockActionGroup');
      expect(bedrockResp.response.httpStatusCode).toBe(200);
      expect(typeof bedrockResp.response.responseBody['application/json'].body).toBe('string');

      const parsedBody = JSON.parse(bedrockResp.response.responseBody['application/json'].body);
      expect(parsedBody).toHaveProperty('id');
      expect(parsedBody).toHaveProperty('name');
    });
  });

  describe('MockServer Zero-Code Mode & Stateful Sessions', () => {
    let server: MockServer;
    let port: number;

    beforeAll(async () => {
      // Start in zero-code mock mode (no handler provided)
      server = new MockServer({
        specPath: petstorePath,
        port: 0,
        host: '127.0.0.1',
        mockMode: true,
        actionGroupName: 'ZeroCodeGroup'
      });
      port = await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('should report mockMode: true at /api/spec', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/spec`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.mockMode).toBe(true);
    });

    it('should successfully invoke operation with zero code and return schema-valid synthetic mock', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: 'getPetById',
          parameters: { petId: '42' }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.statusCode).toBe(200);
      expect(data.validationErrors.length).toBe(0);
      expect(data.logs[0]).toContain('[MOCK]');

      const body = JSON.parse(data.response.response.responseBody['application/json'].body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
    });

    it('should persist and accumulate sessionAttributes across multi-turn invocations', async () => {
      const testSessionId = 'turn-session-xyz';

      // Turn 1: Pass initial session attributes
      const res1 = await fetch(`http://127.0.0.1:${port}/api/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: 'listPets',
          sessionId: testSessionId,
          sessionAttributes: { userTier: 'enterprise', caller: 'agent_alex' }
        })
      });
      expect(res1.status).toBe(200);

      // Verify session via /api/sessions/:id
      const sessionRes1 = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}`);
      expect(sessionRes1.status).toBe(200);
      const sessionData1 = await sessionRes1.json() as any;
      expect(sessionData1.sessionAttributes.userTier).toBe('enterprise');
      expect(sessionData1.sessionAttributes.caller).toBe('agent_alex');
      expect(sessionData1.invocationHistory.length).toBe(1);

      // Turn 2: Pass additional session attributes on same session
      const res2 = await fetch(`http://127.0.0.1:${port}/api/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: 'getPetById',
          sessionId: testSessionId,
          parameters: { petId: '10' },
          sessionAttributes: { lastAction: 'view_details' }
        })
      });
      expect(res2.status).toBe(200);

      // Verify merged attributes
      const sessionRes2 = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}`);
      const sessionData2 = await sessionRes2.json() as any;
      expect(sessionData2.sessionAttributes.userTier).toBe('enterprise');
      expect(sessionData2.sessionAttributes.caller).toBe('agent_alex');
      expect(sessionData2.sessionAttributes.lastAction).toBe('view_details');
      expect(sessionData2.invocationHistory.length).toBe(2);

      // Delete session
      const delRes = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}`, { method: 'DELETE' });
      expect(delRes.status).toBe(200);

      // Verify deleted
      const checkRes = await fetch(`http://127.0.0.1:${port}/api/sessions/${testSessionId}`);
      expect(checkRes.status).toBe(404);
    });
  });
});
