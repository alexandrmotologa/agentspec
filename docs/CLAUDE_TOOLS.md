# Anthropic Claude Tools Integration Guide

This guide describes how to use AgentSpec compiled tool definitions with the Anthropic Claude Messages API.

## Compilation to Claude Tools

Run `agentspec compile ./spec.json --target claude` to generate `claude-tools.json`.

AgentSpec normalizes OpenAPI operations into Anthropic-compliant tool declarations:
- Tool names are sanitized to match `^[a-zA-Z0-9_-]{1,64}$`.
- Method and path are embedded in descriptions for model routing clarity.
- Path, query, header, and request body schemas are combined into a single top-level `input_schema` object with explicit `required` arrays.

### Example Generated Tool Definition

```json
{
  "name": "createPet",
  "description": "[POST /pets] Creates a new pet in the store",
  "input_schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "tag": { "type": "string" },
      "status": {
        "type": "string",
        "enum": ["available", "pending", "sold"]
      }
    },
    "required": ["name"],
    "additionalProperties": false
  }
}
```

---

## Invoking Claude with Compiled Tools

```typescript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Load AgentSpec compiled tools
const tools = JSON.parse(fs.readFileSync('./output/claude-tools.json', 'utf8'));

async function chatWithTools(userPrompt: string) {
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    tools,
    messages: [
      { role: 'user', content: userPrompt }
    ]
  });

  // Handle model response
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      console.log(`Model requested tool: ${block.name}`);
      console.log(`Arguments:`, block.input);

      // Execute tool fulfillment locally or via emulator
      const toolResult = await executeTool(block.name, block.input);

      // Send tool result back to Claude
      const followUp = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        tools,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult)
              }
            ]
          }
        ]
      });

      console.log('Final Assistant Answer:', followUp.content);
    } else if (block.type === 'text') {
      console.log('Assistant:', block.text);
    }
  }
}
```
