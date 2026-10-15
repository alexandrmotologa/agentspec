import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { SchemaDiff } from '../../src/testing/schema-diff.js';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import type { OpenAPISpec } from '../../src/types/openapi.js';

describe('SchemaDiff Breaking Change Detector', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const baseSpec = OpenAPILoader.load(petstorePath);

  it('should report zero differences for identical specifications', () => {
    const result = SchemaDiff.compare(baseSpec, baseSpec);
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.breakingCount).toBe(0);
    expect(result.changes.length).toBe(0);
  });

  it('should detect breaking change when an operation is removed', () => {
    const modifiedSpec: OpenAPISpec = JSON.parse(JSON.stringify(baseSpec));
    delete modifiedSpec.paths['/pets']?.get;

    const result = SchemaDiff.compare(baseSpec, modifiedSpec);
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.breakingCount).toBeGreaterThanOrEqual(1);
    const breakingOp = result.changes.find(c => c.severity === 'breaking' && c.operationId === 'listPets');
    expect(breakingOp).toBeDefined();
    expect(breakingOp?.message).toContain('Operation was removed or renamed');
  });

  it('should detect breaking change when a new required parameter is added', () => {
    const modifiedSpec: OpenAPISpec = JSON.parse(JSON.stringify(baseSpec));
    modifiedSpec.paths['/pets']?.get?.parameters?.push({
      name: 'tenantId',
      in: 'header',
      required: true,
      schema: { type: 'string' }
    });

    const result = SchemaDiff.compare(baseSpec, modifiedSpec);
    expect(result.hasBreakingChanges).toBe(true);
    const paramChange = result.changes.find(c => c.path === 'parameters.tenantId');
    expect(paramChange).toBeDefined();
    expect(paramChange?.severity).toBe('breaking');
    expect(paramChange?.message).toContain('New required parameter');
  });

  it('should detect info change when an optional parameter is added', () => {
    const modifiedSpec: OpenAPISpec = JSON.parse(JSON.stringify(baseSpec));
    modifiedSpec.paths['/pets']?.get?.parameters?.push({
      name: 'filter',
      in: 'query',
      required: false,
      schema: { type: 'string' }
    });

    const result = SchemaDiff.compare(baseSpec, modifiedSpec);
    expect(result.hasBreakingChanges).toBe(false);
    const paramChange = result.changes.find(c => c.path === 'parameters.filter');
    expect(paramChange).toBeDefined();
    expect(paramChange?.severity).toBe('info');
  });

  it('should detect breaking change when parameter type changes', () => {
    const modifiedSpec: OpenAPISpec = JSON.parse(JSON.stringify(baseSpec));
    const limitParam = modifiedSpec.paths['/pets']?.get?.parameters?.find(p => p.name === 'limit');
    if (limitParam) {
      limitParam.schema = { type: 'string' };
    }

    const result = SchemaDiff.compare(baseSpec, modifiedSpec);
    expect(result.hasBreakingChanges).toBe(true);
    const typeChange = result.changes.find(c => c.path === 'parameters.limit.type');
    expect(typeChange).toBeDefined();
    expect(typeChange?.severity).toBe('breaking');
    expect(typeChange?.message).toContain('Parameter type changed');
  });

  it('should detect breaking change when enum values are deleted', () => {
    const targetSpec: OpenAPISpec = JSON.parse(JSON.stringify(baseSpec));
    const statusParam = targetSpec.paths['/pets']?.get?.parameters?.find(p => p.name === 'status');
    if (statusParam?.schema) {
      // baseSpec had ['available', 'pending', 'sold'], removing 'pending' and 'sold'
      statusParam.schema.enum = ['available'];
    }

    const result = SchemaDiff.compare(baseSpec, targetSpec);
    expect(result.hasBreakingChanges).toBe(true);
    const enumChange = result.changes.find(c => c.path === 'parameters.status.enum');
    expect(enumChange).toBeDefined();
    expect(enumChange?.severity).toBe('breaking');
    expect(enumChange?.message).toContain('Allowed enum values removed');
  });
});
