import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { SchemaPruner } from '../../src/compiler/schema-pruner.js';

describe('OpenAPILoader & SchemaPruner', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const stripePath = path.resolve('tests/fixtures/stripe-subset.yaml');

  it('should load and parse JSON OpenAPI spec', () => {
    const spec = OpenAPILoader.load(petstorePath);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Swagger Petstore');
    expect(spec.paths['/pets']).toBeDefined();
  });

  it('should load and parse YAML OpenAPI spec', () => {
    const spec = OpenAPILoader.load(stripePath);
    expect(spec.openapi).toBe('3.0.1');
    expect(spec.info.title).toBe('Stripe Subset API');
    expect(spec.paths['/v1/customers']).toBeDefined();
  });

  it('should convert Swagger 2.0 to OpenAPI 3.0', () => {
    const swaggerSpec = {
      swagger: '2.0',
      info: { title: 'Legacy Swagger API', version: '1.0.0' },
      host: 'api.legacy.com',
      basePath: '/v1',
      schemes: ['https'],
      paths: {
        '/users': {
          get: {
            summary: 'Get Users',
            parameters: [
              { name: 'limit', in: 'query', type: 'integer' }
            ],
            responses: {
              '200': {
                description: 'Success',
                schema: {
                  $ref: '#/definitions/User'
                }
              }
            }
          }
        }
      },
      definitions: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      }
    };

    const converted = OpenAPILoader.convertSwaggerToOpenAPI3(swaggerSpec as any);
    expect(converted.openapi).toBe('3.0.3');
    expect(converted.servers?.[0]?.url).toBe('https://api.legacy.com/v1');
    expect(converted.components?.schemas?.User).toBeDefined();
  });

  it('should safely break circular references during dereferencing', () => {
    const circularSpec = {
      openapi: '3.0.0',
      info: { title: 'Circular Spec', version: '1.0' },
      paths: {},
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              parent: { $ref: '#/components/schemas/Node' }
            }
          }
        }
      }
    };

    const dereferenced = OpenAPILoader.dereference(circularSpec as any);
    const nodeSchema = dereferenced.components?.schemas?.Node as any;
    expect(nodeSchema.properties.name.type).toBe('string');
    expect(nodeSchema.properties.parent.type).toBe('object');
    expect(nodeSchema.properties.parent.description).toContain('Circular reference to Node');
  });

  it('should prune redundant titles, examples, and vendor extensions', () => {
    const bloatedSchema = {
      title: 'BloatedUser',
      type: 'object',
      'x-internal-team': 'backend-core',
      example: { name: 'Alice' },
      description: 'A very detailed user model description that could be trimmed if excessively long',
      properties: {
        id: {
          title: 'UserId',
          type: 'integer',
          'x-pii': false,
          example: 101
        }
      }
    };

    const pruned = SchemaPruner.pruneSchema(bloatedSchema);
    expect((pruned as any).title).toBeUndefined();
    expect((pruned as any)['x-internal-team']).toBeUndefined();
    expect((pruned as any).example).toBeUndefined();
    expect(pruned.properties?.id?.title).toBeUndefined();
    expect(pruned.properties?.id?.type).toBe('integer');
  });

  it('should compute token metrics and show positive savings', () => {
    const original = {
      title: 'VerboseSpec',
      description: 'A spec with lots of redundant descriptions and examples',
      example: { a: 1, b: 2, c: [1, 2, 3] },
      'x-vendor-flag': 'keep-private',
      properties: {
        field1: { title: 'F1', type: 'string', example: 'example value' }
      }
    };

    const pruned = SchemaPruner.pruneSchema(original);
    const metrics = SchemaPruner.calculateMetrics(original, pruned);

    expect(metrics.originalTokens).toBeGreaterThan(metrics.prunedTokens);
    expect(metrics.savedTokens).toBeGreaterThan(0);
    expect(metrics.reductionPercentage).toBeGreaterThan(20);
  });
});
