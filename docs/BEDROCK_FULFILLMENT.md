# AWS Bedrock Action Group Fulfillment Guide

This guide describes how to write, test, and deploy Lambda fulfillment handlers for AWS Bedrock Agents using AgentSpec.

## Bedrock Action Group Event Architecture

When an AWS Bedrock Agent decides to invoke an action group, it dispatches an invocation event to the configured Lambda function.

### Key Event Fields

- `apiPath`: The matched OpenAPI route (e.g. `/orders/{id}`).
- `httpMethod`: The HTTP verb in uppercase (e.g. `GET`, `POST`, `DELETE`).
- `parameters`: Array of named parameters extracted by the agent. Each parameter has `name`, `type`, and `value` (always a string).
- `requestBody`: Object containing structured JSON payload properties if defined in the OpenAPI schema.
- `sessionAttributes` and `promptSessionAttributes`: Contextual key-value pairs preserved across turns.

### Critical Bedrock Formatting Invariant

The `responseBody['application/json'].body` field **must be a string**. Passing an object directly causes AWS Bedrock to return a runtime serialization error: `Received non-string responseBody from action group Lambda`.

Always serialize your response object with `JSON.stringify`:

```typescript
responseBody: {
  'application/json': {
    body: JSON.stringify(myData)
  }
}
```

---

## Example Handler Implementation

```typescript
import type { BedrockLambdaEvent, BedrockLambdaResponse } from 'agentspec';

export const handler = async (event: BedrockLambdaEvent): Promise<BedrockLambdaResponse> => {
  const { apiPath, httpMethod, actionGroup } = event;

  // 1. Extract query and path parameters
  const params: Record<string, string> = {};
  for (const p of event.parameters || []) {
    params[p.name] = p.value;
  }

  // 2. Extract request body properties
  const bodyProps: Record<string, unknown> = {};
  const propsList = event.requestBody?.content?.['application/json']?.properties || [];
  for (const item of propsList) {
    bodyProps[item.name] = item.value;
  }

  // 3. Route to business logic
  if (apiPath === '/customers/{id}' && httpMethod === 'GET') {
    const customerId = params.id;
    if (!customerId) {
      return errorResponse(event, 400, 'Missing customer ID parameter');
    }

    return successResponse(event, 200, {
      id: customerId,
      name: 'Acme Corp',
      tier: 'enterprise'
    });
  }

  return errorResponse(event, 404, `Unknown operation: ${httpMethod} ${apiPath}`);
};

function successResponse(event: BedrockLambdaEvent, statusCode: number, data: unknown): BedrockLambdaResponse {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify(data)
        }
      }
    }
  };
}

function errorResponse(event: BedrockLambdaEvent, statusCode: number, message: string): BedrockLambdaResponse {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify({ error: message })
        }
      }
    }
  };
}
```

---

## Infrastructure Deployment

### Using AWS CDK

Run `agentspec compile ./spec.json --target cdk` to generate `bedrock-cdk.ts`.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Attach action group to existing Bedrock Agent
const actionGroup = new bedrock.CfnAgentActionGroup(this, 'OrderActions', {
  agentId: 'AGENTID123',
  agentVersion: 'DRAFT',
  actionGroupName: 'OrderFulfillment',
  description: 'Handles order creation and lookup',
  actionGroupExecutor: {
    lambda: fulfillmentFunction.functionArn
  },
  apiSchema: {
    payload: JSON.stringify(bedrockOpenApiSchema)
  }
});
```

### Using Terraform

Run `agentspec compile ./spec.json --target terraform` to generate `bedrock.tf`.

```hcl
resource "aws_bedrockagent_agent_action_group" "orders" {
  action_group_name          = "order_fulfillment"
  agent_id                   = var.bedrock_agent_id
  agent_version              = "DRAFT"
  description                = "Handles order creation and lookup"
  action_group_state         = "ENABLED"
  skip_resource_in_use_check = true

  action_group_executor {
    lambda = aws_lambda_function.order_fulfillment.arn
  }

  api_schema {
    payload = file("${path.module}/bedrock-openapi.json")
  }
}
```
