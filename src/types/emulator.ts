import type { BedrockLambdaEvent, BedrockLambdaResponse } from './bedrock.js';

export interface EmulatorServerOptions {
  port: number;
  host: string;
  specPath: string;
  handlerPath?: string;
  mockMode?: boolean;
  actionGroupName?: string;
  verbose?: boolean;
}

export interface InvocationRequest {
  toolName?: string;
  operationId?: string;
  method?: string;
  path?: string;
  parameters?: Record<string, unknown>;
  body?: unknown;
  sessionId?: string;
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
  expected?: unknown;
  received?: unknown;
}

export interface SessionState {
  sessionId: string;
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
  invocationHistory: Array<{
    timestamp: number;
    operationId: string;
    statusCode: number;
    durationMs: number;
  }>;
}

export interface InvocationResult {
  statusCode: number;
  event: BedrockLambdaEvent;
  response?: BedrockLambdaResponse;
  rawOutput?: unknown;
  durationMs: number;
  validationErrors: ValidationErrorDetail[];
  logs: string[];
  session?: SessionState;
}
