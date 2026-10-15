import type { ClaudeTool, ClaudeToolInputSchema } from '../types/claude.js';
import type { OpenAPISpec, OpenAPISchema } from '../types/openapi.js';
import { OpenAPILoader } from './openapi-loader.js';
import { SchemaPruner } from './schema-pruner.js';

export interface ClaudeCompilerOptions {
  prune?: boolean;
  maxDescriptionLength?: number;
}

export class ClaudeCompiler {
  /**
   * Compiles an OpenAPI spec into an array of Anthropic Claude Tool definitions
   */
  static compile(spec: OpenAPISpec, options: ClaudeCompilerOptions = {}): ClaudeTool[] {
    const operations = OpenAPILoader.extractOperations(spec);
    const tools: ClaudeTool[] = [];

    for (const op of operations) {
      // 1. Sanitize tool name: 1-64 chars, a-zA-Z0-9_-
      let name = op.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (name.length > 64) {
        name = name.substring(0, 64);
      }

      // 2. Build human-readable description
      let description = op.description || op.summary || `${op.method.toUpperCase()} ${op.path}`;
      if (op.summary && op.description && op.summary !== op.description) {
        description = `${op.summary}. ${op.description}`;
      }
      description = `[${op.method.toUpperCase()} ${op.path}] ${description}`.trim();

      if (options.maxDescriptionLength && description.length > options.maxDescriptionLength) {
        description = `${description.substring(0, options.maxDescriptionLength).trim()}...`;
      }

      // 3. Assemble unified input schema
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      // Add path, query, header parameters
      for (const param of op.parameters) {
        const paramSchema: OpenAPISchema = param.schema ? { ...param.schema } : { type: 'string' };

        if (param.description && !paramSchema.description) {
          paramSchema.description = param.description;
        }

        properties[param.name] = options.prune ? SchemaPruner.pruneSchema(paramSchema) : paramSchema;

        if (param.required) {
          required.push(param.name);
        }
      }

      // Add request body properties
      if (op.requestBodySchema) {
        const bodySchema = op.requestBodySchema;

        if (bodySchema.type === 'object' && bodySchema.properties) {
          // If body is object, merge top-level properties or nest under requestBody if collision
          for (const [propKey, propVal] of Object.entries(bodySchema.properties)) {
            if (properties[propKey]) {
              // Collision between parameter and body property -> keep parameter, nest under body
              properties[`body_${propKey}`] = options.prune ? SchemaPruner.pruneSchema(propVal) : propVal;
            } else {
              properties[propKey] = options.prune ? SchemaPruner.pruneSchema(propVal) : propVal;
              if (bodySchema.required?.includes(propKey) && op.requestBodyRequired) {
                required.push(propKey);
              }
            }
          }
        } else {
          // Non-object body or arbitrary body -> put under 'body'
          properties['body'] = options.prune ? SchemaPruner.pruneSchema(bodySchema) : bodySchema;
          if (op.requestBodyRequired) {
            required.push('body');
          }
        }
      }

      const inputSchema: ClaudeToolInputSchema = {
        type: 'object',
        properties,
        additionalProperties: false
      };

      if (required.length > 0) {
        inputSchema.required = Array.from(new Set(required));
      }

      tools.push({
        name,
        description,
        input_schema: inputSchema
      });
    }

    return tools;
  }
}
