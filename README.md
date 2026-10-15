<p align="center">
  <img src="docs/images/logo.png?raw=true" alt="AgentSpec Logo" width="130" style="border-radius: 24px;" />
</p>

<h1 align="center">AgentSpec</h1>

<p align="center">
  <a href="https://github.com/alexandrmotologa/agentspec/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Status"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square" alt="TypeScript"></a>
  <a href="https://aws.amazon.com/bedrock/"><img src="https://img.shields.io/badge/AWS-Bedrock%20Agents-orange?style=flat-square" alt="AWS Bedrock"></a>
  <a href="https://www.anthropic.com/"><img src="https://img.shields.io/badge/Anthropic-Claude%20Tools-purple?style=flat-square" alt="Claude Tools"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>

<p align="center">
  Compiler and local testing sandbox that transforms OpenAPI specifications into Anthropic Claude tool definitions and AWS Bedrock Action Groups with Lambda fulfillment emulation.
</p>

<p align="center">
  <img src="docs/images/agentspec_demo.gif?raw=true" alt="AgentSpec CLI and Terminal Execution Demo" width="100%" />
</p>

## Overview

Connecting autonomous AI agents to enterprise APIs requires converting OpenAPI documentation into formats that large language models and cloud orchestrators accept. This transition creates three operational problems:

1. **Context overhead:** Standard OpenAPI 3.0, 3.1, and Swagger 2.0 documents contain documentation titles, redundant examples, XML metadata, and internal vendor extensions that increase token consumption.
2. **Slow Lambda fulfillment feedback loops:** AWS Bedrock Action Groups invoke Lambda functions using an envelope format (`messageVersion: "1.0"`). Verifying handler behavior traditionally requires deploying code to AWS and triggering calls through the AWS Management Console.
3. **Runtime validation regressions:** Models can pass strings where integers are expected, miss required parameters, or invent enum values. Handlers that lack strict assertion logic crash silently in production.

AgentSpec compiles OpenAPI schemas into clean Claude tools and Bedrock Action Groups, provides a local Lambda fulfillment emulator with an interactive web studio, and generates automated boundary test matrices to catch parameter validation regressions locally.

---

## Key capabilities

- **Multi-target compilation:** Generates Anthropic Claude tool definitions, AWS Bedrock Action Group schemas, AWS CDK TypeScript constructs, Terraform HCL resource blocks, and runtime Zod validation schemas.
- **Token pruning engine:** Removes redundant documentation strings, examples, titles, and internal vendor extensions while preserving schema constraints, reducing prompt token footprints by 40% to 60%.
- **Local Bedrock Lambda fulfillment emulator:** Runs TypeScript and JavaScript Lambda handlers locally without AWS deployment. The emulator synthesizes authentic `messageVersion: "1.0"` event envelopes and records execution duration and console logs.
- **Interactive browser studio:** Built-in web interface running on localhost for testing operations, inspecting parameter structures, and viewing real-time schema validation diagnostics.
- **Automated boundary and fuzzing suite:** Generates baseline happy paths, type mismatch violations, missing required parameters, and enum boundary conditions to verify that Lambda handlers return proper HTTP 4xx errors instead of unhandled exceptions.

---

## Installation

Install globally via npm or run directly through `npx`:

```bash
npm install -g agentspec
```

Or run via npx:

```bash
npx agentspec --help
```

---

## Quickstart

### 1. Inspect an OpenAPI specification

Inspect endpoint count, parameter depth, and estimated token savings:

```bash
agentspec inspect ./petstore.json
```

```
 OpenAPI Inspection: Swagger Petstore (v1.0.0)
 Sample Petstore API for AgentSpec testing

┌──────────────────────────────┬──────────────────────────────┐
│ Metric                       │ Value                        │
├──────────────────────────────┼──────────────────────────────┤
│ Total Operations             │ 4                            │
│ Total Path Routes            │ 2                            │
│ Original Token Estimate      │ 771                          │
│ Pruned Token Estimate        │ 385                          │
│ Estimated Token Savings      │ 50.1%                        │
└──────────────────────────────┴──────────────────────────────┘
```

### 2. Compile to Claude Tools and AWS Bedrock

Compile your OpenAPI specification into all supported target artifacts:

```bash
agentspec compile ./petstore.json --target all --output ./output
```

Generated artifacts in `./output`:
- `claude-tools.json`: Anthropic Claude tool definitions ready for the Messages API.
- `bedrock-action-group.json`: AWS Bedrock Action Group configuration payload.
- `bedrock-openapi.json`: Compliant OpenAPI 3.0.0 schema slice for Bedrock.
- `bedrock-cdk.ts`: AWS CDK TypeScript construct using `aws-cdk-lib/aws-bedrock`.
- `bedrock.tf`: Terraform HCL definition using `aws_bedrockagent_agent_action_group`.
- `types.ts` and `schemas.ts`: TypeScript interfaces and runtime Zod schemas.

### 3. Run the local Bedrock Lambda emulator

Start the local fulfillment emulator pointing to your local TypeScript handler file:

```bash
agentspec simulate ./petstore.json --handler ./src/lambda.ts --port 5005
```

Open `http://localhost:5005/_studio` in your browser to access the visual testing studio. You can also trigger endpoints directly via HTTP requests:

```bash
# Direct REST invocation
curl http://localhost:5005/pets/1

# Explicit tool invocation
curl -X POST http://localhost:5005/api/invoke \
  -H "Content-Type: application/json" \
  -d '{"operationId": "getPetById", "parameters": {"petId": 1}}'
```

