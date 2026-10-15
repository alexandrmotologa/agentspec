import type {
  BedrockLambdaEvent,
  BedrockLambdaParameter,
  BedrockLambdaBodyProperty
} from '../types/bedrock.js';
import type { NormalizedOperation } from '../types/openapi.js';

export interface EnvelopeOptions {
  actionGroup?: string;
  agentName?: string;
  agentId?: string;
  agentAlias?: string;
  agentVersion?: string;
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
  inputText?: string;
}

export class BedrockEnvelope {
  /**
   * Synthesizes a valid Bedrock Lambda Event for an operation given parameters and body
   */
  static synthesize(
    operation: NormalizedOperation,
    parameters: Record<string, unknown> = {},
    body?: unknown,
    options: EnvelopeOptions = {}
  ): BedrockLambdaEvent {
    const actionGroup = options.actionGroup || 'DefaultActionGroup';
    const bedrockParams: BedrockLambdaParameter[] = [];

    // Convert parameter map into Bedrock parameter array
    for (const [key, val] of Object.entries(parameters)) {
      if (val === undefined) continue;
      const paramDef = operation.parameters.find(p => p.name === key);
      const type = paramDef?.schema?.type ? String(paramDef.schema.type) : typeof val;

      bedrockParams.push({
        name: key,
        type: Array.isArray(type) ? type[0] : type,
        value: typeof val === 'object' ? JSON.stringify(val) : String(val)
      });
    }

    // Assemble request body properties if provided
    let requestBody: BedrockLambdaEvent['requestBody'];
    if (body !== undefined && body !== null) {
      const properties: BedrockLambdaBodyProperty[] = [];

      if (typeof body === 'object' && !Array.isArray(body)) {
        for (const [propName, propVal] of Object.entries(body as Record<string, unknown>)) {
          properties.push({
            name: propName,
            type: typeof propVal,
            value: propVal
          });
        }
      } else {
        properties.push({
          name: 'payload',
          type: typeof body,
          value: body
        });
      }

      requestBody = {
        content: {
          'application/json': {
            properties
          }
        }
      };
    }

    return {
      messageVersion: '1.0',
      agent: {
        name: options.agentName || 'AgentSpecLocalAgent',
        id: options.agentId || 'AGENTSPEC01',
        alias: options.agentAlias || 'TSTALIASID',
        version: options.agentVersion || 'DRAFT'
      },
      actionGroup,
      apiPath: operation.path,
      httpMethod: operation.method.toUpperCase(),
      parameters: bedrockParams,
      requestBody,
      sessionAttributes: options.sessionAttributes || {},
      promptSessionAttributes: options.promptSessionAttributes || {},
      inputText: options.inputText
    };
  }

  /**
   * Unpacks a BedrockLambdaEvent into clean parameters and body object
   */
  static unpack(event: BedrockLambdaEvent): {
    parameters: Record<string, unknown>;
    body: Record<string, unknown> | unknown;
  } {
    const parameters: Record<string, unknown> = {};

    for (const p of event.parameters || []) {
      let parsedVal: unknown = p.value;
      if (p.type === 'integer' || p.type === 'number') {
        const num = Number(p.value);
        if (!isNaN(num)) parsedVal = num;
      } else if (p.type === 'boolean') {
        parsedVal = p.value === 'true';
      }
      parameters[p.name] = parsedVal;
    }

    let body: Record<string, unknown> | unknown = undefined;
    const bodyProperties = event.requestBody?.content?.['application/json']?.properties;

    if (bodyProperties && Array.isArray(bodyProperties)) {
      const bodyObj: Record<string, unknown> = {};
      for (const prop of bodyProperties) {
        bodyObj[prop.name] = prop.value;
      }
      body = bodyObj;
    }

    return { parameters, body };
  }
}
