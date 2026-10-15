import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { OpenAPILoader } from '../../src/compiler/openapi-loader.js';
import { OpenAICompiler } from '../../src/compiler/openai-tools.js';
import { GeminiCompiler } from '../../src/compiler/gemini-tools.js';
import { MCPServerGenerator } from '../../src/compiler/mcp-server.js';
import { Compiler } from '../../src/compiler/index.js';

describe('Multi-Model Compilers (OpenAI, Gemini, MCP)', () => {
  const petstorePath = path.resolve('tests/fixtures/petstore.json');
  const spec = OpenAPILoader.load(petstorePath);

  describe('OpenAI Function Calling Compiler', () => {
    it('should compile OpenAPI operations to OpenAI tool definitions', () => {
      const tools = OpenAICompiler.compile(spec, { prune: true });
      expect(tools.length).toBe(4);

      const listPets = tools.find(t => t.function.name === 'listPets');
      expect(listPets).toBeDefined();
      expect(listPets?.type).toBe('function');
      expect(listPets?.function.parameters.type).toBe('object');
      expect(listPets?.function.parameters.properties).toHaveProperty('limit');
      expect(listPets?.function.parameters.additionalProperties).toBe(false);

      const createPet = tools.find(t => t.function.name === 'createPet');
      expect(createPet).toBeDefined();
      expect(createPet?.function.parameters.required).toContain('name');
    });
  });

  describe('Google Gemini Function Declarations Compiler', () => {
    it('should compile OpenAPI operations to Gemini uppercase schema declarations', () => {
      const declarations = GeminiCompiler.compile(spec, { prune: true });
      expect(declarations.length).toBe(4);

      const listPets = declarations.find(d => d.name === 'listPets');
      expect(listPets).toBeDefined();
      expect(listPets?.parameters.type).toBe('OBJECT');
      expect(listPets?.parameters.properties).toHaveProperty('limit');

      const limitProp = listPets?.parameters.properties.limit as any;
      expect(limitProp.type).toBe('INTEGER');

      const createPet = declarations.find(d => d.name === 'createPet');
      expect(createPet?.parameters.required).toContain('name');
    });
  });

  describe('Model Context Protocol (MCP) Generator', () => {
    it('should compile OpenAPI operations into MCP tool schemas', () => {
      const tools = MCPServerGenerator.compileTools(spec, { prune: true });
      expect(tools.length).toBe(4);

      const getPet = tools.find(t => t.name === 'getPetById');
      expect(getPet).toBeDefined();
      expect(getPet?.inputSchema.type).toBe('object');
      expect(getPet?.inputSchema.properties).toHaveProperty('petId');
      expect(getPet?.inputSchema.required).toContain('petId');
    });

    it('should generate standalone runnable MCP TypeScript server source code', () => {
      const code = MCPServerGenerator.generateServerCode(spec);
      expect(code).toContain('Model Context Protocol (MCP)');
      expect(code).toContain('readline.createInterface');
      expect(code).toContain('tools/list');
      expect(code).toContain('tools/call');
      expect(code).toContain('listPets');
      expect(code).toContain('getPetById');
    });
  });

  describe('Unified Compiler with All Targets', () => {
    it('should compile all supported targets simultaneously', () => {
      const artifacts = Compiler.compile(spec, { target: 'all', prune: true });
      expect(artifacts.claudeTools).toBeDefined();
      expect(artifacts.bedrockActionGroup).toBeDefined();
      expect(artifacts.cdkSnippet).toBeDefined();
      expect(artifacts.terraformSnippet).toBeDefined();
      expect(artifacts.typeDefinitions).toBeDefined();
      expect(artifacts.zodSchemas).toBeDefined();
      expect(artifacts.openaiTools).toBeDefined();
      expect(artifacts.geminiDeclarations).toBeDefined();
      expect(artifacts.mcpTools).toBeDefined();
      expect(artifacts.mcpServerSnippet).toBeDefined();
      expect(artifacts.metrics.originalTokens).toBeGreaterThan(0);
      expect(artifacts.metrics.savedTokens).toBeGreaterThanOrEqual(0);
    });
  });
});
