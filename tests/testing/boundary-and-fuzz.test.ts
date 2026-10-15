import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { BoundaryGenerator } from '../../src/testing/boundary-generator.js';
import { FuzzRunner } from '../../src/testing/fuzz-runner.js';
import { TestReporter } from '../../src/testing/test-reporter.js';

describe('BoundaryGenerator & FuzzRunner', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const sampleLambdaPath = path.resolve('tests/fixtures/sample-lambda.ts');
  const failingLambdaPath = path.resolve('tests/fixtures/failing-lambda.ts');

  it('should generate baseline and adversarial test cases for an operation', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const operations = OpenAPILoader.extractOperations(spec);
    const createPetOp = operations.find(o => o.id === 'createPet')!;

    const testCases = BoundaryGenerator.generateTestCases(createPetOp);
    expect(testCases.length).toBeGreaterThan(0);

    const baselineCase = testCases.find(t => t.category === 'valid_baseline');
    expect(baselineCase).toBeDefined();
    expect(baselineCase?.expectedStatus).toBe('2xx');

    const missingNameCase = testCases.find(t => t.id.includes('body_missing_name'));
    expect(missingNameCase).toBeDefined();
    expect(missingNameCase?.expectedStatus).toBe('4xx');
  });

  it('should execute fuzzing suite against sample-lambda and achieve high pass rate', async () => {
    const runner = new FuzzRunner({
      specPath: petstorePath,
      handlerPath: sampleLambdaPath,
      actionGroupName: 'PetFuzzGroup'
    });

    const suiteResult = await runner.run();
    expect(suiteResult.totalTests).toBeGreaterThan(5);
    expect(suiteResult.passRate).toBeGreaterThanOrEqual(90);

    const reportText = TestReporter.render(suiteResult);
    expect(reportText).toContain('AgentSpec Schema Validation & Fuzzing Suite');
    expect(reportText).toContain('Summary:');
    expect(reportText).toContain('passed');
  });

  it('should catch malformed handler that crashes or returns bad envelope', async () => {
    const runner = new FuzzRunner({
      specPath: petstorePath,
      handlerPath: failingLambdaPath,
      actionGroupName: 'FailGroup',
      maxTestCasesPerOp: 1
    });

    const suiteResult = await runner.run();
    expect(suiteResult.failedCount).toBeGreaterThan(0);
    expect(suiteResult.results[0].passed).toBe(false);
  });
});
