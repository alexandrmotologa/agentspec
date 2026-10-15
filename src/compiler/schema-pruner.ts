import type { OpenAPISchema, OpenAPISpec } from '../types/openapi.js';
import type { TokenMetrics } from '../types/compiler.js';

export interface PruneOptions {
  maxDescriptionLength?: number;
  removeTitles?: boolean;
  removeExamples?: boolean;
  removeVendorExtensions?: boolean;
  stripReadWriteOnly?: 'readOnly' | 'writeOnly' | 'none';
}

const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
  maxDescriptionLength: 180,
  removeTitles: true,
  removeExamples: true,
  removeVendorExtensions: true,
  stripReadWriteOnly: 'none'
};

export class SchemaPruner {
  /**
   * Prunes an OpenAPI schema or object to minimize LLM token consumption
   */
  static pruneSchema(schema: OpenAPISchema, options: PruneOptions = {}): OpenAPISchema {
    const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
    return this.walkAndPrune(schema, opts) as OpenAPISchema;
  }

  /**
   * Prunes an entire OpenAPI specification
   */
  static pruneSpec(spec: OpenAPISpec, options: PruneOptions = {}): OpenAPISpec {
    const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
    const cloned = JSON.parse(JSON.stringify(spec)) as OpenAPISpec;

    // Prune paths
    if (cloned.paths) {
      for (const [route, pathItem] of Object.entries(cloned.paths)) {
        if (opts.removeVendorExtensions) {
          for (const key of Object.keys(pathItem)) {
            if (key.startsWith('x-')) delete (pathItem as Record<string, unknown>)[key];
          }
        }

        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
        for (const m of methods) {
          const op = pathItem[m];
          if (!op) continue;

          if (opts.removeVendorExtensions) {
            for (const key of Object.keys(op)) {
              if (key.startsWith('x-')) delete (op as Record<string, unknown>)[key];
            }
          }

          if (op.description && opts.maxDescriptionLength && op.description.length > opts.maxDescriptionLength) {
            op.description = `${op.description.slice(0, opts.maxDescriptionLength).trim()}...`;
          }

          if (op.parameters) {
            op.parameters = op.parameters.map(p => {
              const prunedP = { ...p };
              if (opts.removeExamples) {
                delete prunedP.example;
                delete prunedP.examples;
              }
              if (opts.removeVendorExtensions) {
                for (const key of Object.keys(prunedP)) {
                  if (key.startsWith('x-')) delete (prunedP as Record<string, unknown>)[key];
                }
              }
              if (prunedP.schema) {
                prunedP.schema = this.pruneSchema(prunedP.schema, opts);
              }
              return prunedP;
            });
          }

          if (op.requestBody?.content) {
            for (const media of Object.values(op.requestBody.content)) {
              if (opts.removeExamples) {
                delete media.example;
                delete media.examples;
              }
              if (media.schema) {
                media.schema = this.pruneSchema(media.schema, opts);
              }
            }
          }

          if (op.responses) {
            for (const resp of Object.values(op.responses)) {
              if (resp.content) {
                for (const media of Object.values(resp.content)) {
                  if (opts.removeExamples) {
                    delete media.example;
                    delete media.examples;
                  }
                  if (media.schema) {
                    media.schema = this.pruneSchema(media.schema, opts);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Prune components
    if (cloned.components?.schemas) {
      for (const [name, schema] of Object.entries(cloned.components.schemas)) {
        cloned.components.schemas[name] = this.pruneSchema(schema, opts);
      }
    }

    return cloned;
  }

  private static walkAndPrune(node: unknown, opts: PruneOptions): unknown {
    if (!node || typeof node !== 'object') {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map(item => this.walkAndPrune(item, opts));
    }

    const obj = { ...(node as Record<string, unknown>) };

    // Remove examples
    if (opts.removeExamples) {
      delete obj.example;
      delete obj.examples;
      delete obj.default;
    }

    // Remove titles
    if (opts.removeTitles) {
      delete obj.title;
    }

    // Remove vendor extensions and metadata
    if (opts.removeVendorExtensions) {
      for (const k of Object.keys(obj)) {
        if (k.startsWith('x-')) delete obj[k];
      }
    }
    delete obj.xml;
    delete obj.externalDocs;

    // Filter readOnly / writeOnly if configured
    if (opts.stripReadWriteOnly === 'readOnly' && obj.readOnly) {
      return undefined;
    }
    if (opts.stripReadWriteOnly === 'writeOnly' && obj.writeOnly) {
      return undefined;
    }

    // Trim description
    if (typeof obj.description === 'string' && opts.maxDescriptionLength) {
      if (obj.description.length > opts.maxDescriptionLength) {
        obj.description = `${obj.description.slice(0, opts.maxDescriptionLength).trim()}...`;
      }
    }

    // Recursively prune properties
    if (obj.properties && typeof obj.properties === 'object') {
      const prunedProps: Record<string, unknown> = {};
      for (const [pKey, pVal] of Object.entries(obj.properties as Record<string, unknown>)) {
        const pruned = this.walkAndPrune(pVal, opts);
        if (pruned !== undefined) {
          prunedProps[pKey] = pruned;
        }
      }
      obj.properties = prunedProps;
    }

    if (obj.items) {
      obj.items = this.walkAndPrune(obj.items, opts);
    }

    if (Array.isArray(obj.allOf)) {
      obj.allOf = obj.allOf.map(item => this.walkAndPrune(item, opts)).filter(Boolean);
    }
    if (Array.isArray(obj.anyOf)) {
      obj.anyOf = obj.anyOf.map(item => this.walkAndPrune(item, opts)).filter(Boolean);
    }
    if (Array.isArray(obj.oneOf)) {
      obj.oneOf = obj.oneOf.map(item => this.walkAndPrune(item, opts)).filter(Boolean);
    }

    return obj;
  }

  /**
   * Estimates token count for a JSON or string object using realistic BPE heuristic
   * (average ~3.7 characters per token for JSON payload structures)
   */
  static estimateTokens(data: unknown): number {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    if (!serialized) return 0;
    // Account for word boundaries, punctuation, quotes, brackets
    return Math.ceil(serialized.length / 3.75);
  }

  /**
   * Calculates token savings metrics between original and pruned schemas
   */
  static calculateMetrics(original: unknown, pruned: unknown): TokenMetrics {
    const originalTokens = this.estimateTokens(original);
    const prunedTokens = this.estimateTokens(pruned);
    const savedTokens = Math.max(0, originalTokens - prunedTokens);
    const reductionPercentage = originalTokens > 0
      ? Math.round((savedTokens / originalTokens) * 1000) / 10
      : 0;

    return {
      originalTokens,
      prunedTokens,
      savedTokens,
      reductionPercentage
    };
  }
}
