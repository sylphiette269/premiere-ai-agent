import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createAudioBeatMcpServer, type AudioBeatMcpServer } from './mcp-runtime.js';

type ManagedServer = Pick<AudioBeatMcpServer, 'server'>;

export async function runAudioBeatMcpServer(options: { server?: ManagedServer } = {}): Promise<void> {
  const server = options.server ?? createAudioBeatMcpServer();
  const transport = new StdioServerTransport();
  await server.server.connect(transport);
}
