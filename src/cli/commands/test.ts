import pc from 'picocolors';
import { FuzzRunner } from '../../testing/fuzz-runner.js';
import { TestReporter } from '../../testing/test-reporter.js';
import { LiveModelRunner } from '../../testing/live-model-runner.js';
import { ClaudeCompiler } from '../../compiler/claude-tools.js';
import { OpenAPILoader } from '../../compiler/openapi-loader.js';

export interface TestCommandOptions {
  handler: string;
  actionGroup?: string;
  maxCases?: string;
  op?: string;
  llm?: string;
}

export async function testCommand(specPath: string, options: TestCommandOptions) {
  if (!options.handler) {
    console.error(pc.red('\n Error: --handler <file.ts> is required for testing\n'));
    process.exit(1);
  }

  const maxTestCasesPerOp = options.maxCases ? parseInt(options.maxCases, 10) : undefined;
  const operationFilter = options.op ? [options.op] : undefined;

  try {
    console.log(pc.cyan(`\n Running adversarial schema fuzzing against: ${options.handler}...`));

    const runner = new FuzzRunner({
      specPath,
      handlerPath: options.handler,
      actionGroupName: options.actionGroup,
      maxTestCasesPerOp,
      operationFilter
    });

    const suiteResult = await runner.run();
    const reportText = TestReporter.render(suiteResult);
    console.log(reportText);

    // Optional Live Model Test
    if (options.llm) {
      console.log(pc.bold(pc.cyan('\n Running Live LLM Tool Selection Test...')));
      const spec = OpenAPILoader.load(specPath);
      const tools = ClaudeCompiler.compile(spec, { prune: true });
      const liveResult = await LiveModelRunner.testClaudeTools(tools, {
        model: options.llm
      });

      if (!liveResult.supported) {
        console.log(pc.yellow(` ${liveResult.message}\n`));
      } else if (liveResult.toolCallTriggered) {
        console.log(pc.green(` ✓ Live Model (${liveResult.model}) invoked tool: ${pc.bold(liveResult.selectedToolName!)}`));
        console.log(`   ${pc.dim('Input parameters:')} ${JSON.stringify(liveResult.toolInput)}\n`);
      } else {
        console.log(pc.red(` ✗ Live Model (${liveResult.model}) failed to trigger tool use.`));
        console.log(`   ${pc.dim('Response:')} ${liveResult.message}\n`);
      }
    }

    if (suiteResult.failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(pc.red(`\n Test execution failed: ${String(err)}\n`));
    process.exit(1);
  }
}