### 4. Run automated boundary and fuzzing tests

Verify that your Lambda handler rejects invalid requests with proper HTTP 400 responses:

```bash
agentspec test ./petstore.json --handler ./src/lambda.ts
```

<p align="center">
  <img src="docs/images/agentspec_terminal.png?raw=true" alt="AgentSpec Fuzzing Test Matrix" width="100%" />
</p>

---

## Lambda fulfillment contract

AWS Bedrock sends events formatted with `messageVersion: "1.0"`. Your handler receives the event and returns a response containing a serialized JSON string in the `responseBody` object.

### Event envelope (`BedrockLambdaEvent`)

```typescript
export interface BedrockLambdaEvent {
  messageVersion: '1.0';
  agent: {
    name: string;
    id: string;
    alias: string;
    version: string;
  };
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  parameters: Array<{
    name: string;
    type: string;
    value: string;
  }>;
  requestBody?: {
    content: {
      'application/json': {
        properties: Array<{
          name: string;
          type: string;
          value: unknown;
        }>;
      };
    };
  };
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
  inputText?: string;
}
```

### Response structure (`BedrockLambdaResponse`)

```typescript
export interface BedrockLambdaResponse {
  messageVersion: '1.0';
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    httpStatusCode: number;
    responseBody: {
      'application/json': {
        body: string; // Must be a serialized JSON string
      };
    };
  };
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
}
```

### Writing a compliant TypeScript handler

```typescript
import type { BedrockLambdaEvent, BedrockLambdaResponse } from 'agentspec';

export const handler = async (event: BedrockLambdaEvent): Promise<BedrockLambdaResponse> => {
  const { apiPath, httpMethod, parameters, actionGroup } = event;

  if (apiPath === '/pets' && httpMethod === 'GET') {
    return {
      messageVersion: '1.0',
      response: {
        actionGroup,
        apiPath,
        httpMethod,
        httpStatusCode: 200,
        responseBody: {
          'application/json': {
            body: JSON.stringify([
              { id: 1, name: 'Fido', status: 'available' }
            ])
          }
        }
      }
    };
  }

  return {
    messageVersion: '1.0',
    response: {
      actionGroup,
      apiPath,
      httpMethod,
      httpStatusCode: 404,
      responseBody: {
        'application/json': {
          body: JSON.stringify({ message: 'Resource not found' })
        }
      }
    }
  };
};
```

---

## CLI command reference

| Command | Arguments | Options | Description |
| :--- | :--- | :--- | :--- |
| `compile` | `<spec>` | `-t, --target <name>`, `-o, --output <dir>`, `-p, --prune`, `--minify`, `--action-group <name>`, `--lambda-arn <arn>` | Compiles OpenAPI schemas into Claude tools, Bedrock action groups, CDK, and Terraform definitions. |
| `simulate` | `<spec>` | `-h, --handler <file>` (required), `-p, --port <port>`, `--host <host>`, `--action-group <name>` | Starts local fulfillment emulator and interactive testing studio at `/_studio`. |
| `test` | `<spec>` | `-h, --handler <file>` (required), `-n, --max-cases <n>`, `--op <id>`, `--llm <model>` | Runs automated schema boundary and fuzzing test cases against the local Lambda handler. |
| `inspect` | `<spec>` | None | Analyzes OpenAPI operations, parameter complexity, and calculates token savings. |

---

## Programmatic API

AgentSpec can be imported as a TypeScript library:

```typescript
import {
  Compiler,
  BedrockEnvelope,
  ResponseValidator,
  MockServer,
  FuzzRunner
} from 'agentspec';

// 1. Compile spec programmatically
const artifacts = Compiler.compile('./petstore.json', {
  target: 'all',
  prune: true
});

// 2. Synthesize Bedrock events
const event = BedrockEnvelope.synthesize(operation, { petId: 10 });

// 3. Validate Lambda output against OpenAPI response schema
const validation = ResponseValidator.validate(event, lambdaOutput, operation);
if (!validation.isValid) {
  console.error(validation.errors);
}
```

---

## Architecture

AgentSpec operates as a modular compiler pipeline:

```
[ OpenAPI 3.0 / 3.1 / Swagger 2.0 ]
                 │
                 ▼
┌─────────────────────────────────┐
│       OpenAPILoader             │  Parses JSON/YAML, normalizes Swagger 2.0,
│  Dereferencer & Cycle Breaker   │  resolves $ref pointers without recursion traps.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│        SchemaPruner             │  Strips titles, examples, and internal extensions.
│   Token Optimization Engine     │  Computes exact context reduction metrics.
└────────────────┬────────────────┘
                 │
   ┌─────────────┴─────────────┐
   ▼                           ▼
┌──────────────────┐   ┌────────────────────────┐
│  ClaudeCompiler  │   │   BedrockCompiler      │
│  Anthropic Tools │   │   Action Groups & IaC  │
└──────────────────┘   └────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical details on schema normalization, circular reference resolution, and event envelope generation.

---

## Contributing

1. Clone the repository: `git clone https://github.com/alexandrmotologa/agentspec.git`
2. Install dependencies: `npm install`
3. Run the test suite: `npm test`
4. Build the project: `npm run build`

---

## License

MIT License. Copyright (c) 2026 Alexandr Motologa.
