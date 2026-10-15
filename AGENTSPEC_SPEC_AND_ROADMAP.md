# Engineering Specification & Implementation Blueprint: AgentSpec
> OpenAPI to AWS Bedrock Action Group & Claude Tool Compiler with Local Lambda Emulator

---

## 1. Executive Summary & Problem Space

### 1.1 The API-to-Agent Gap in Enterprise AI
In production agentic architectures (such as Amazon Bedrock Agents and Anthropic Claude), connecting an agent to business systems requires transforming existing REST APIs into LLM-callable Tool Definitions and AWS Bedrock Action Groups.

Engineering teams face three recurring bottlenecks:

1. **Schema Bloat & Context Exhaustion:** Enterprise OpenAPI specifications (Swagger 2.0, OpenAPI 3.0/3.1) are full of redundant metadata, recursive schemas, deeply nested object trees, and internal headers that overwhelm model context windows and cause high token costs.
2. **Untestable Lambda Fulfillment:** In AWS Bedrock, every action group invokes a Lambda function receiving a specific proprietary event format (`messageVersion: "1.0"`, `actionGroup`, `apiPath`, `parameters`, `requestBody`). Testing whether a Lambda handler correctly processes agent invocations currently requires deploying to AWS and triggering the agent through the AWS console, creating a painful 5-minute feedback loop.
3. **Runtime Schema Hallucinations:** Models often pass string integers (`"123"` instead of `123`), omit nested required fields, or invent unknown enum values. Without automated schema regression testing before deployment, these bugs silently crash production backend services.

### 1.2 The Solution: AgentSpec
**AgentSpec** is a developer CLI and local testing sandbox built in **TypeScript and Node.js** that streamlines the entire lifecycle of converting OpenAPI specifications into production-ready Claude tools and AWS Bedrock Action Groups.

* **Smart Schema Sanitizer & Compiler:** Ingests any Swagger or OpenAPI 3.0/3.1 file, resolves external `$ref` pointers, strips non-essential tags, and compiles two clean artifacts:
  1. `claude-tools.json`: Anthropic-compliant tool definitions optimized for token efficiency.
  2. `bedrock-action-group.json`: AWS Bedrock-compliant schema with corresponding CloudFormation / CDK definition.
* **Local Bedrock Lambda Event Emulator:** Simulates the exact AWS Bedrock runtime event loop on `localhost`. Developers can point the emulator at their local TypeScript/JavaScript Lambda handler and invoke it via simulated agent payloads without an AWS account or deployment.
* **Automated Tool Fuzzing & Regression Suite:** Automatically generates boundary test cases (missing required params, invalid types, boundary strings) and validates that the agent handles validation errors gracefully.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                         AgentSpec Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

[ CLI: npx agentspec ] ---> [ OpenAPI 3.0 / 3.1 or Swagger File ]
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AgentSpec Compiler Engine                         │
├────────────────────────────────────────────────────────────────────────┤
│  OpenAPI Ingestion & Normalizer                                        │
│    ├── Spec Validator (@readme/openapi-parser)                         │
│    ├── Reference Dereferencer & Circular Dependency Flattener          │
│    └── Description & Enum Token Optimizer                              │
├────────────────────────────────────────────────────────────────────────┤
│  Target Compilers                                                      │
│    ├── Anthropic Claude Tool Definition Generator                      │
│    ├── Amazon Bedrock Action Group & OpenAPI Payload Generator         │
│    └── TypeSafe Zod Schema & TypeScript Interface Generator            │
├────────────────────────────────────────────────────────────────────────┤
│  Local Bedrock Lambda Fulfillment Emulator                             │
│    ├── Event Envelope Synthesizer (Bedrock messageVersion 1.0 format)   │
│    ├── Hot-Reloading Handler Runner (Runs local lambda.ts / .js files) │
│    └── Mock HTTP Gateway (Invokes tools via curl / REST)               │
├────────────────────────────────────────────────────────────────────────┤
│  Adversarial Schema Testing Engine                                     │
│    ├── Boundary & Type Violation Test Generator                        │
│    └── Live LLM Calling Verifier (Claude Sonnet / Bedrock Runtime)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Choices
* **Runtime:** Node.js 22 LTS / TypeScript 5.6+
* **CLI Engine:** Commander.js + Picocolors + Ora + Table
* **OpenAPI Parsing:** `@readme/openapi-parser` + `json-schema-to-ts`
* **Schema Validation:** Zod 3.23+ for runtime schema assertion
* **Lambda Emulation:** Hot-reloading Dynamic Module Importer (`tsx` / Node `vm`)

