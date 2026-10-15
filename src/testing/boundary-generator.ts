import type { NormalizedOperation, OpenAPISchema, OpenAPIParameter } from '../types/openapi.js';

export interface TestCase {
  id: string;
  name: string;
  operationId: string;
  category: 'valid_baseline' | 'missing_required' | 'type_mismatch' | 'enum_violation' | 'boundary_range' | 'null_injection';
  description: string;
  parameters: Record<string, unknown>;
  body?: unknown;
  expectedStatus: '2xx' | '4xx' | 'any';
}

export class BoundaryGenerator {
  /**
   * Generates a comprehensive matrix of baseline and adversarial boundary test cases
   */
  static generateTestCases(operation: NormalizedOperation): TestCase[] {
    const testCases: TestCase[] = [];

    // 1. Generate Valid Baseline Happy Path Case
    const validParams = this.generateValidParameters(operation.parameters);
    const validBody = operation.requestBodySchema ? this.generateValidValue(operation.requestBodySchema) : undefined;

    testCases.push({
      id: `${operation.id}_baseline_valid`,
      name: `[${operation.id}] Valid Baseline Payload`,
      operationId: operation.id,
      category: 'valid_baseline',
      description: 'Executes operation with syntactically valid parameters and request body',
      parameters: validParams,
      body: validBody,
      expectedStatus: '2xx'
    });

    // 2. Generate Missing Required Parameters test cases
    for (const p of operation.parameters) {
      if (p.required) {
        const missingParams = { ...validParams };
        delete missingParams[p.name];

        testCases.push({
          id: `${operation.id}_missing_${p.name}`,
          name: `[${operation.id}] Missing Required Parameter: ${p.name}`,
          operationId: operation.id,
          category: 'missing_required',
          description: `Omit required ${p.in} parameter "${p.name}"`,
          parameters: missingParams,
          body: validBody,
          expectedStatus: '4xx'
        });
      }
    }

    // 3. Generate Type Mismatch test cases for parameters
    for (const p of operation.parameters) {
      const type = p.schema?.type || 'string';
      let invalidVal: unknown = 'INVALID_STRING_VALUE';

      if (type === 'integer' || type === 'number') {
        invalidVal = 'not-a-number';
      } else if (type === 'boolean') {
        invalidVal = 99999;
      } else if (type === 'string') {
        invalidVal = { nested: 'object_not_string' };
      }

      const corruptedParams = { ...validParams, [p.name]: invalidVal };

      testCases.push({
        id: `${operation.id}_type_mismatch_${p.name}`,
        name: `[${operation.id}] Type Mismatch: ${p.name}`,
        operationId: operation.id,
        category: 'type_mismatch',
        description: `Pass invalid type (${typeof invalidVal}) for ${p.name} (expected ${type})`,
        parameters: corruptedParams,
        body: validBody,
        expectedStatus: '4xx'
      });
    }

    // 4. Generate Enum Violation test cases
    for (const p of operation.parameters) {
      if (p.schema?.enum && Array.isArray(p.schema.enum)) {
        const corruptedParams = { ...validParams, [p.name]: 'UNDEFINED_ENUM_FLAG_XYZ' };
        testCases.push({
          id: `${operation.id}_enum_violation_${p.name}`,
          name: `[${operation.id}] Enum Violation: ${p.name}`,
          operationId: operation.id,
          category: 'enum_violation',
          description: `Pass value outside permitted enum set for ${p.name}`,
          parameters: corruptedParams,
          body: validBody,
          expectedStatus: '4xx'
        });
      }
    }

    // 5. Generate Boundary Range Numeric test cases
    for (const p of operation.parameters) {
      const s = p.schema;
      if (s && (s.type === 'integer' || s.type === 'number')) {
        if (s.minimum !== undefined) {
          const corruptedParams = { ...validParams, [p.name]: s.minimum - 1 };
          testCases.push({
            id: `${operation.id}_under_min_${p.name}`,
            name: `[${operation.id}] Under Minimum: ${p.name}`,
            operationId: operation.id,
            category: 'boundary_range',
            description: `Pass value ${s.minimum - 1} below allowed minimum ${s.minimum}`,
            parameters: corruptedParams,
            body: validBody,
            expectedStatus: '4xx'
          });
        }
        if (s.maximum !== undefined) {
          const corruptedParams = { ...validParams, [p.name]: s.maximum + 1 };
          testCases.push({
            id: `${operation.id}_over_max_${p.name}`,
            name: `[${operation.id}] Over Maximum: ${p.name}`,
            operationId: operation.id,
            category: 'boundary_range',
            description: `Pass value ${s.maximum + 1} exceeding allowed maximum ${s.maximum}`,
            parameters: corruptedParams,
            body: validBody,
            expectedStatus: '4xx'
          });
        }
      }
    }

    // 6. Generate Request Body Adversarial test cases
    if (operation.requestBodySchema && typeof validBody === 'object' && validBody !== null) {
      const bodyObj = validBody as Record<string, unknown>;

      // Omit required body fields
      if (operation.requestBodySchema.required && Array.isArray(operation.requestBodySchema.required)) {
        for (const reqProp of operation.requestBodySchema.required) {
          const corruptedBody = { ...bodyObj };
          delete corruptedBody[reqProp];

          testCases.push({
            id: `${operation.id}_body_missing_${reqProp}`,
            name: `[${operation.id}] Missing Required Body Property: ${reqProp}`,
            operationId: operation.id,
            category: 'missing_required',
            description: `Omit required property "${reqProp}" from request body`,
            parameters: validParams,
            body: corruptedBody,
            expectedStatus: '4xx'
          });
        }
      }

      // Corrupt body types
      for (const [propName, propVal] of Object.entries(bodyObj)) {
        const corruptedBody = {
          ...bodyObj,
          [propName]: typeof propVal === 'number' ? 'string_instead_of_number' : 123456
        };

        testCases.push({
          id: `${operation.id}_body_type_mismatch_${propName}`,
          name: `[${operation.id}] Body Property Type Mismatch: ${propName}`,
          operationId: operation.id,
          category: 'type_mismatch',
          description: `Send mismatched primitive type for body property "${propName}"`,
          parameters: validParams,
          body: corruptedBody,
          expectedStatus: '4xx'
        });
      }
    }

    return testCases;
  }

  private static generateValidParameters(parameters: OpenAPIParameter[]): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const p of parameters) {
      params[p.name] = this.generateValidValue(p.schema || { type: 'string' }, p.name);
    }
    return params;
  }

  static generateValidValue(schema?: OpenAPISchema, fieldName = 'field'): unknown {
    if (!schema) return 'sample_value';

    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }

    if (schema.example !== undefined) {
      return schema.example;
    }

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    switch (type) {
      case 'string':
        if (schema.format === 'date-time') return '2026-10-15T12:00:00Z';
        if (schema.format === 'date') return '2026-10-15';
        if (schema.format === 'email') return 'test@example.com';
        if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        if (schema.format === 'uri') return 'https://example.com';
        return `valid_${fieldName}`;

      case 'integer':
      case 'number':
        if (schema.minimum !== undefined) return schema.minimum;
        if (schema.maximum !== undefined) return schema.maximum;
        return 42;

      case 'boolean':
        return true;

      case 'array':
        return [this.generateValidValue(schema.items, `${fieldName}_item`)];

      case 'object': {
        const obj: Record<string, unknown> = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateValidValue(propSchema, key);
          }
        }
        return obj;
      }

      default:
        return 'sample_value';
    }
  }
}
