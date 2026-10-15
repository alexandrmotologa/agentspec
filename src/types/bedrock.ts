export interface BedrockLambdaParameter {
  name: string;
  type: string;
  value: string;
}

export interface BedrockLambdaBodyProperty {
  name: string;
  type: string;
  value: unknown;
}

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
  parameters: BedrockLambdaParameter[];
  requestBody?: {
    content: {
      'application/json': {
        properties: BedrockLambdaBodyProperty[];
      };
    };
  };
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
  inputText?: string;
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
        body: string; // Serialized JSON string according to AWS Bedrock spec
      };
    };
  };
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
}

export interface BedrockActionGroupPayload {
  actionGroupName: string;
  description: string;
  apiSchema: {
    payload: string; // JSON or YAML OpenAPI 3.0 string
  };
  actionGroupExecutor: {
    lambda: string; // ARN or reference
  };
}
