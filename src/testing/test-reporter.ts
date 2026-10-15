import Table from 'cli-table3';
import pc from 'picocolors';
import type { FuzzSuiteResult } from './fuzz-runner.js';

export class TestReporter {
  /**
   * Renders the test suite results as a clean formatted terminal report
   */
  static render(suiteResult: FuzzSuiteResult): string {
    const output: string[] = [];

    // Header
    output.push('');
    output.push(pc.bold(pc.cyan(' AgentSpec Schema Validation & Fuzzing Suite ')));
    output.push(pc.dim('---------------------------------------------------------'));

    // Main Test Matrix Table
    const table = new Table({
      head: [
        pc.bold('Status'),
        pc.bold('Test Case'),
        pc.bold('Category'),
        pc.bold('HTTP'),
        pc.bold('Latency')
      ],
      colWidths: [8, 38, 20, 8, 12],
      style: { head: [], border: [] }
    });

    for (const res of suiteResult.results) {
      const statusBadge = res.passed
        ? pc.green(pc.bold(' PASS '))
        : pc.red(pc.bold(' FAIL '));

      const truncatedName = res.testCase.name.length > 35
        ? `${res.testCase.name.substring(0, 32)}...`
        : res.testCase.name;

      const categoryLabel = this.formatCategory(res.testCase.category);
      const httpCode = res.statusCode >= 200 && res.statusCode < 300
        ? pc.green(String(res.statusCode))
        : res.statusCode >= 400 && res.statusCode < 500
        ? pc.yellow(String(res.statusCode))
        : pc.red(String(res.statusCode));

      table.push([
        statusBadge,
        truncatedName,
        categoryLabel,
        httpCode,
        `${res.durationMs}ms`
      ]);
    }

    output.push(table.toString());

    // Print Failures Section if any
    const failures = suiteResult.results.filter(r => !r.passed);
    if (failures.length > 0) {
      output.push('');
      output.push(pc.bold(pc.red(` FAILURES (${failures.length})`)));
      output.push(pc.dim('---------------------------------------------------------'));

      failures.forEach((f, idx) => {
        output.push(`${pc.bold(pc.red(`${idx + 1}. ${f.testCase.name}`))}`);
        output.push(`   ${pc.dim('Description:')} ${f.testCase.description}`);
        output.push(`   ${pc.dim('Expected:')}    ${f.testCase.expectedStatus.toUpperCase()} status`);
        output.push(`   ${pc.dim('Received:')}    HTTP ${f.statusCode}`);
        if (f.failureReason) {
          output.push(`   ${pc.red('Reason:')}      ${f.failureReason}`);
        }
        if (f.logs.length > 0) {
          output.push(`   ${pc.dim('Logs:')}`);
          f.logs.forEach(l => output.push(`     ${pc.dim(l)}`));
        }
        output.push('');
      });
    }

    // Summary Box
    output.push(pc.bold('Summary:'));
    const passRateStr = suiteResult.passRate === 100
      ? pc.green(pc.bold(`${suiteResult.passRate}%`))
      : suiteResult.passRate >= 80
      ? pc.yellow(pc.bold(`${suiteResult.passRate}%`))
      : pc.red(pc.bold(`${suiteResult.passRate}%`));

    output.push(
      `  Tests:    ${pc.green(`${suiteResult.passedCount} passed`)}, ${
        suiteResult.failedCount > 0 ? pc.red(`${suiteResult.failedCount} failed`) : '0 failed'
      }, ${suiteResult.totalTests} total`
    );
    output.push(`  Pass rate: ${passRateStr}`);
    output.push(`  Avg time:  ${suiteResult.averageDurationMs}ms\n`);

    return output.join('\n');
  }

  private static formatCategory(category: string): string {
    switch (category) {
      case 'valid_baseline':
        return pc.blue('baseline');
      case 'missing_required':
        return pc.magenta('missing_param');
      case 'type_mismatch':
        return pc.yellow('type_mismatch');
      case 'enum_violation':
        return pc.cyan('enum_violation');
      case 'boundary_range':
        return pc.red('boundary_range');
      default:
        return category;
    }
  }
}
