import pc from 'picocolors';
import Table from 'cli-table3';
import { OpenAPILoader } from '../../compiler/openapi-loader.js';
import { SchemaPruner } from '../../compiler/schema-pruner.js';

export async function inspectCommand(specPath: string) {
  try {
    const rawSpec = OpenAPILoader.load(specPath);
    const operations = OpenAPILoader.extractOperations(rawSpec);
    const prunedSpec = SchemaPruner.pruneSpec(rawSpec);
    const metrics = SchemaPruner.calculateMetrics(rawSpec, prunedSpec);

    console.log(pc.bold(pc.cyan(`\n OpenAPI Inspection: ${pc.white(rawSpec.info.title)} (v${rawSpec.info.version})`)));
    if (rawSpec.info.description) {
      console.log(` ${pc.dim(rawSpec.info.description.substring(0, 120))}\n`);
    }

    const summaryTable = new Table({
      head: [pc.bold('Metric'), pc.bold('Value')],
      colWidths: [30, 30]
    });

    summaryTable.push(
      ['Total Operations', String(operations.length)],
      ['Total Path Routes', String(Object.keys(rawSpec.paths || {}).length)],
      ['Original Token Estimate', pc.yellow(metrics.originalTokens.toLocaleString())],
      ['Pruned Token Estimate', pc.green(metrics.prunedTokens.toLocaleString())],
      ['Estimated Token Savings', pc.bold(pc.cyan(`${metrics.reductionPercentage}%`))]
    );

    console.log(summaryTable.toString());

    // Operations breakdown table
    const opTable = new Table({
      head: [pc.bold('Method'), pc.bold('Path'), pc.bold('Operation ID'), pc.bold('Parameters'), pc.bold('Body')],
      colWidths: [10, 28, 25, 14, 8]
    });

    for (const op of operations.slice(0, 15)) {
      const methodColor = op.method === 'get' ? pc.blue('GET')
        : op.method === 'post' ? pc.green('POST')
        : op.method === 'put' ? pc.yellow('PUT')
        : op.method === 'delete' ? pc.red('DELETE')
        : pc.cyan(op.method.toUpperCase());

      opTable.push([
        methodColor,
        op.path,
        op.id,
        String(op.parameters.length),
        op.requestBodySchema ? pc.green('Yes') : pc.dim('No')
      ]);
    }

    console.log(pc.bold('\n Operations Summary:'));
    console.log(opTable.toString());
    if (operations.length > 15) {
      console.log(pc.dim(` ... and ${operations.length - 15} more operations.`));
    }
    console.log('');
  } catch (err) {
    console.error(pc.red(`\n Failed to inspect specification: ${String(err)}\n`));
    process.exit(1);
  }
}
