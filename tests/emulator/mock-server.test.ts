import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { MockServer } from '../../src/emulator/mock-server.js';

describe('MockServer HTTP Gateway', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const sampleLambdaPath = path.resolve('tests/fixtures/sample-lambda.ts');
  let server: MockServer;
  let port: number;

  beforeAll(async () => {
    server = new MockServer({
      specPath: petstorePath,
      handlerPath: sampleLambdaPath,
      port: 0, // random free port
      host: '127.0.0.1'
    });
    port = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should serve interactive studio HTML at /_studio and /', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/_studio`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AgentSpec Studio');
    expect(html).toContain('AWS Bedrock Lambda Fulfillment');
  });

  it('should serve spec operations metadata at /api/spec', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/spec`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.title).toBe('Swagger Petstore');
    expect(data.operations.length).toBe(4);
  });

  it('should invoke operation via /api/invoke for listPets', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: 'listPets',
        parameters: { limit: 5 }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.statusCode).toBe(200);
    expect(data.validationErrors.length).toBe(0);

    const body = JSON.parse(data.response.response.responseBody['application/json'].body);
    expect(body.length).toBe(2);
  });

  it('should invoke operation via /api/invoke for createPet with body', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: 'createPet',
        body: { name: 'Barnaby', tag: 'canine', status: 'available' }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.statusCode).toBe(201);
    expect(data.validationErrors.length).toBe(0);
    const body = JSON.parse(data.response.response.responseBody['application/json'].body);
    expect(body.name).toBe('Barnaby');
    expect(body.id).toBe(101);
  });

  it('should proxy direct REST endpoint GET /pets/42', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/pets/42`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-agentspec-valid')).toBe('true');
    const pet = await res.json() as any;
    expect(pet.id).toBe(42);
    expect(pet.name).toBe('Pet #42');
  });

  it('should return 404 for non-existent pet ID 999', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/pets/999`);
    expect(res.status).toBe(404);
    const error = await res.json() as any;
    expect(error.message).toContain('not found');
  });
});
