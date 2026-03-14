import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  aggregateStyleBlueprintInputSchema,
  confirmReferenceSetInputSchema,
  extractReferenceSignalsInputSchema,
  ingestReferenceAssetsInputSchema,
  rankReferenceCandidatesInputSchema,
  searchReferenceCandidatesInputSchema,
} from './schemas.js';
import { createResearchService, type ResearchService } from './research-service.js';

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown> | unknown;
};

export class VideoResearchMcpServer {
  readonly server: Server;
  readonly researchService: ResearchService;

  constructor(options: { researchService?: ResearchService } = {}) {
    this.server = new Server(
      {
        name: 'video-research-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.researchService = options.researchService ?? createResearchService();
    this.setupHandlers();
  }

  private toolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_reference_candidates',
        description: '通过公开网页搜索候选参考视频链接，不需要平台 Cookie。',
        inputSchema: searchReferenceCandidatesInputSchema,
        execute: (args) => this.researchService.searchReferenceCandidates(args as never),
      },
      {
        name: 'rank_reference_candidates',
        description: '基于目标风格和平台偏好，对候选参考视频做可解释排序。',
        inputSchema: rankReferenceCandidatesInputSchema,
        execute: (args) => this.researchService.rankReferenceCandidates(args as never),
      },
      {
        name: 'confirm_reference_set',
        description: '确认 1 到 5 条候选参考视频并创建 research task 目录。',
        inputSchema: confirmReferenceSetInputSchema,
        execute: (args) => this.researchService.confirmReferenceSet(args as never),
      },
      {
        name: 'ingest_reference_assets',
        description: '把本地参考视频拷贝到托管 raw 缓存目录。',
        inputSchema: ingestReferenceAssetsInputSchema,
        execute: (args) => this.researchService.ingestReferenceAssets(args as never),
      },
      {
        name: 'extract_reference_signals',
        description: '从本地参考视频和字幕 sidecar 提取节奏、字幕和 CTA 信号。',
        inputSchema: extractReferenceSignalsInputSchema,
        execute: (args) => this.researchService.extractReferenceSignals(args as never),
      },
      {
        name: 'aggregate_style_blueprint',
        description: '把 3 到 5 条参考视频信号聚合成可供剪辑系统消费的蓝图 JSON。',
        inputSchema: aggregateStyleBlueprintInputSchema,
        execute: (args) => this.researchService.aggregateStyleBlueprint(args as never),
      },
    ];
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefinitions().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema as never, {
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
        const parsed = tool.inputSchema.parse(request.params.arguments ?? {});
        const result = await tool.execute(parsed);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
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

export function createVideoResearchMcpServer(): VideoResearchMcpServer {
  return new VideoResearchMcpServer();
}
