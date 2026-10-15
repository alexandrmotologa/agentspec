import pc from 'picocolors';
import { MCPServerGenerator } from '../../compiler/mcp-server.js';

export interface MCPCommandOptions {
  handler: string;
}

export async function mcpCommand(specPath: string, options: MCPCommandOptions) {
  if (!options.handler) {
    console.error(pc.red('\n Error: --handler <file.ts> is required to run the MCP server\n'));
    process.exit(1);
  }

  // MCP runs over standard I/O (stdin/stdout) for JSON-RPC 2.0 communication
  try {
    await MCPServerGenerator.runStdioServer(specPath, options.handler);
  } catch (err) {
    console.error(pc.red(`Failed to start MCP server: ${String(err)}`));
    process.exit(1);
  }
}
