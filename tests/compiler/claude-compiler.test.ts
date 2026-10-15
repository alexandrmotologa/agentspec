import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { ClaudeCompiler } from '../../src/compiler/claude-tools.js';

describe('ClaudeCompiler', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');

  it('should compile OpenAPI spec into Claude tool definitions', () => {
    const spec = OpenAPILoader.load(petstorePath);
    const tools = ClaudeCompiler.compile(spec, { prune: true });

    expect(tools.length).toBe(4);

    const listPetsTool = tools.find(t => t.name === 'listPets');
    expect(listPetsTool).toBeDefined();
    expect(listPetsTool?.input_schema.type).toBe('object');
    expect(listPetsTool?.input_schema.properties.limit).toBeDefined();
    expect(listPetsTool?.input_schema.properties.status).toBeDefined();

    const createPetTool = tools.find(t => t.name === 'createPet');
    expect(createPetTool).toBeDefined();
    expect(createPetTool?.input_schema.properties.name).toBeDefined();
    expect(createPetTool?.input_schema.required).toContain('name');

    const getPetByIdTool = tools.find(t => t.name === 'getPetById');
    expect(getPetByIdTool).toBeDefined();
    expect(getPetByIdTool?.input_schema.properties.petId).toBeDefined();
    expect(getPetByIdTool?.input_schema.required).toContain('petId');
  });

  it('should sanitize tool names to adhere to Claude regex requirements', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Special Chars API', version: '1.0' },
      paths: {
        '/users/{user.id}/action:send': {
          post: {
            summary: 'Send action',
            operationId: 'users:send.action!@#',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    };

    const tools = ClaudeCompiler.compile(spec as any);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(tools[0].name).toBe('users_send_action___');
  });
});