---

## 3. Directory & File Structure

```
agentspec/
├── bin/
│   └── agentspec.js                # CLI executable entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── compile.ts          # agentspec compile <spec> --target <claude|bedrock>
│   │   │   ├── simulate.ts         # agentspec simulate <spec> --handler <file.ts>
│   │   │   └── test.ts             # agentspec test <spec> --llm <model>
│   │   └── index.ts
│   ├── compiler/
│   │   ├── bedrock-action-group.ts # Compiles AWS Bedrock Action Group payloads
│   │   ├── claude-tools.ts         # Compiles Anthropic Claude tool definitions
│   │   ├── openapi-loader.ts       # Parses, dereferences and validates OpenAPI
│   │   ├── schema-pruner.ts        # Strips bloated tags to reduce token consumption
│   │   └── typegen.ts              # Generates TypeScript interfaces from schemas
│   ├── emulator/
│   │   ├── bedrock-envelope.ts     # Generates mock Bedrock Lambda event structures
│   │   ├── lambda-runner.ts        # Dynamically loads and executes local handler code
│   │   ├── mock-server.ts          # Local HTTP endpoint to trigger actions
│   │   └── response-validator.ts   # Asserts Lambda responses match OpenAPI response schemas
│   ├── testing/
│   │   ├── boundary-generator.ts   # Generates invalid inputs for robustness testing
│   │   ├── model-runner.ts         # Optional live test against Claude/Bedrock APIs
│   │   └── test-reporter.ts        # CLI summary table of tool validation tests
│   └── types/
│       ├── bedrock.ts              # AWS Bedrock event and response types
│       ├── claude.ts               # Anthropic Tool specification types
│       └── openapi.ts              # Normalized OpenAPI interfaces
├── tests/
│   ├── compiler/
│   │   ├── bedrock-compiler.test.ts
│   │   └── claude-compiler.test.ts
│   ├── emulator/
│   │   └── lambda-runner.test.ts
│   └── fixtures/
│       ├── petstore.json
│       ├── sample-lambda.ts
│       └── stripe-subset.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Data Contracts & Interfaces

```typescript
// src/types/bedrock.ts
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
}

export interface BedrockLambdaResponse {
  messageVersion: '1.0';
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    httpStatusCode: number;
    responseBody: {
      'application/json': {
        body: string; // Serialized JSON string
      };
    };
  };
}

// src/types/claude.ts
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

---

## 5. Implementation Roadmap (Phases 1-5)

### Phase 1: OpenAPI Normalizer & Schema Optimizer
* Implement `openapi-loader.ts` to parse OpenAPI 3.0, 3.1, and Swagger 2.0 formats.
* Dereference `$ref` schemas while preventing infinite recursion on self-referential models.
* Implement `schema-pruner.ts` to remove unnecessary keywords (`examples`, `title`, internal extensions `x-*`) to minimize LLM token footprints by 40-60%.

### Phase 2: Claude & Bedrock Action Group Compilers
* Build Claude compiler generating compliant `input_schema` objects with accurate `required` fields.
* Build AWS Bedrock Action Group compiler generating stripped OpenAPI payloads and CDK/CloudFormation definitions.
* Implement TypeScript typegen producing strict interfaces for all tool parameters and responses.

### Phase 3: Local Lambda Fulfillment Emulator
* Create `bedrock-envelope.ts` to construct deterministic mock event payloads.
* Build `lambda-runner.ts` using Node.js dynamic imports to execute local user handlers (`export const handler = async (event) => ...`).
* Provide a local HTTP testing server (`agentspec simulate <spec> --handler <file.ts> --port 5005`) allowing developers to test tools using standard HTTP requests.

### Phase 4: Automated Boundary & Fuzzing Suite
* Generate boundary test cases (empty strings, out-of-range numbers, null values, malformed emails/UUIDs).
* Assert that the Lambda handler correctly returns formatted `400 Bad Request` payloads instead of throwing unhandled exceptions.
* Provide an optional live test runner connecting directly to Anthropic Claude or AWS Bedrock to verify model invocation behavior.

### Phase 5: Developer Experience, CLI & Distribution
* Implement interactive terminal tables reporting compiled tool counts, parameter complexity, and token savings.
* Package CLI with comprehensive command documentation and examples.
* Write a clean, humanized `README.md` containing architectural diagrams, AWS Bedrock deployment steps, and example Lambda code.
