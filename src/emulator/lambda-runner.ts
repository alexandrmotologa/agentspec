import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BedrockLambdaEvent, BedrockLambdaResponse } from '../types/bedrock.js';

export interface LambdaExecutionResult {
  output?: BedrockLambdaResponse | unknown;
  durationMs: number;
  logs: string[];
  error?: Error;
}

export type LambdaHandlerFn = (
  event: BedrockLambdaEvent,
  context?: Record<string, unknown>
) => Promise<BedrockLambdaResponse | unknown> | BedrockLambdaResponse | unknown;

export class LambdaRunner {
  private handlerPath: string;
  private cachedHandler?: LambdaHandlerFn;

  constructor(handlerPath: string) {
    this.handlerPath = path.resolve(handlerPath);
    if (!fs.existsSync(this.handlerPath)) {
      throw new Error(`Lambda handler file not found at path: ${this.handlerPath}`);
    }
  }

  /**
   * Loads or reloads the handler function from disk
   */
  async loadHandler(): Promise<LambdaHandlerFn> {
    const fileUrl = pathToFileURL(this.handlerPath).href;
    // Cache bust using timestamp query param
    const cacheBustedUrl = `${fileUrl}?update=${Date.now()}`;

    try {
      const module = await import(cacheBustedUrl);
      const handlerFn = module.handler || module.default || module;

      if (typeof handlerFn !== 'function') {
        throw new Error(
          `Module at "${this.handlerPath}" does not export a "handler" function or default function.`
        );
      }

      this.cachedHandler = handlerFn as LambdaHandlerFn;
      return handlerFn as LambdaHandlerFn;
    } catch (err) {
      throw new Error(`Failed to load Lambda handler from "${this.handlerPath}": ${String(err)}`);
    }
  }

  /**
   * Executes the handler with the given Bedrock event and captures logs & timing
   */
  async execute(event: BedrockLambdaEvent): Promise<LambdaExecutionResult> {
    const handler = await this.loadHandler();
    const logs: string[] = [];

    // Intercept console output during execution
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const logIntercepter = (level: string, ...args: unknown[]) => {
      const formatted = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      logs.push(`[${level.toUpperCase()}] ${formatted}`);
    };

    console.log = (...args) => {
      logIntercepter('info', ...args);
      origLog(...args);
    };
    console.warn = (...args) => {
      logIntercepter('warn', ...args);
      origWarn(...args);
    };
    console.error = (...args) => {
      logIntercepter('error', ...args);
      origError(...args);
    };

    const startTime = performance.now();
    let output: BedrockLambdaResponse | unknown;
    let error: Error | undefined;

    try {
      const context = {
        awsRequestId: `agentspec-req-${Math.random().toString(36).substring(2, 10)}`,
        functionName: path.basename(this.handlerPath),
        memoryLimitInMB: '1024',
        invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:agentspec-local',
        getRemainingTimeInMillis: () => 300000
      };

      output = await handler(event, context);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      logs.push(`[ERROR] Uncaught exception in handler: ${error.message}\n${error.stack || ''}`);
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      output,
      durationMs,
      logs,
      error
    };
  }
}
