import type { OpenAPISchema, NormalizedOperation } from '../types/openapi.js';
import type { BedrockLambdaEvent, BedrockLambdaResponse } from '../types/bedrock.js';

export class MockGenerator {
  /**
   * Generates a realistic mock response matching an operation's response schema
   */
  static generateResponseData(operation: NormalizedOperation, statusCode = '200'): { statusCode: number; data: unknown } {
    const statusNum = parseInt(statusCode, 10) || 200;
    const schema = operation.responseSchemas[statusCode]
      || operation.responseSchemas['200']
      || operation.responseSchemas['201']
      || Object.values(operation.responseSchemas)[0];

    if (!schema) {
      return {
        statusCode: statusNum,
        data: { message: `Mock success for ${operation.id}`, status: 'ok' }
      };
    }

    const data = this.synthesizeFromSchema(schema, operation.id);
    return {
      statusCode: statusNum,
      data
    };
  }

  /**
   * Synthesizes a valid BedrockLambdaResponse for an event using schema generation
   */
  static generateBedrockResponse(event: BedrockLambdaEvent, operation: NormalizedOperation): BedrockLambdaResponse {
    const { statusCode, data } = this.generateResponseData(operation, '200');

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

  private static synthesizeFromSchema(schema: OpenAPISchema, fieldName = 'data'): unknown {
    if (schema.example !== undefined) {
      return schema.example;
    }

    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    switch (type) {
      case 'string':
        if (schema.format === 'email') return 'alexander@example.com';
        if (schema.format === 'uuid') return 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
        if (schema.format === 'date-time') return new Date().toISOString();
        if (schema.format === 'date') return new Date().toISOString().split('T')[0];
        if (schema.format === 'uri') return 'https://example.com/resource';
        if (schema.format === 'ipv4') return '192.168.1.1';
        return `mock_${fieldName}`;

      case 'integer':
      case 'number':
        if (schema.minimum !== undefined) return schema.minimum;
        if (schema.maximum !== undefined) return schema.maximum;
        return 42;

      case 'boolean':
        return true;

      case 'array': {
        const itemSchema = schema.items || { type: 'string' };
        return [
          this.synthesizeFromSchema(itemSchema, `${fieldName}_1`),
          this.synthesizeFromSchema(itemSchema, `${fieldName}_2`)
        ];
      }

      case 'object': {
        const obj: Record<string, unknown> = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.synthesizeFromSchema(propSchema, key);
          }
        }
        return obj;
      }

      default:
        return { status: 'mock_payload', timestamp: Date.now() };
    }
  }
}
