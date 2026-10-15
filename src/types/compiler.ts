import type { ClaudeTool } from './claude.js';
import type { BedrockActionGroupPayload } from './bedrock.js';
import type { OpenAPISpec } from './openapi.js';

export type TargetPlatform = 'claude' | 'bedrock' | 'types' | 'cdk' | 'terraform' | 'all';

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
  metrics: TokenMetrics;
}
