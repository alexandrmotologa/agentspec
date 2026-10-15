import type { ClaudeTool } from '../types/claude.js';

export interface LiveModelTestOptions {
  model?: string;
  anthropicApiKey?: string;
  userPrompt?: string;
}

export interface LiveModelTestResult {
  supported: boolean;
  model: string;
  toolCallTriggered: boolean;
  selectedToolName?: string;
  toolInput?: Record<string, unknown>;
  rawResponse?: unknown;
  message?: string;
}

export class LiveModelRunner {
  /**
   * Tests whether an LLM (such as Claude Sonnet) selects and executes the compiled tools
   */
  static async testClaudeTools(
    tools: ClaudeTool[],
    options: LiveModelTestOptions = {}
  ): Promise<LiveModelTestResult> {
    const apiKey = options.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    const model = options.model || 'claude-3-5-sonnet-20241022';

    if (!apiKey) {
      return {
        supported: false,
        model,
        toolCallTriggered: false,
        message: 'ANTHROPIC_API_KEY environment variable not set. Skipping live LLM test.'
      };
    }

    const prompt = options.userPrompt || 'Please inspect the available tools and call the appropriate tool with test parameters.';

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema
          }))
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          supported: true,
          model,
          toolCallTriggered: false,
          message: `Anthropic API error (${response.status}): ${errorText}`
        };
      }

      const data = await response.json() as {
        content: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
      };

      const toolUseBlock = data.content?.find(c => c.type === 'tool_use');

      return {
        supported: true,
        model,
        toolCallTriggered: Boolean(toolUseBlock),
        selectedToolName: toolUseBlock?.name,
        toolInput: toolUseBlock?.input,
        rawResponse: data,
        message: toolUseBlock
          ? `Model successfully invoked tool: ${toolUseBlock.name}`
          : 'Model responded with text without invoking a tool.'
      };
    } catch (err) {
      return {
        supported: true,
        model,
        toolCallTriggered: false,
        message: `Network failure connecting to Anthropic API: ${String(err)}`
      };
    }
  }
}
