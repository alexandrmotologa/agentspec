import path from 'node:path';
import pc from 'picocolors';
import { MockServer } from '../../emulator/mock-server.js';

export interface SimulateCommandOptions {
  handler: string;
  port?: string;
  host?: string;
  actionGroup?: string;
  ui?: boolean;
}

export async function simulateCommand(specPath: string, options: SimulateCommandOptions) {
  if (!options.handler) {
    console.error(pc.red('\n Error: --handler <file.ts> is required for simulation\n'));
    process.exit(1);
  }

  const port = parseInt(options.port || '5005', 10);
  const host = options.host || '127.0.0.1';

  try {
    const server = new MockServer({
      specPath,
      handlerPath: options.handler,
      port,
      host,
      actionGroupName: options.actionGroup
    });

    const activePort = await server.start();

    console.log(pc.bold(pc.cyan('\n AgentSpec Bedrock Lambda Emulator Active ')));
    console.log(pc.dim('---------------------------------------------------------'));
    console.log(` ${pc.bold('Spec File:')}     ${path.resolve(specPath)}`);
    console.log(` ${pc.bold('Lambda Code:')}   ${path.resolve(options.handler)}`);
    console.log(` ${pc.bold('Emulator Host:')} http://${host}:${activePort}`);
    console.log(` ${pc.bold('Studio Web UI:')} ${pc.underline(pc.cyan(`http://${host}:${activePort}/_studio`))}`);
    console.log(pc.dim('---------------------------------------------------------'));
    console.log(pc.green(' Interactive browser studio available at the link above.'));
    console.log(pc.dim(' Press Ctrl+C to terminate the emulator session.\n'));

    // Handle graceful shutdown
    const cleanup = async () => {
      console.log(pc.dim('\n Stopping Bedrock emulator...'));
      await server.stop();
      console.log(pc.green(' Emulator stopped cleanly.\n'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (err) {
    console.error(pc.red(`\n Emulator failed to start: ${String(err)}\n`));
    process.exit(1);
  }
}
