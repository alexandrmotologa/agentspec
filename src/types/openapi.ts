export interface OpenAPISchema {
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  additionalProperties?: boolean | OpenAPISchema;
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  not?: OpenAPISchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  example?: unknown;
  examples?: unknown[] | Record<string, unknown>;
  $ref?: string;
  [key: string]: unknown;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body' | 'formData';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: OpenAPISchema;
  type?: string; // Swagger 2.0 fallback
  items?: OpenAPISchema; // Swagger 2.0 fallback
  format?: string;
  example?: unknown;
  examples?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenAPIMediaType {
  schema?: OpenAPISchema;
  example?: unknown;
  examples?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenAPIMediaType>;
  [key: string]: unknown;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, OpenAPIMediaType>;
  headers?: Record<string, unknown>;
  schema?: OpenAPISchema; // Swagger 2.0 fallback
  [key: string]: unknown;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
  tags?: string[];
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
  [key: string]: unknown;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export type OpenAPIPathItem = {
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
} & {
  [method in HTTPMethod]?: OpenAPIOperation;
};

export interface OpenAPIPaths {
  [path: string]: OpenAPIPathItem;
}

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: OpenAPIInfo;
  paths: OpenAPIPaths;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    responses?: Record<string, OpenAPIResponse>;
    parameters?: Record<string, OpenAPIParameter>;
    requestBodies?: Record<string, OpenAPIRequestBody>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  definitions?: Record<string, OpenAPISchema>; // Swagger 2.0
  parameters?: Record<string, OpenAPIParameter>; // Swagger 2.0
  responses?: Record<string, OpenAPIResponse>; // Swagger 2.0
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  host?: string; // Swagger 2.0
  basePath?: string; // Swagger 2.0
  schemes?: string[]; // Swagger 2.0
  consumes?: string[]; // Swagger 2.0
  produces?: string[]; // Swagger 2.0
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  [key: string]: unknown;
}

export interface NormalizedOperation {
  id: string;
  method: HTTPMethod;
  path: string;
  summary: string;
  description: string;
  parameters: OpenAPIParameter[];
  requestBodySchema?: OpenAPISchema;
  requestBodyRequired: boolean;
  responseSchemas: Record<string, OpenAPISchema>;
  tags: string[];
}
