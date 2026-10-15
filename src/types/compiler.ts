import type { ClaudeTool } from './claude.js';
import type { BedrockActionGroupPayload } from './bedrock.js';
import type { OpenAPISpec } from './openapi.js';

export type TargetPlatform = 'claude' | 'bedrock' | 'types' | 'cdk' | 'terraform' | 'openai' | 'gemini' | 'mcp' | 'all';

export interface CompilerOptions {
  target?: TargetPlatform;
  outputDir?: string;
  prune?: boolean;
  minify?: boolean;
  actionGroupName?: string;
  lambdaArn?: string;
  includeResponses?: boolean;
}

export interface TokenMetrics {
  originalTokens: number;
  prunedTokens: number;
  savedTokens: number;
  reductionPercentage: number;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface CompilationArtifacts {
  claudeTools?: ClaudeTool[];
  bedrockActionGroup?: {
    spec: OpenAPISpec;
    payload: BedrockActionGroupPayload;
  };
  cdkSnippet?: string;
  terraformSnippet?: string;
  typeDefinitions?: string;
  zodSchemas?: string;
  openaiTools?: OpenAITool[];
  geminiDeclarations?: GeminiFunctionDeclaration[];
  mcpServerSnippet?: string;
  mcpTools?: MCPToolDefinition[];
  metrics: TokenMetrics;
}
