import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createPremiereMcpServer, type PremiereMcpServer } from './mcp-runtime.js';

type ManagedPremiereServer = Pick<PremiereMcpServer, 'start' | 'connect' | 'stop'>;
type TransportFactory = () => { start?: () => Promise<void> };
type ProcessController = {
  once: NodeJS.Process['once'];
  exit: (code: number) => void;
};

export async function runPremiereMcpServer(options: {
  server?: ManagedPremiereServer;
  createTransport?: TransportFactory;
  processController?: ProcessController;
  logError?: (...args: unknown[]) => void;
} = {}): Promise<void> {
  const server = options.server ?? createPremiereMcpServer();
  const createTransport = options.createTransport ?? (() => new StdioServerTransport());
  const processController = options.processController ?? process;
  const logError = options.logError ?? ((...args: unknown[]) => console.error(...args));

  let connectPromise: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = async (exitCode: number): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        let finalExitCode = exitCode;
        try {
          await connectPromise?.catch(() => undefined);
          await server.stop();
        } catch (error) {
          finalExitCode = 1;
          logError('Failed to shut down Premiere MCP server:', error);
        } finally {
          processController.exit(finalExitCode);
        }
      })();
    }

    await shutdownPromise;
  };

  processController.once('SIGINT', () => {
    void shutdown(0);
  });
  processController.once('SIGTERM', () => {
    void shutdown(0);
  });

  try {
    await server.start();

    if (shutdownPromise) {
      await shutdownPromise;
      return;
    }

    const transport = createTransport();
    connectPromise = server.connect(transport);
    await connectPromise;

    if (shutdownPromise) {
      await shutdownPromise;
    }
  } catch (error) {
    const pendingShutdown = shutdownPromise;
    if (pendingShutdown) {
      try {
        await pendingShutdown;
      } catch {
        // Ignore shutdown failures here because the signal path already owns exit handling.
      }
      return;
    }

    logError('Failed to start Premiere MCP server:', error);
    processController.exit(1);
  }
}
