import type { OpenAPISpec, NormalizedOperation } from '../types/openapi.js';
import type { TestCase } from './boundary-generator.js';
import type { BedrockLambdaResponse } from '../types/bedrock.js';
import { OpenAPILoader } from '../compiler/openapi-loader.js';
import { BoundaryGenerator } from './boundary-generator.js';
import { LambdaRunner } from '../emulator/lambda-runner.js';
import { BedrockEnvelope } from '../emulator/bedrock-envelope.js';
import { ResponseValidator } from '../emulator/response-validator.js';

export interface TestExecutionResult {
  testCase: TestCase;
  passed: boolean;
  statusCode: number;
  durationMs: number;
  failureReason?: string;
  response?: BedrockLambdaResponse;
  logs: string[];
}

export interface FuzzSuiteResult {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  averageDurationMs: number;
  results: TestExecutionResult[];
}

export interface FuzzRunnerOptions {
  specPath: string;
  handlerPath: string;
  actionGroupName?: string;
  operationFilter?: string[];
  maxTestCasesPerOp?: number;
}

export class FuzzRunner {
  private spec: OpenAPISpec;
  private operations: NormalizedOperation[];
  private runner: LambdaRunner;
  private options: FuzzRunnerOptions;

  constructor(options: FuzzRunnerOptions) {
    this.options = options;
    this.spec = OpenAPILoader.load(options.specPath);
    this.operations = OpenAPILoader.extractOperations(this.spec);
    this.runner = new LambdaRunner(options.handlerPath);
  }

  /**
   * Runs the complete fuzzing and regression test matrix
   */
  async run(): Promise<FuzzSuiteResult> {
    const results: TestExecutionResult[] = [];
    let opsToTest = this.operations;

    if (this.options.operationFilter && this.options.operationFilter.length > 0) {
      opsToTest = opsToTest.filter(op => this.options.operationFilter!.includes(op.id));
    }

    for (const op of opsToTest) {
      let testCases = BoundaryGenerator.generateTestCases(op);
      if (this.options.maxTestCasesPerOp && testCases.length > this.options.maxTestCasesPerOp) {
        testCases = testCases.slice(0, this.options.maxTestCasesPerOp);
      }

      for (const tc of testCases) {
        const result = await this.executeTestCase(op, tc);
        results.push(result);
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

    return {
      totalTests: results.length,
      passedCount,
      failedCount,
      passRate: results.length > 0 ? Math.round((passedCount / results.length) * 1000) / 10 : 0,
      averageDurationMs: results.length > 0 ? Math.round((totalDuration / results.length) * 100) / 100 : 0,
      results
    };
  }

  private async executeTestCase(op: NormalizedOperation, tc: TestCase): Promise<TestExecutionResult> {
    const event = BedrockEnvelope.synthesize(
      op,
      tc.parameters,
      tc.body,
      {
        actionGroup: this.options.actionGroupName || 'FuzzActionGroup'
      }
    );

    const execResult = await this.runner.execute(event);

    if (execResult.error) {
      return {
        testCase: tc,
        passed: false,
        statusCode: 500,
        durationMs: execResult.durationMs,
        failureReason: `Unhandled exception in handler: ${execResult.error.message}`,
        logs: execResult.logs
      };
    }

    const validation = ResponseValidator.validate(event, execResult.output, op);
    const statusCode = validation.statusCode;
    let passed = false;
    let failureReason: string | undefined;

    if (tc.expectedStatus === '2xx') {
      if (statusCode >= 200 && statusCode < 300) {
        if (validation.isValid) {
          passed = true;
        } else {
          passed = false;
          failureReason = `Status was ${statusCode}, but response failed OpenAPI schema: ${validation.errors.map(e => `[${e.path}] ${e.message}`).join(', ')}`;
        }
      } else {
        passed = false;
        failureReason = `Expected 2xx status code for happy path, received HTTP ${statusCode}`;
      }
    } else if (tc.expectedStatus === '4xx') {
      if (statusCode >= 400 && statusCode < 500) {
        passed = true;
      } else if (statusCode >= 200 && statusCode < 300) {
        passed = false;
        failureReason = `Adversarial test passed silently (HTTP ${statusCode}). Handler failed to reject invalid request payload.`;
      } else {
        passed = false;
        failureReason = `Handler crashed with HTTP ${statusCode} on invalid input instead of returning a clean 4xx client validation error.`;
      }
    } else {
      passed = true;
    }

    return {
      testCase: tc,
      passed,
      statusCode,
      durationMs: execResult.durationMs,
      failureReason,
      response: execResult.output as BedrockLambdaResponse,
      logs: execResult.logs
    };
  }
}
