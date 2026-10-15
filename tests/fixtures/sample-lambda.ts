export interface BedrockLambdaEvent {
  messageVersion: '1.0';
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  parameters: Array<{ name: string; type: string; value: string }>;
  requestBody?: {
    content: {
      'application/json': {
        properties: Array<{ name: string; type: string; value: unknown }>;
      };
    };
  };
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
        body: string;
      };
    };
  };
}

export const handler = async (event: BedrockLambdaEvent): Promise<BedrockLambdaResponse> => {
  console.log(`[Lambda] Handling ${event.httpMethod} ${event.apiPath} for actionGroup "${event.actionGroup}"`);

  const params: Record<string, string> = {};
  for (const p of event.parameters || []) {
    params[p.name] = p.value;
  }

  const bodyProps: Record<string, unknown> = {};
  const propsList = event.requestBody?.content?.['application/json']?.properties || [];
  for (const prop of propsList) {
    bodyProps[prop.name] = prop.value;
  }

  let statusCode = 200;
  let responseData: unknown = {};

  // Route: /pets (GET)
  if (event.apiPath === '/pets' && event.httpMethod === 'GET') {
    if (params.limit !== undefined) {
      const limitNum = Number(params.limit);
      if (isNaN(limitNum) || !Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
        return createResponse(event, 400, {
          code: 400,
          message: 'Invalid limit parameter: must be integer between 1 and 100'
        });
      }
    }
    if (params.status !== undefined && !['available', 'pending', 'sold'].includes(String(params.status))) {
      return createResponse(event, 400, {
        code: 400,
        message: 'Invalid status parameter: must be available, pending, or sold'
      });
    }
    responseData = [
      { id: 1, name: 'Doge', tag: 'canine', status: 'available' },
      { id: 2, name: 'Whiskers', tag: 'feline', status: 'pending' }
    ];
  }
  // Route: /pets (POST)
  else if (event.apiPath === '/pets' && event.httpMethod === 'POST') {
    if (!bodyProps.name || typeof bodyProps.name !== 'string') {
      return createResponse(event, 400, {
        code: 400,
        message: 'Missing or invalid required body field: "name"'
      });
    }
    if (bodyProps.status && !['available', 'pending', 'sold'].includes(String(bodyProps.status))) {
      return createResponse(event, 400, {
        code: 400,
        message: 'Invalid status enum value'
      });
    }
    if (bodyProps.tag && typeof bodyProps.tag !== 'string') {
      return createResponse(event, 400, {
        code: 400,
        message: 'Invalid tag: must be a string'
      });
    }

    statusCode = 201;
    responseData = {
      id: 101,
      name: bodyProps.name,
      tag: (bodyProps.tag as string) || 'general',
      status: (bodyProps.status as string) || 'available'
    };
  }
  // Route: /pets/{petId} (GET)
  else if (event.apiPath === '/pets/{petId}' && event.httpMethod === 'GET') {
    if (!params.petId) {
      return createResponse(event, 400, {
        code: 400,
        message: 'Missing required path parameter: petId'
      });
    }

    const petId = Number(params.petId);
    if (isNaN(petId) || !Number.isInteger(petId) || petId < 1) {
      return createResponse(event, 400, {
        code: 400,
        message: 'Invalid petId parameter: must be positive integer'
      });
    }

    if (petId === 999) {
      return createResponse(event, 404, {
        code: 404,
        message: `Pet with ID ${petId} not found`
      });
    }

    responseData = {
      id: petId,
      name: `Pet #${petId}`,
      tag: 'mammal',
      status: 'available'
    };
  }
  // Route: /pets/{petId} (DELETE)
  else if (event.apiPath === '/pets/{petId}' && event.httpMethod === 'DELETE') {
    const petId = Number(params.petId);
    if (!params.petId || isNaN(petId) || !Number.isInteger(petId) || petId < 1) {
      return createResponse(event, 400, {
        code: 400,
        message: 'Invalid petId parameter: must be positive integer'
      });
    }
    responseData = { deleted: true };
  }
  else {
    return createResponse(event, 404, {
      code: 404,
      message: `Unsupported action path: ${event.httpMethod} ${event.apiPath}`
    });
  }

  return createResponse(event, statusCode, responseData);
};

function createResponse(event: BedrockLambdaEvent, statusCode: number, body: unknown): BedrockLambdaResponse {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify(body)
        }
      }
    }
  };
}
