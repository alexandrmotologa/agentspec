import pc from 'picocolors';
import Table from 'cli-table3';
import { SchemaDiff } from '../../testing/schema-diff.js';

export interface DiffCommandOptions {
  failOnBreaking?: boolean;
}

export async function diffCommand(oldSpecPath: string, newSpecPath: string, options: DiffCommandOptions) {
  try {
    console.log(pc.cyan(`\n Comparing OpenAPI specifications for Agent Tool Breaking Changes:`));
    console.log(pc.dim(`  Baseline: ${oldSpecPath}`));
    console.log(pc.dim(`  Target:   ${newSpecPath}\n`));

    const result = SchemaDiff.compare(oldSpecPath, newSpecPath);

    if (result.changes.length === 0) {
      console.log(pc.green(' ✓ No differences detected between specifications. 100% compatible.\n'));
      return;
    }

    const table = new Table({
      head: [pc.bold('Severity'), pc.bold('Operation'), pc.bold('Target Path'), pc.bold('Description')],
      colWidths: [12, 22, 26, 48]
    });

    for (const change of result.changes) {
      const sevBadge = change.severity === 'breaking'
        ? pc.red(pc.bold(' BREAKING '))
        : change.severity === 'warning'
        ? pc.yellow(pc.bold(' WARN '))
        : pc.cyan(pc.bold(' INFO '));

      table.push([
        sevBadge,
        change.operationId,
        change.path,
        change.message
      ]);
    }

    console.log(table.toString());
    console.log('\n' + pc.bold('Diff Summary:'));
    console.log(`  ${pc.red(`${result.breakingCount} breaking changes`)}`);
    console.log(`  ${pc.yellow(`${result.warningCount} warnings`)}`);
    console.log(`  ${pc.cyan(`${result.infoCount} informational changes`)}\n`);

    if (options.failOnBreaking && result.hasBreakingChanges) {
      console.error(pc.red(' FAILED: Breaking changes detected in specification for agent tool calling.\n'));
      process.exit(1);
    }
  } catch (err) {
    console.error(pc.red(`\n Failed to execute diff: ${String(err)}\n`));
    process.exit(1);
  }
}
