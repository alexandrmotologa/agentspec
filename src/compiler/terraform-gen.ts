import type { OpenAPISpec } from '../types/openapi.js';

export interface TerraformGenOptions {
  actionGroupName?: string;
  description?: string;
  lambdaArn?: string;
}

export class TerraformGenerator {
  /**
   * Generates Terraform HCL resource definitions for AWS Bedrock Action Groups
   */
  static generate(spec: OpenAPISpec, options: TerraformGenOptions = {}): string {
    const actionGroupName = (options.actionGroupName || spec.info.title || 'bedrock_action_group')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    const description = options.description || spec.info.description || `Action group for ${spec.info.title}`;
    const sanitizedSpecJson = JSON.stringify(spec, null, 2).replace(/\${/g, '$${');

    return `# Terraform Resource Definition for AWS Bedrock Agent Action Group
# Generated automatically by AgentSpec

variable "bedrock_agent_id" {
  type        = string
  description = "The ID of the AWS Bedrock Agent"
}

variable "bedrock_agent_version" {
  type        = string
  description = "The version of the AWS Bedrock Agent (e.g. DRAFT)"
  default     = "DRAFT"
}

variable "lambda_fulfillment_arn" {
  type        = string
  description = "ARN of the Lambda function that fulfills the action group"
  default     = "${options.lambdaArn || 'arn:aws:lambda:us-east-1:123456789012:function:ActionGroupHandler'}"
}

resource "aws_bedrockagent_agent_action_group" "${actionGroupName}" {
  action_group_name          = "${actionGroupName}"
  agent_id                   = var.bedrock_agent_id
  agent_version              = var.bedrock_agent_version
  description                = ${JSON.stringify(description)}
  action_group_state         = "ENABLED"
  skip_resource_in_use_check = true

  action_group_executor {
    lambda = var.lambda_fulfillment_arn
  }

  api_schema {
    payload = <<-EOT
${sanitizedSpecJson}
EOT
  }
}
`;
  }
}
