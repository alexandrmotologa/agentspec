import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { BedrockEnvelope } from '../../src/emulator/bedrock-envelope.js';
import { LambdaRunner } from '../../src/emulator/lambda-runner.js';

describe('BedrockEnvelope & LambdaRunner', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const sampleLambdaPath = path.resolve('tests/fixtures/sample-lambda.ts');

  it('should synthesize a valid BedrockLambdaEvent', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const operations = OpenAPILoader.extractOperations(spec);
    const getPetOp = operations.find(o => o.id === 'getPetById')!;

    const event = BedrockEnvelope.synthesize(
      getPetOp,
      { petId: 10 },
      undefined,
      { actionGroup: 'PetGroup' }
    );

    expect(event.messageVersion).toBe('1.0');
    expect(event.actionGroup).toBe('PetGroup');
    expect(event.apiPath).toBe('/pets/{petId}');
    expect(event.httpMethod).toBe('GET');
    expect(event.parameters).toEqual([
      { name: 'petId', type: 'integer', value: '10' }
    ]);
  });

  it('should unpack a BedrockLambdaEvent into typed arguments', () => {
    const event = {
      messageVersion: '1.0' as const,
      agent: { name: 'A', id: '1', alias: 'T', version: 'DRAFT' },
      actionGroup: 'G',
      apiPath: '/pets',
      httpMethod: 'POST',
      parameters: [
        { name: 'limit', type: 'integer', value: '25' },
        { name: 'active', type: 'boolean', value: 'true' }
      ],
      requestBody: {
        content: {
          'application/json': {
            properties: [
              { name: 'name', type: 'string', value: 'Rex' }
            ]
          }
        }
      },
      sessionAttributes: {},
      promptSessionAttributes: {}
    };

    const unpacked = BedrockEnvelope.unpack(event);
    expect(unpacked.parameters.limit).toBe(25);
    expect(unpacked.parameters.active).toBe(true);
    expect((unpacked.body as any).name).toBe('Rex');
  });

  it('should dynamically load and execute sample-lambda.ts', async () => {
    const runner = new LambdaRunner(sampleLambdaPath);
    const event = {
      messageVersion: '1.0' as const,
      agent: { name: 'Agent', id: '1', alias: 'T', version: 'DRAFT' },
      actionGroup: 'PetGroup',
      apiPath: '/pets',
      httpMethod: 'GET',
      parameters: [{ name: 'limit', type: 'integer', value: '10' }],
      sessionAttributes: {},
      promptSessionAttributes: {}
    };

    const result = await runner.execute(event);
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.logs.some(l => l.includes('[Lambda] Handling GET /pets'))).toBe(true);

    const output = result.output as any;
    expect(output.messageVersion).toBe('1.0');
    expect(output.response.httpStatusCode).toBe(200);

    const body = JSON.parse(output.response.responseBody['application/json'].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });
});
