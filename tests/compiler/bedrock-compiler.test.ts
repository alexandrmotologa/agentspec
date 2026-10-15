import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { BedrockCompiler } from '../../src/compiler/bedrock-action-group.js';
import { TerraformGenerator } from '../../src/compiler/terraform-gen.js';
import { TypeGenerator } from '../../src/compiler/typegen.js';

describe('BedrockCompiler & IaC Generators', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');

  it('should compile Bedrock Action Group payload with OpenAPI 3.0.0 compliance', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const result = BedrockCompiler.compile(spec, {
      actionGroupName: 'PetstoreActionGroup',
      lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:PetstoreLambda'
    });

    expect(result.payload.actionGroupName).toBe('PetstoreActionGroup');
    expect(result.payload.actionGroupExecutor.lambda).toBe('arn:aws:lambda:us-east-1:123456789012:function:PetstoreLambda');
    expect(result.spec.openapi).toBe('3.0.0');

    // Parse payload schema string
    const parsedPayload = JSON.parse(result.payload.apiSchema.payload);
    expect(parsedPayload.openapi).toBe('3.0.0');
    expect(parsedPayload.paths['/pets']).toBeDefined();
  });

  it('should generate AWS CDK TypeScript construct snippet', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const result = BedrockCompiler.compile(spec, { actionGroupName: 'PetstoreActions' });

    expect(result.cdkSnippet).toContain('export class PetstoreActionsConstruct extends Construct');
    expect(result.cdkSnippet).toContain('new bedrock.CfnAgentActionGroup');
    expect(result.cdkSnippet).toContain("actionGroupName: 'PetstoreActions'");
  });

  it('should generate AWS CloudFormation JSON template', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const result = BedrockCompiler.compile(spec, { actionGroupName: 'PetstoreActions' });

    expect(result.cloudFormation.Type).toBe('AWS::Bedrock::AgentActionGroup');
    expect(result.cloudFormation.Properties.ActionGroupName).toBe('PetstoreActions');
    expect(result.cloudFormation.Properties.AgentVersion).toBe('DRAFT');
  });

  it('should generate Terraform HCL definitions', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const tf = TerraformGenerator.generate(spec, { actionGroupName: 'petstore_actions' });

    expect(tf).toContain('resource "aws_bedrockagent_agent_action_group" "petstore_actions"');
    expect(tf).toContain('action_group_name          = "petstore_actions"');
    expect(tf).toContain('action_group_state         = "ENABLED"');
  });

  it('should generate TypeScript types and Zod schemas', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const generated = TypeGenerator.generate(spec);

    expect(generated.typeScript).toContain('export interface ListPetsParameters');
    expect(generated.typeScript).toContain('export type CreatePetRequestBody');
    expect(generated.zod).toContain('export const ListPetsParametersSchema = z.object');
    expect(generated.zod).toContain('export const CreatePetRequestBodySchema');
  });
});
