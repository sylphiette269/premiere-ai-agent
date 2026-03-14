import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createVideoResearchMcpServer, type VideoResearchMcpServer } from './mcp-runtime.js';

type ManagedServer = Pick<VideoResearchMcpServer, 'server'>;

export async function runVideoResearchMcpServer(options: {
  server?: ManagedServer;
} = {}): Promise<void> {
  const server = options.server ?? createVideoResearchMcpServer();
  const transport = new StdioServerTransport();
  await server.server.connect(transport);
}
