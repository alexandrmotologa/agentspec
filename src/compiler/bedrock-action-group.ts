import type { OpenAPISpec, OpenAPISchema } from '../types/openapi.js';
import type { BedrockActionGroupPayload } from '../types/bedrock.js';
import { OpenAPILoader } from './openapi-loader.js';
import { SchemaPruner } from './schema-pruner.js';

export interface BedrockCompilerOptions {
  actionGroupName?: string;
  description?: string;
  lambdaArn?: string;
  prune?: boolean;
}

export class BedrockCompiler {
  /**
   * Compiles an OpenAPI spec into an AWS Bedrock Action Group payload,
   * OpenAPI 3.0 subset, AWS CDK code, and CloudFormation template.
   */
  static compile(spec: OpenAPISpec, options: BedrockCompilerOptions = {}) {
    const actionGroupName = (options.actionGroupName || spec.info.title || 'BedrockActionGroup')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    const description = options.description || spec.info.description || `Action group for ${spec.info.title}`;
    const lambdaArn = options.lambdaArn || 'arn:aws:lambda:us-east-1:123456789012:function:ActionGroupHandler';

    // 1. Prepare dereferenced and pruned spec
    let normalized = OpenAPILoader.dereference(spec);
    if (options.prune) {
      normalized = SchemaPruner.pruneSpec(normalized);
    }

    // 2. Ensure strictly OpenAPI 3.0.0 compatible
    const bedrockSpec: OpenAPISpec = {
      openapi: '3.0.0',
      info: {
        title: spec.info.title,
        version: spec.info.version || '1.0.0',
        description: description
      },
      paths: {}
    };

    // Filter paths to valid Bedrock supported paths
    if (normalized.paths) {
      for (const [routePath, pathItem] of Object.entries(normalized.paths)) {
        bedrockSpec.paths[routePath] = {};
        const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

        for (const m of methods) {
          const op = pathItem[m];
          if (!op) continue;

          bedrockSpec.paths[routePath][m] = {
            operationId: op.operationId || `${m}_${routePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
            summary: op.summary || '',
            description: op.description || op.summary || '',
            parameters: op.parameters?.map(p => this.sanitizeForBedrock(p)),
            requestBody: op.requestBody ? this.sanitizeRequestBodyForBedrock(op.requestBody) : undefined,
            responses: {
              '200': {
                description: 'Successful fulfillment',
                content: {
                  'application/json': {
                    schema: op.responses?.['200']?.content?.['application/json']?.schema
                      || { type: 'object' }
                  }
                }
              }
            }
          };
        }
      }
    }

    const schemaPayloadString = JSON.stringify(bedrockSpec, null, 2);

    const payload: BedrockActionGroupPayload = {
      actionGroupName,
      description,
      apiSchema: {
        payload: schemaPayloadString
      },
      actionGroupExecutor: {
        lambda: lambdaArn
      }
    };

    // 3. Generate AWS CDK TypeScript snippet
    const cdkSnippet = `import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface BedrockActionGroupProps {
  agentId: string;
  agentVersion: string;
  lambdaFunctionArn: string;
}

export class ${actionGroupName}Construct extends Construct {
  public readonly actionGroup: bedrock.CfnAgentActionGroup;

  constructor(scope: Construct, id: string, props: BedrockActionGroupProps) {
    super(scope, id);

    this.actionGroup = new bedrock.CfnAgentActionGroup(this, '${actionGroupName}', {
      agentId: props.agentId,
      agentVersion: props.agentVersion,
      actionGroupName: '${actionGroupName}',
      description: ${JSON.stringify(description)},
      actionGroupExecutor: {
        lambda: props.lambdaFunctionArn,
      },
      apiSchema: {
        payload: JSON.stringify(${JSON.stringify(bedrockSpec, null, 2)})
      }
    });
  }
}
`;

    // 4. Generate AWS CloudFormation JSON snippet
    const cloudFormation = {
      Type: 'AWS::Bedrock::AgentActionGroup',
      Properties: {
        ActionGroupName: actionGroupName,
        Description: description,
        AgentId: { Ref: 'BedrockAgentId' },
        AgentVersion: 'DRAFT',
        ActionGroupExecutor: {
          Lambda: { Ref: 'LambdaFunctionArn' }
        },
        ApiSchema: {
          Payload: schemaPayloadString
        }
      }
    };

    return {
      spec: bedrockSpec,
      payload,
      cdkSnippet,
      cloudFormation
    };
  }

  private static sanitizeForBedrock<T>(item: T): T {
    if (!item || typeof item !== 'object') return item;
    const copy = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;

    // Fix OpenAPI 3.1 type arrays (e.g., ["string", "null"] => type: "string", nullable: true)
    if (copy.schema && typeof copy.schema === 'object') {
      const s = copy.schema as OpenAPISchema;
      if (Array.isArray(s.type)) {
        const types = s.type as string[];
        const isNullable = types.includes('null');
        s.type = types.find(t => t !== 'null') || 'string';
        if (isNullable) s.nullable = true;
      }
    }

    return copy as T;
  }

  private static sanitizeRequestBodyForBedrock<T>(body: T): T {
    return this.sanitizeForBedrock(body);
  }
}
