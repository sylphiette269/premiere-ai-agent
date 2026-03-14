import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PremiereBridge } from './bridge/index.js';
import { PremiereProPrompts } from './prompts/index.js';
import { PremiereProResources } from './resources/index.js';
import { PremiereProTools } from './tools/index.js';
import {
  buildAgentError,
  classifyError,
} from './utils/errors.js';
import { Logger } from './utils/logger.js';

export const DISABLED_TOOLS: Record<string, { reason: string; fallback: string[] }> = {
  build_timeline_from_xml: {
    reason:
      'Known unstable path; motionStyle unsupported; XML import currently causes script_error. This tool is temporarily disabled.',
    fallback: ['plan_edit_from_request', 'plan_edit_assembly', 'assemble_product_spot'],
  },
};

export function buildDisabledToolPayload(toolName: string) {
  const disabled = DISABLED_TOOLS[toolName];
  if (!disabled) {
    return null;
  }

  return {
    ok: false,
    error_code: 'TOOL_DISABLED',
    message: disabled.reason,
    retryable: false,
    fallback: disabled.fallback,
    details: {
      toolName,
      suggestion: `Please use one of: ${disabled.fallback.join(', ')}`,
    },
  };
}

function isToolFailureResult(result: unknown): result is {
  ok?: boolean;
  success?: boolean;
  error?: unknown;
  message?: unknown;
} {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const candidate = result as Record<string, unknown>;
  return candidate.ok === false || candidate.success === false;
}

export function normalizeToolFailure(
  toolName: string,
  result: {
    ok?: boolean;
    success?: boolean;
    error?: unknown;
    message?: unknown;
    [key: string]: unknown;
  },
) {
  const rawMessage =
    typeof result.error === 'string'
      ? result.error
      : typeof result.message === 'string'
        ? result.message
        : `Tool '${toolName}' reported a failure`;
  const codeKey = classifyError(rawMessage, toolName);

  return buildAgentError(codeKey, rawMessage, {
    source: 'tool-result',
    rawMessage,
    toolName,
    toolResult: result,
  });
}

export class PremiereMcpServer {
  private readonly server: Server;
  readonly bridge: PremiereBridge;
  readonly tools: PremiereProTools;
  readonly resources: PremiereProResources;
  readonly prompts: PremiereProPrompts;
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('PremiereMcpServer');
    this.server = new Server(
      {
        name: 'premiere-mcp',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
        },
      },
    );
    this.bridge = new PremiereBridge();
    this.tools = new PremiereProTools(this.bridge);
    this.resources = new PremiereProResources(this.bridge);
    this.prompts = new PremiereProPrompts();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.tools.getAvailableTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema as never, {
          $refStrategy: 'none',
        }) as Record<string, unknown>,
      }));

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (DISABLED_TOOLS[name]) {
        const payload = buildDisabledToolPayload(name)!;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await this.tools.executeTool(name, args ?? {});
        if (isToolFailureResult(result)) {
          const normalizedError = normalizeToolFailure(name, result);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(normalizedError, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Tool execution failed: ${rawMessage}`);
        const codeKey = classifyError(rawMessage, name);
        const agentError = buildAgentError(codeKey, rawMessage, {
          source: 'mcp-runtime',
          rawMessage,
          toolName: name,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(agentError, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.resources.getAvailableResources(),
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const content = await this.resources.readResource(uri);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Resource read failed: ${message}`);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource '${uri}': ${message}`,
        );
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.prompts.getAvailablePrompts(),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const prompt = await this.prompts.getPrompt(name, args ?? {});
        return {
          description: prompt.description,
          messages: prompt.messages,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Prompt generation failed: ${message}`);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to generate prompt '${name}': ${message}`,
        );
      }
    });

    this.server.onerror = (error) => {
      this.logger.error('Server error:', error);
    };
  }

  async start(): Promise<void> {
    await this.bridge.initialize();
  }

  async connect(transport: { start?: () => Promise<void> } | any): Promise<void> {
    await this.server.connect(transport);
  }

  async stop(): Promise<void> {
    await this.bridge.cleanup();
  }

  get rawServer(): Server {
    return this.server;
  }
}

export function createPremiereMcpServer(): PremiereMcpServer {
  return new PremiereMcpServer();
}
