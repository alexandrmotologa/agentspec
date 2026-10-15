import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initCommand } from '../../src/cli/commands/init.js';

describe('Project Scaffolder (agentspec init)', () => {
  const tempDir = path.join(os.tmpdir(), `agentspec-init-test-${Date.now()}`);

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should scaffold a complete AgentSpec starter project from scratch', async () => {
    await initCommand(undefined, { dir: tempDir, name: 'my-bedrock-agent' });

    expect(fs.existsSync(path.join(tempDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'api-spec.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src/handler.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src/types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'src/schemas.ts'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-bedrock-agent');
    expect(pkg.scripts).toHaveProperty('simulate');
    expect(pkg.scripts).toHaveProperty('mock');
    expect(pkg.scripts).toHaveProperty('test');
    expect(pkg.scripts).toHaveProperty('mcp');

    const handler = fs.readFileSync(path.join(tempDir, 'src/handler.ts'), 'utf8');
    expect(handler).toContain('export const handler = async');
    expect(handler).toContain('BedrockLambdaEvent');
    expect(handler).toContain('BedrockLambdaResponse');
  });
});
