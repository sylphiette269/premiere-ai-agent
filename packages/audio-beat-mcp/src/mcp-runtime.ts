import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { analyzeMusicBeats } from './audio-analysis.js';
import { generatePremiereCommands } from './command-generator.js';
import { planPremiereEditing } from './edit-planner.js';
import {
  analyzeMusicBeatsInputSchema,
  generatePremiereCommandsInputSchema,
  planPremiereEditingInputSchema,
} from './schemas.js';

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  execute: (args: unknown) => Promise<unknown> | unknown;
};

export class AudioBeatMcpServer {
  readonly server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'audio-beat-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private toolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'analyze_music_beats',
        description: 'Analyze beats, downbeats, and transient hits from a local audio file.',
        inputSchema: analyzeMusicBeatsInputSchema,
        execute: (args: unknown) => analyzeMusicBeats(analyzeMusicBeatsInputSchema.parse(args)),
      },
      {
        name: 'plan_pr_editing',
        description: 'Build a Premiere editing plan with markers, cut points, and pulse animations.',
        inputSchema: planPremiereEditingInputSchema,
        execute: (args: unknown) => planPremiereEditing(planPremiereEditingInputSchema.parse(args)),
      },
      {
        name: 'generate_pr_commands',
        description: 'Translate the plan into tool-call arguments for an external premiere-mcp server.',
        inputSchema: generatePremiereCommandsInputSchema,
        execute: (args: unknown) =>
          generatePremiereCommands(generatePremiereCommandsInputSchema.parse(args)),
      },
    ];
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefinitions().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.toolDefinitions().find((item) => item.name === request.params.name);
      if (!tool) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Unknown tool '${request.params.name}'.` }, null, 2),
            },
          ],
        };
      }

      try {
        const result = await tool.execute(request.params.arguments ?? {});
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { error: error instanceof Error ? error.message : String(error) },
                null,
                2,
              ),
            },
          ],
        };
      }
    });
  }
}

export function createAudioBeatMcpServer(): AudioBeatMcpServer {
  return new AudioBeatMcpServer();
}
