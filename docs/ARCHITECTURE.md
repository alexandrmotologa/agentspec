# System Architecture and Design

This document details the internal design and data flow of AgentSpec.

## Ingestion and Normalization Pipeline

AgentSpec accepts OpenAPI 3.0, OpenAPI 3.1, and Swagger 2.0 specifications in either JSON or YAML format.

```
[ Raw File / String ]
         │
         ▼
[ OpenAPILoader ]
  ├─ 1. JSON / YAML Parse
  ├─ 2. Swagger 2.0 to OpenAPI 3.0 Normalizer
  │     ├─ host + basePath -> servers
  │     ├─ definitions -> components.schemas
  │     └─ body parameters -> requestBody
  ├─ 3. Pointer Dereferencer ($ref resolution)
  │     └─ Active-stack cycle detection
  └─ 4. Operation Normalization (NormalizedOperation[])
```

### Circular Reference Resolution

Enterprise APIs frequently declare self-referential or mutually recursive models (such as tree nodes, hierarchical departments, or related entities). Naive dereferencing produces an infinite recursion loop and crashes Node.js with a call stack overflow.

AgentSpec tracks reference evaluation using two active sets:
- `activeRefs`: Tracks the current chain of JSON schema pointer paths (`#/components/schemas/...`).
- `activeObjects`: Tracks in-memory object references currently being expanded.

When a reference target is detected in either active set, the engine truncates the expansion and emits a finite leaf schema:

```json
{
  "type": "object",
  "description": "Circular reference to Node",
  "properties": {}
}
```

This preserves schema validity while keeping JSON representations finite.

---

## Token Optimization (SchemaPruner)

Language model context windows carry latency and monetary costs. Enterprise OpenAPI specifications include documentation tags that do not affect the model's ability to select and populate tools.

`SchemaPruner` systematically strips:
- `example` and `examples` fields
- `title` metadata tags
- `x-*` custom vendor extensions
- `xml` and `externalDocs` nodes
- Redundant whitespace and verbose descriptions exceeding configurable limits

The pruning engine calculates exact character counts and estimates token footprints using byte-pair encoding heuristics (~3.75 characters per token in JSON structures), reporting original vs. pruned token counts and percentage reduction.

---

## Bedrock Lambda Fulfillment Emulation

AWS Bedrock invokes action groups via Lambda using a proprietary JSON payload:

```json
{
  "messageVersion": "1.0",
  "agent": {
    "name": "LocalAgent",
    "id": "AGENTSPEC01",
    "alias": "TSTALIASID",
    "version": "DRAFT"
  },
  "actionGroup": "PetstoreActions",
  "apiPath": "/pets/{petId}",
  "httpMethod": "GET",
  "parameters": [
    { "name": "petId", "type": "integer", "value": "1" }
  ],
  "requestBody": {
    "content": {
      "application/json": {
        "properties": []
      }
    }
  },
  "sessionAttributes": {},
  "promptSessionAttributes": {}
}
```

### Local Execution Sandbox

`LambdaRunner` loads local TypeScript (`.ts`), ES Modules (`.mjs`, `.js`), or CommonJS (`.cjs`) handler files dynamically using cache-busted URL imports (`?update=timestamp`). This enables hot-reloading when modifying code during simulation.

During handler invocation:
- Standard output (`console.log`, `console.warn`, `console.error`) is intercepted and buffered per invocation.
- Wall-clock execution time is measured via `performance.now()`.
- An isolated Lambda execution context is passed as the second argument, providing `awsRequestId` and `getRemainingTimeInMillis`.

---

## Schema Validation Engine

`ResponseValidator` performs a two-stage verification on Lambda output:

1. **Envelope Structure Assertion:** Checks that the object contains `messageVersion: "1.0"`, an integer `httpStatusCode`, and that `responseBody['application/json'].body` is a serialized string.
2. **OpenAPI Schema Conformance:** Unpacks the inner JSON string and validates every property against the operation's defined response schema for that HTTP status code (type checks, required field assertions, and enum validation).
