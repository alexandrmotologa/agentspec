export interface ClaudeToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: ClaudeToolInputSchema;
}

export interface ClaudeToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
