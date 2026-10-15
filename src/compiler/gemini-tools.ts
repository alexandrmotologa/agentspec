import type { GeminiFunctionDeclaration } from '../types/compiler.js';
import type { OpenAPISpec } from '../types/openapi.js';
import { ClaudeCompiler } from './claude-tools.js';

export class GeminiCompiler {
  /**
   * Compiles an OpenAPI spec into Google Gemini FunctionDeclarations format
   */
  static compile(spec: OpenAPISpec, options: { prune?: boolean; maxDescriptionLength?: number } = {}): GeminiFunctionDeclaration[] {
    const claudeTools = ClaudeCompiler.compile(spec, options);

    return claudeTools.map(ct => ({
      name: ct.name,
      description: ct.description,
      parameters: {
        type: 'OBJECT',
        properties: this.convertToGeminiSchema(ct.input_schema.properties),
        required: ct.input_schema.required
      }
    }));
  }

  private static convertToGeminiSchema(properties: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(properties)) {
      if (!val || typeof val !== 'object') {
        result[key] = val;
        continue;
      }

      const obj = { ...(val as Record<string, unknown>) };
      if (typeof obj.type === 'string') {
        obj.type = obj.type.toUpperCase();
      }

      if (obj.properties && typeof obj.properties === 'object') {
        obj.properties = this.convertToGeminiSchema(obj.properties as Record<string, unknown>);
      }

      if (obj.items && typeof obj.items === 'object') {
        const itemObj = { ...(obj.items as Record<string, unknown>) };
        if (typeof itemObj.type === 'string') {
          itemObj.type = itemObj.type.toUpperCase();
        }
        obj.items = itemObj;
      }

      result[key] = obj;
    }

    return result;
  }
}
