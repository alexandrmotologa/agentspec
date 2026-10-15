import path from 'node:path';
import pc from 'picocolors';
import { MockServer } from '../../emulator/mock-server.js';

export interface MockCommandOptions {
  port?: string;
  host?: string;
  actionGroup?: string;
}

export async function mockCommand(specPath: string, options: MockCommandOptions) {
  const port = parseInt(options.port || '5005', 10);
  const host = options.host || '127.0.0.1';

  try {
    const server = new MockServer({
      specPath,
      port,
      host,
      mockMode: true,
      actionGroupName: options.actionGroup
    });

    const activePort = await server.start();

    console.log(pc.bold(pc.cyan('\n AgentSpec Autonomous Mock Server Active ')));
    console.log(pc.dim('---------------------------------------------------------'));
    console.log(` ${pc.bold('Spec File:')}     ${path.resolve(specPath)}`);
    console.log(` ${pc.bold('Mock Mode:')}     ${pc.green('Enabled (Zero-code synthetic data generation)')}`);
    console.log(` ${pc.bold('Server Host:')}   http://${host}:${activePort}`);
    console.log(` ${pc.bold('Studio Web UI:')} ${pc.underline(pc.cyan(`http://${host}:${activePort}/_studio`))}`);
    console.log(pc.dim('---------------------------------------------------------'));
    console.log(pc.green(' Responding with schema-conforming synthetic payloads.'));
    console.log(pc.dim(' Press Ctrl+C to terminate the mock session.\n'));

    const cleanup = async () => {
      console.log(pc.dim('\n Stopping Mock server...'));
      await server.stop();
      console.log(pc.green(' Mock server stopped cleanly.\n'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (err) {
    console.error(pc.red(`\n Mock server failed to start: ${String(err)}\n`));
    process.exit(1);
  }
}
