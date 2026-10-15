import type { BedrockLambdaEvent, BedrockLambdaResponse } from './bedrock.js';

export interface EmulatorServerOptions {
  port: number;
  host: string;
  specPath: string;
  handlerPath: string;
  actionGroupName?: string;
  verbose?: boolean;
}

export interface InvocationRequest {
  toolName?: string;
  method?: string;
  path?: string;
  parameters?: Record<string, string | number | boolean>;
  body?: unknown;
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
  expected?: unknown;
  received?: unknown;
}

export interface InvocationResult {
  statusCode: number;
  event: BedrockLambdaEvent;
  response?: BedrockLambdaResponse;
  rawOutput?: unknown;
  durationMs: number;
  validationErrors: ValidationErrorDetail[];
  logs: string[];
}
