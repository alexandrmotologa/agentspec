import fs from 'node:fs';
import path from 'node:path';
import type { CompilerOptions, CompilationArtifacts, TargetPlatform } from '../types/compiler.js';
import type { OpenAPISpec } from '../types/openapi.js';
import { OpenAPILoader } from './openapi-loader.js';
import { SchemaPruner } from './schema-pruner.js';
import { ClaudeCompiler } from './claude-tools.js';
import { BedrockCompiler } from './bedrock-action-group.js';
import { TypeGenerator } from './typegen.js';
import { TerraformGenerator } from './terraform-gen.js';

export class Compiler {
  /**
   * Compiles an OpenAPI specification into requested artifacts
   */
  static compile(specInput: string | OpenAPISpec, options: CompilerOptions = {}): CompilationArtifacts {
    const rawSpec: OpenAPISpec = typeof specInput === 'string'
      ? OpenAPILoader.load(specInput)
      : specInput;

    const target: TargetPlatform = options.target || 'all';
    const prune = options.prune ?? true;

    // Prune if requested
    const processedSpec = prune ? SchemaPruner.pruneSpec(rawSpec) : rawSpec;
    const metrics = SchemaPruner.calculateMetrics(rawSpec, processedSpec);

    const artifacts: CompilationArtifacts = { metrics };

    if (target === 'claude' || target === 'all') {
      artifacts.claudeTools = ClaudeCompiler.compile(processedSpec, { prune });
    }

    if (target === 'bedrock' || target === 'all') {
      const bedrockResult = BedrockCompiler.compile(processedSpec, {
        actionGroupName: options.actionGroupName,
        lambdaArn: options.lambdaArn,
        prune
      });
      artifacts.bedrockActionGroup = {
        spec: bedrockResult.spec,
        payload: bedrockResult.payload
      };
      artifacts.cdkSnippet = bedrockResult.cdkSnippet;
    }

    if (target === 'cdk' || target === 'all') {
      if (!artifacts.cdkSnippet) {
        const res = BedrockCompiler.compile(processedSpec, {
          actionGroupName: options.actionGroupName,
          lambdaArn: options.lambdaArn,
          prune
        });
        artifacts.cdkSnippet = res.cdkSnippet;
      }
    }

    if (target === 'terraform' || target === 'all') {
      artifacts.terraformSnippet = TerraformGenerator.generate(processedSpec, {
        actionGroupName: options.actionGroupName,
        lambdaArn: options.lambdaArn
      });
    }

    if (target === 'types' || target === 'all') {
      const types = TypeGenerator.generate(processedSpec);
      artifacts.typeDefinitions = types.typeScript;
      artifacts.zodSchemas = types.zod;
    }

    // Write to disk if outputDir is specified
    if (options.outputDir) {
      this.writeArtifacts(artifacts, options.outputDir, options.minify);
    }

    return artifacts;
  }

  /**
   * Writes compiled artifacts to the specified output directory
   */
  static writeArtifacts(artifacts: CompilationArtifacts, outputDir: string, minify = false): string[] {
    const resolvedDir = path.resolve(outputDir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    const writtenFiles: string[] = [];
    const indent = minify ? 0 : 2;

    if (artifacts.claudeTools) {
      const file = path.join(resolvedDir, 'claude-tools.json');
      fs.writeFileSync(file, JSON.stringify(artifacts.claudeTools, null, indent), 'utf8');
      writtenFiles.push(file);
    }

    if (artifacts.bedrockActionGroup) {
      const fileSchema = path.join(resolvedDir, 'bedrock-openapi.json');
      const filePayload = path.join(resolvedDir, 'bedrock-action-group.json');
      fs.writeFileSync(fileSchema, JSON.stringify(artifacts.bedrockActionGroup.spec, null, indent), 'utf8');
      fs.writeFileSync(filePayload, JSON.stringify(artifacts.bedrockActionGroup.payload, null, indent), 'utf8');
      writtenFiles.push(fileSchema, filePayload);
    }

    if (artifacts.cdkSnippet) {
      const file = path.join(resolvedDir, 'bedrock-cdk.ts');
      fs.writeFileSync(file, artifacts.cdkSnippet, 'utf8');
      writtenFiles.push(file);
    }

    if (artifacts.terraformSnippet) {
      const file = path.join(resolvedDir, 'bedrock.tf');
      fs.writeFileSync(file, artifacts.terraformSnippet, 'utf8');
      writtenFiles.push(file);
    }

    if (artifacts.typeDefinitions) {
      const file = path.join(resolvedDir, 'types.ts');
      fs.writeFileSync(file, artifacts.typeDefinitions, 'utf8');
      writtenFiles.push(file);
    }

    if (artifacts.zodSchemas) {
      const file = path.join(resolvedDir, 'schemas.ts');
      fs.writeFileSync(file, artifacts.zodSchemas, 'utf8');
      writtenFiles.push(file);
    }

    const metricsFile = path.join(resolvedDir, 'token-metrics.json');
    fs.writeFileSync(metricsFile, JSON.stringify(artifacts.metrics, null, indent), 'utf8');
    writtenFiles.push(metricsFile);

    return writtenFiles;
  }
}
