import type { OpenAITool } from '../types/compiler.js';
import type { OpenAPISpec } from '../types/openapi.js';
import { ClaudeCompiler } from './claude-tools.js';

export class OpenAICompiler {
  /**
   * Compiles an OpenAPI spec into an array of OpenAI Function Calling Tool definitions
   */
  static compile(spec: OpenAPISpec, options: { prune?: boolean; maxDescriptionLength?: number } = {}): OpenAITool[] {
    const claudeTools = ClaudeCompiler.compile(spec, options);

    return claudeTools.map(ct => ({
      type: 'function',
      function: {
        name: ct.name,
        description: ct.description,
        parameters: {
          type: 'object',
          properties: ct.input_schema.properties,
          required: ct.input_schema.required,
          additionalProperties: false
        }
      }
    }));
  }
}
