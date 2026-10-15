import path from 'node:path';
import pc from 'picocolors';
import Table from 'cli-table3';
import { Compiler } from '../../compiler/index.js';
import type { TargetPlatform } from '../../types/compiler.js';

export interface CompileCommandOptions {
  target?: string;
  output?: string;
  prune?: boolean;
  minify?: boolean;
  actionGroup?: string;
  lambdaArn?: string;
}

export async function compileCommand(specPath: string, options: CompileCommandOptions) {
  try {
    const target = (options.target || 'all') as TargetPlatform;
    const outputDir = options.output || './agentspec-output';
    const prune = options.prune !== false;

    console.log(pc.cyan(`\n Compiling specification: ${pc.bold(specPath)}`));
    console.log(pc.dim(`  Target:     ${target}`));
    console.log(pc.dim(`  Output:     ${path.resolve(outputDir)}`));
    console.log(pc.dim(`  Optimization: ${prune ? 'Token Pruning Enabled (-40-60%)' : 'Raw Schemas'}\n`));

    const artifacts = Compiler.compile(specPath, {
      target,
      outputDir,
      prune,
      minify: options.minify,
      actionGroupName: options.actionGroup,
      lambdaArn: options.lambdaArn
    });

    // Display Token Metrics
    const metricsTable = new Table({
      head: [pc.bold('Metric'), pc.bold('Value')],
      colWidths: [28, 28]
    });

    metricsTable.push(
      ['Original Schema Tokens', pc.yellow(artifacts.metrics.originalTokens.toLocaleString())],
      ['Pruned Schema Tokens', pc.green(artifacts.metrics.prunedTokens.toLocaleString())],
      ['Tokens Saved per Call', pc.cyan(artifacts.metrics.savedTokens.toLocaleString())],
      ['Context Reduction Ratio', pc.bold(pc.green(`${artifacts.metrics.reductionPercentage}%`))]
    );

    console.log(pc.bold(' Token Optimization Analysis:'));
    console.log(metricsTable.toString());

    // Display Output Artifacts
    const artifactsTable = new Table({
      head: [pc.bold('Target Artifact'), pc.bold('File Path / Count')],
      colWidths: [28, 50]
    });

    if (artifacts.claudeTools) {
      artifactsTable.push([
        'Claude Tools',
        `${artifacts.claudeTools.length} tools -> claude-tools.json`
      ]);
    }
    if (artifacts.bedrockActionGroup) {
      artifactsTable.push([
        'Bedrock Action Group',
        'bedrock-action-group.json, bedrock-openapi.json'
      ]);
    }
    if (artifacts.cdkSnippet) {
      artifactsTable.push(['AWS CDK (TypeScript)', 'bedrock-cdk.ts']);
    }
    if (artifacts.terraformSnippet) {
      artifactsTable.push(['Terraform HCL', 'bedrock.tf']);
    }
    if (artifacts.typeDefinitions) {
      artifactsTable.push(['TypeScript Types & Zod', 'types.ts, schemas.ts']);
    }

    console.log(pc.bold('\n Generated Artifacts:'));
    console.log(artifactsTable.toString());
    console.log(pc.green(`\n Compilation finished successfully in ${path.resolve(outputDir)}\n`));
  } catch (err) {
    console.error(pc.red(`\n Error during compilation: ${String(err)}\n`));
    process.exit(1);
  }
}
