import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { ResponseValidator } from '../../src/emulator/response-validator.js';
import type { BedrockLambdaEvent, BedrockLambdaResponse } from '../../src/types/bedrock.js';

describe('ResponseValidator', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const spec = OpenAPILoader.load(petstorePath);
  const operations = OpenAPILoader.extractOperations(spec);
  const getPetOp = operations.find(o => o.id === 'getPetById')!;

  const validEvent: BedrockLambdaEvent = {
    messageVersion: '1.0',
    agent: { name: 'A', id: '1', alias: 'T', version: 'DRAFT' },
    actionGroup: 'PetGroup',
    apiPath: '/pets/{petId}',
    httpMethod: 'GET',
    parameters: [{ name: 'petId', type: 'integer', value: '1' }],
    sessionAttributes: {},
    promptSessionAttributes: {}
  };

  it('should validate a compliant BedrockLambdaResponse', () => {
    const validResponse: BedrockLambdaResponse = {
      messageVersion: '1.0',
      response: {
        actionGroup: 'PetGroup',
        apiPath: '/pets/{petId}',
        httpMethod: 'GET',
        httpStatusCode: 200,
        responseBody: {
          'application/json': {
            body: JSON.stringify({ id: 1, name: 'Fluffy', tag: 'dog', status: 'available' })
          }
        }
      }
    };

    const result = ResponseValidator.validate(validEvent, validResponse, getPetOp);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect((result.parsedBody as any).name).toBe('Fluffy');
  });

  it('should reject response with missing messageVersion', () => {
    const malformed = {
      response: {
        actionGroup: 'PetGroup',
        apiPath: '/pets/{petId}',
        httpMethod: 'GET',
        httpStatusCode: 200,
        responseBody: { 'application/json': { body: '{}' } }
      }
    };

    const result = ResponseValidator.validate(validEvent, malformed as any, getPetOp);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.path === 'messageVersion')).toBe(true);
  });

  it('should reject non-string responseBody (AWS Bedrock strict requirement)', () => {
    const rawObjectBody = {
      messageVersion: '1.0',
      response: {
        actionGroup: 'PetGroup',
        apiPath: '/pets/{petId}',
        httpMethod: 'GET',
        httpStatusCode: 200,
        responseBody: {
          'application/json': {
            body: { id: 1, name: 'Not A String' } as any
          }
        }
      }
    };

    const result = ResponseValidator.validate(validEvent, rawObjectBody as any, getPetOp);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.message.includes('serialized JSON string'))).toBe(true);
  });

  it('should detect schema conformance violations in parsed response body', () => {
    const schemaViolationResponse: BedrockLambdaResponse = {
      messageVersion: '1.0',
      response: {
        actionGroup: 'PetGroup',
        apiPath: '/pets/{petId}',
        httpMethod: 'GET',
        httpStatusCode: 200,
        responseBody: {
          'application/json': {
            // Missing required 'name' field and invalid enum for status
            body: JSON.stringify({ id: 1, status: 'UNKNOWN_STATUS' })
          }
        }
      }
    };

    const result = ResponseValidator.validate(validEvent, schemaViolationResponse, getPetOp);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.path.includes('name') && e.message.includes('Missing required property'))).toBe(true);
    expect(result.errors.some(e => e.path.includes('status') && e.message.includes('not in allowed enum list'))).toBe(true);
  });
});
