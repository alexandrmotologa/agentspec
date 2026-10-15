import { Command } from 'commander';
import { compileCommand } from './commands/compile.js';
import { simulateCommand } from './commands/simulate.js';
import { testCommand } from './commands/test.js';
import { inspectCommand } from './commands/inspect.js';

const program = new Command();

program
  .name('agentspec')
  .description('OpenAPI to AWS Bedrock Action Group & Claude Tool compiler with local Lambda emulator')
  .version('1.0.0');

program
  .command('compile')
  .description('Compile OpenAPI specification into Claude tools, Bedrock action groups, and TypeScript types')
  .argument('<spec>', 'Path to OpenAPI or Swagger file (JSON or YAML)')
  .option('-t, --target <target>', 'Target artifact (claude, bedrock, types, cdk, terraform, all)', 'all')
  .option('-o, --output <dir>', 'Output directory for compiled artifacts', './agentspec-output')
  .option('-p, --prune', 'Prune schema bloat to reduce LLM token usage (default: true)', true)
  .option('--no-prune', 'Disable token optimization and keep raw schema metadata')
  .option('-m, --minify', 'Minify generated JSON files', false)
  .option('--action-group <name>', 'Custom name for the AWS Bedrock action group')
  .option('--lambda-arn <arn>', 'Target Lambda ARN for Bedrock executor')
  .action(compileCommand);

program
  .command('simulate')
  .description('Start local Bedrock Lambda fulfillment emulator and interactive testing studio')
  .argument('<spec>', 'Path to OpenAPI or Swagger file')
  .requiredOption('-h, --handler <file>', 'Path to local TypeScript/JavaScript Lambda handler')
  .option('-p, --port <port>', 'Port for emulator server', '5005')
  .option('--host <host>', 'Host address for emulator', '127.0.0.1')
  .option('--action-group <name>', 'Mock action group name', 'LocalActionGroup')
  .action(simulateCommand);

program
  .command('test')
  .description('Run automated boundary fuzzing and schema compliance tests against local Lambda handler')
  .argument('<spec>', 'Path to OpenAPI or Swagger file')
  .requiredOption('-h, --handler <file>', 'Path to local TypeScript/JavaScript Lambda handler')
  .option('-n, --max-cases <count>', 'Maximum test cases generated per operation')
  .option('--action-group <name>', 'Mock action group name', 'FuzzActionGroup')
  .option('--op <operationId>', 'Filter tests to a specific operation ID')
  .option('--llm <model>', 'Run optional live tool-calling test against Claude API')
  .action(testCommand);

program
  .command('inspect')
  .description('Inspect OpenAPI operations, parameter complexity, and token savings')
  .argument('<spec>', 'Path to OpenAPI or Swagger file')
  .action(inspectCommand);

export async function runCli() {
  await program.parseAsync(process.argv);
}

if (process.argv[1]?.endsWith('agentspec') || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('agentspec.js')) {
  runCli();
}
