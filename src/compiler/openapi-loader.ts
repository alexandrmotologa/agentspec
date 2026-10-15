import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type {
  OpenAPISpec,
  OpenAPISchema,
  OpenAPIParameter,
  OpenAPIRequestBody,
  NormalizedOperation,
  HTTPMethod,
  OpenAPIOperation
} from '../types/openapi.js';

export class OpenAPILoader {
  /**
   * Load and parse an OpenAPI or Swagger file from disk or raw string
   */
  static load(input: string): OpenAPISpec {
    let rawContent = input;

    // Check if input is a file path
    if (fs.existsSync(input)) {
      rawContent = fs.readFileSync(path.resolve(input), 'utf8');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      try {
        parsed = YAML.parse(rawContent);
      } catch (yamlErr) {
        throw new Error(`Failed to parse OpenAPI document as JSON or YAML: ${String(yamlErr)}`);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid OpenAPI specification: root must be an object');
    }

    const spec = parsed as Record<string, unknown>;

    // Swagger 2.0 to OpenAPI 3.0 conversion if needed
    if (spec.swagger && String(spec.swagger).startsWith('2.')) {
      return this.convertSwaggerToOpenAPI3(spec as unknown as OpenAPISpec);
    }

    if (!spec.openapi) {
      throw new Error('Invalid specification: neither "openapi" (3.x) nor "swagger" (2.0) version field found');
    }

    return spec as unknown as OpenAPISpec;
  }

  /**
   * Converts a Swagger 2.0 document into an OpenAPI 3.0 structure
   */
  static convertSwaggerToOpenAPI3(swagger: OpenAPISpec): OpenAPISpec {
    const openapi: OpenAPISpec = {
      openapi: '3.0.3',
      info: swagger.info || { title: 'Converted API', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {},
        responses: {},
        parameters: {}
      }
    };

    // Convert host / basePath / schemes to servers
    if (swagger.host || swagger.basePath || swagger.schemes) {
      const scheme = swagger.schemes?.[0] || 'https';
      const host = swagger.host || 'localhost';
      const basePath = swagger.basePath && swagger.basePath !== '/' ? swagger.basePath : '';
      openapi.servers = [{ url: `${scheme}://${host}${basePath}` }];
    }

    // Convert definitions to components.schemas
    if (swagger.definitions && openapi.components) {
      for (const [key, def] of Object.entries(swagger.definitions)) {
        openapi.components.schemas![key] = this.rewriteSwaggerRefs(def);
      }
    }

    // Convert global parameters
    if (swagger.parameters && openapi.components) {
      for (const [key, param] of Object.entries(swagger.parameters)) {
        openapi.components.parameters![key] = this.convertParameterToV3(param);
      }
    }

    // Convert paths & operations
    if (swagger.paths) {
      for (const [route, pathItem] of Object.entries(swagger.paths)) {
        openapi.paths[route] = {};
        const methods: HTTPMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

        for (const m of methods) {
          const op = pathItem[m];
          if (!op) continue;

          const newOp: OpenAPIOperation = {
            summary: op.summary,
            description: op.description,
            operationId: op.operationId,
            tags: op.tags,
            deprecated: op.deprecated,
            parameters: [],
            responses: {}
          };

          // Process parameters & body
          if (Array.isArray(op.parameters)) {
            for (const param of op.parameters) {
              if (param.in === 'body') {
                const bodySchema = (param as { schema?: OpenAPISchema }).schema;
                newOp.requestBody = {
                  description: param.description,
                  required: param.required ?? true,
                  content: {
                    'application/json': {
                      schema: this.rewriteSwaggerRefs(bodySchema || { type: 'object' })
                    }
                  }
                };
              } else {
                newOp.parameters!.push(this.convertParameterToV3(param));
              }
            }
          }

          // Process responses
          if (op.responses) {
            for (const [code, resp] of Object.entries(op.responses)) {
              if (resp.schema) {
                newOp.responses![code] = {
                  description: resp.description || '',
                  content: {
                    'application/json': {
                      schema: this.rewriteSwaggerRefs(resp.schema)
                    }
                  }
                };
              } else {
                newOp.responses![code] = {
                  description: resp.description || ''
                };
              }
            }
          }

          openapi.paths[route][m] = newOp;
        }
      }
    }

    return openapi;
  }

  private static rewriteSwaggerRefs(obj: unknown): OpenAPISchema {
    if (!obj || typeof obj !== 'object') return obj as OpenAPISchema;
    if (Array.isArray(obj)) {
      return obj.map(item => this.rewriteSwaggerRefs(item)) as unknown as OpenAPISchema;
    }

    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') {
        res[k] = v.replace('#/definitions/', '#/components/schemas/');
      } else {
        res[k] = this.rewriteSwaggerRefs(v);
      }
    }
    return res as OpenAPISchema;
  }

  private static convertParameterToV3(param: OpenAPIParameter): OpenAPIParameter {
    const copy = { ...param };
    if (!copy.schema) {
      copy.schema = {
        type: copy.type || 'string',
        format: copy.format,
        items: copy.items
      };
      delete copy.type;
      delete copy.items;
      delete copy.format;
    }
    return copy;
  }

  /**
   * Resolves all $ref references within a spec, safely breaking circular references
   */
  static dereference(spec: OpenAPISpec): OpenAPISpec {
    const activeObjects = new Set<object>();
    const activeRefs = new Set<string>();

    const resolveRef = (ref: string): unknown => {
      if (!ref.startsWith('#/')) {
        // External file or URL refs are handled gracefully or returned as placeholder
        return { type: 'object', description: `External ref: ${ref}` };
      }

      const parts = ref.substring(2).split('/');
      let current: unknown = spec;

      for (const part of parts) {
        if (!current || typeof current !== 'object') return undefined;
        const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
        current = (current as Record<string, unknown>)[decodedPart];
      }

      return current;
    };

    const walk = (node: unknown, currentRefName?: string): unknown => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      if (activeObjects.has(node)) {
        const typeName = currentRefName ? currentRefName.split('/').pop() : 'RecursiveObject';
        return {
          type: 'object',
          description: `Circular reference to ${typeName}`,
          properties: {}
        };
      }

      if (Array.isArray(node)) {
        activeObjects.add(node);
        const arrResult = node.map(item => walk(item, currentRefName));
        activeObjects.delete(node);
        return arrResult;
      }

      const objNode = node as Record<string, unknown>;

      // Check if this is a $ref node
      if (typeof objNode.$ref === 'string') {
        const refStr = objNode.$ref;
        if (activeRefs.has(refStr)) {
          const typeName = refStr.split('/').pop() || 'RecursiveObject';
          return {
            type: 'object',
            description: `Circular reference to ${typeName}`,
            properties: {}
          };
        }

        activeRefs.add(refStr);
        const resolvedTarget = resolveRef(refStr);
        let resolvedResult: unknown;

        if (resolvedTarget !== undefined) {
          resolvedResult = walk(resolvedTarget, refStr);
        } else {
          resolvedResult = { type: 'object', description: `Unresolved ref: ${refStr}` };
        }

        activeRefs.delete(refStr);
        return resolvedResult;
      }

      activeObjects.add(node);
      const clonedObj: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(objNode)) {
        clonedObj[key] = walk(val, currentRefName);
      }

      activeObjects.delete(node);
      return clonedObj;
    };

    return walk(spec) as OpenAPISpec;
  }

  /**
   * Extracts normalized operations from the specification
   */
  static extractOperations(spec: OpenAPISpec): NormalizedOperation[] {
    const dereferenced = this.dereference(spec);
    const operations: NormalizedOperation[] = [];
    const methods: HTTPMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

    for (const [routePath, pathItem] of Object.entries(dereferenced.paths || {})) {
      const globalParams = pathItem.parameters || [];

      for (const method of methods) {
        const op = pathItem[method];
        if (!op) continue;

        // Compute deterministic operation ID
        let opId = op.operationId;
        if (!opId) {
          const sanitizedPath = routePath
            .replace(/[{}]/g, '')
            .split('/')
            .filter(Boolean)
            .join('_');
          opId = `${method}_${sanitizedPath || 'root'}`;
        }
        // Normalize operationId to valid identifier
        opId = opId.replace(/[^a-zA-Z0-9_]/g, '_');

        // Merge path-level and operation-level parameters
        const opParams = op.parameters || [];
        const paramMap = new Map<string, OpenAPIParameter>();
        for (const p of [...globalParams, ...opParams]) {
          paramMap.set(`${p.in}:${p.name}`, p);
        }
        const parameters = Array.from(paramMap.values());

        // Extract request body schema
        let requestBodySchema: OpenAPISchema | undefined;
        let requestBodyRequired = false;
        if (op.requestBody?.content) {
          requestBodyRequired = op.requestBody.required ?? false;
          const jsonContent = op.requestBody.content['application/json']
            || op.requestBody.content['*/*']
            || Object.values(op.requestBody.content)[0];
          if (jsonContent?.schema) {
            requestBodySchema = jsonContent.schema;
          }
        }

        // Extract response schemas
        const responseSchemas: Record<string, OpenAPISchema> = {};
        if (op.responses) {
          for (const [statusCode, resp] of Object.entries(op.responses)) {
            if (resp.content) {
              const jsonResp = resp.content['application/json']
                || resp.content['*/*']
                || Object.values(resp.content)[0];
              if (jsonResp?.schema) {
                responseSchemas[statusCode] = jsonResp.schema;
              }
            }
          }
        }

        operations.push({
          id: opId,
          method,
          path: routePath,
          summary: op.summary || '',
          description: op.description || op.summary || '',
          parameters,
          requestBodySchema,
          requestBodyRequired,
          responseSchemas,
          tags: op.tags || []
        });
      }
    }

    return operations;
  }
}
