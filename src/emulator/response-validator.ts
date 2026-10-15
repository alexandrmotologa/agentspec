import type { BedrockLambdaEvent, BedrockLambdaResponse } from '../types/bedrock.js';
import type { OpenAPISchema, NormalizedOperation } from '../types/openapi.js';
import type { ValidationErrorDetail } from '../types/emulator.js';

export class ResponseValidator {
  /**
   * Asserts and validates a Lambda execution response against Bedrock specifications
   * and the corresponding OpenAPI operation response schema.
   */
  static validate(
    event: BedrockLambdaEvent,
    output: unknown,
    operation?: NormalizedOperation
  ): {
    isValid: boolean;
    errors: ValidationErrorDetail[];
    parsedBody?: unknown;
    statusCode: number;
  } {
    const errors: ValidationErrorDetail[] = [];

    // 1. Envelope format validation
    if (!output || typeof output !== 'object') {
      errors.push({
        path: 'root',
        message: 'Lambda output must be an object matching BedrockLambdaResponse structure',
        expected: 'object',
        received: typeof output
      });
      return { isValid: false, errors, statusCode: 500 };
    }

    const resp = output as Partial<BedrockLambdaResponse>;

    if (resp.messageVersion !== '1.0') {
      errors.push({
        path: 'messageVersion',
        message: 'Missing or invalid "messageVersion". Expected "1.0"',
        expected: '1.0',
        received: resp.messageVersion
      });
    }

    if (!resp.response || typeof resp.response !== 'object') {
      errors.push({
        path: 'response',
        message: 'Missing "response" object in Lambda response',
        expected: 'object',
        received: typeof resp.response
      });
      return { isValid: false, errors, statusCode: 500 };
    }

    const resObj = resp.response;
    const statusCode = typeof resObj.httpStatusCode === 'number' ? resObj.httpStatusCode : 500;

    if (typeof resObj.httpStatusCode !== 'number') {
      errors.push({
        path: 'response.httpStatusCode',
        message: 'Missing or invalid "httpStatusCode". Must be a number',
        expected: 'number',
        received: typeof resObj.httpStatusCode
      });
    }

    if (resObj.actionGroup && resObj.actionGroup !== event.actionGroup) {
      errors.push({
        path: 'response.actionGroup',
        message: `Mismatched actionGroup. Expected "${event.actionGroup}"`,
        expected: event.actionGroup,
        received: resObj.actionGroup
      });
    }

    // Check responseBody and serialized JSON string
    let parsedBody: unknown;
    const jsonBody = resObj.responseBody?.['application/json']?.body;

    if (jsonBody === undefined || jsonBody === null) {
      errors.push({
        path: "response.responseBody['application/json'].body",
        message: "Missing serialized body in response.responseBody['application/json'].body",
        expected: 'string (serialized JSON)'
      });
    } else if (typeof jsonBody !== 'string') {
      errors.push({
        path: "response.responseBody['application/json'].body",
        message: 'Bedrock requires the response body to be a serialized JSON string, but received object/non-string',
        expected: 'string (serialized JSON)',
        received: typeof jsonBody
      });
      parsedBody = jsonBody; // attempt to inspect anyway
    } else {
      try {
        parsedBody = JSON.parse(jsonBody);
      } catch (err) {
        errors.push({
          path: "response.responseBody['application/json'].body",
          message: `Body is not valid JSON string: ${String(err)}`,
          received: jsonBody
        });
      }
    }

    // 2. Schema compliance validation against OpenAPI specification
    if (operation && parsedBody !== undefined && errors.length === 0) {
      const codeStr = String(statusCode);
      const expectedSchema = operation.responseSchemas[codeStr]
        || operation.responseSchemas['2XX']
        || operation.responseSchemas['default']
        || (statusCode >= 200 && statusCode < 300 ? operation.responseSchemas['200'] : undefined);

      if (expectedSchema) {
        const schemaErrors = this.validateJsonSchema(parsedBody, expectedSchema, 'responseBody');
        errors.push(...schemaErrors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      parsedBody,
      statusCode
    };
  }

  private static validateJsonSchema(
    value: unknown,
    schema: OpenAPISchema,
    currentPath: string
  ): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];
    if (!schema) return errors;

    if (value === null) {
      if (schema.nullable) return errors;
      errors.push({
        path: currentPath,
        message: 'Received null for non-nullable schema',
        expected: schema.type || 'non-null',
        received: null
      });
      return errors;
    }

    if (value === undefined) {
      errors.push({
        path: currentPath,
        message: 'Received undefined value',
        expected: schema.type || 'defined'
      });
      return errors;
    }

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    if (type) {
      if (type === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push({
            path: currentPath,
            message: `Expected integer, received ${typeof value} (${value})`,
            expected: 'integer',
            received: value
          });
        }
      } else if (type === 'number') {
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            path: currentPath,
            message: `Expected number, received ${typeof value}`,
            expected: 'number',
            received: value
          });
        }
      } else if (type === 'string') {
        if (typeof value !== 'string') {
          errors.push({
            path: currentPath,
            message: `Expected string, received ${typeof value}`,
            expected: 'string',
            received: value
          });
        }
      } else if (type === 'boolean') {
        if (typeof value !== 'boolean') {
          errors.push({
            path: currentPath,
            message: `Expected boolean, received ${typeof value}`,
            expected: 'boolean',
            received: value
          });
        }
      } else if (type === 'array') {
        if (!Array.isArray(value)) {
          errors.push({
            path: currentPath,
            message: `Expected array, received ${typeof value}`,
            expected: 'array',
            received: value
          });
        } else if (schema.items) {
          value.forEach((item, idx) => {
            errors.push(...this.validateJsonSchema(item, schema.items!, `${currentPath}[${idx}]`));
          });
        }
      } else if (type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push({
            path: currentPath,
            message: `Expected object, received ${typeof value}`,
            expected: 'object',
            received: value
          });
        } else {
          const valObj = value as Record<string, unknown>;

          // Check required fields
          if (Array.isArray(schema.required)) {
            for (const reqField of schema.required) {
              if (valObj[reqField] === undefined) {
                errors.push({
                  path: `${currentPath}.${reqField}`,
                  message: `Missing required property: "${reqField}"`,
                  expected: 'present'
                });
              }
            }
          }

          // Check defined properties
          if (schema.properties) {
            for (const [propKey, propSchema] of Object.entries(schema.properties)) {
              if (valObj[propKey] !== undefined) {
                errors.push(...this.validateJsonSchema(valObj[propKey], propSchema, `${currentPath}.${propKey}`));
              }
            }
          }
        }
      }
    }

    // Enum check
    if (schema.enum && Array.isArray(schema.enum)) {
      if (!schema.enum.includes(value)) {
        errors.push({
          path: currentPath,
          message: `Value ${JSON.stringify(value)} is not in allowed enum list: [${schema.enum.join(', ')}]`,
          expected: schema.enum,
          received: value
        });
      }
    }

    return errors;
  }
}
