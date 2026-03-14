import path from 'node:path';

import {
  WorkspaceAudioBeatClient,
  WorkspacePremiereClient,
  WorkspaceVideoResearchClient,
} from './clients.js';
import { AgentCritic } from './critic.js';
import { AgentMemoryStore } from './memory.js';
import { Orchestrator } from './orchestrator.js';
import { AgentReporter } from './reporter.js';
import type { AgentExecutionInput, AgentReport } from './types.js';

export interface VideoAgentGatewayOptions {
  workspaceRoot?: string;
  memoryStore?: AgentMemoryStore;
  orchestrator?: Orchestrator;
}

export class VideoAgentGateway {
  private readonly orchestrator: Orchestrator;

  constructor(options: VideoAgentGatewayOptions = {}) {
    const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    const memoryStore = options.memoryStore ?? new AgentMemoryStore(path.join(workspaceRoot, '.video-agent', 'tasks'));
    this.orchestrator =
      options.orchestrator
      ?? new Orchestrator(
        {
          research: new WorkspaceVideoResearchClient(),
          audio: new WorkspaceAudioBeatClient(workspaceRoot),
          premiere: new WorkspacePremiereClient(workspaceRoot),
        },
        memoryStore,
        new AgentCritic(),
        new AgentReporter(),
      );
  }

  async run(input: AgentExecutionInput): Promise<AgentReport> {
    return await this.orchestrator.execute(input);
  }
}

export function createVideoAgentGateway(options: VideoAgentGatewayOptions = {}): VideoAgentGateway {
  return new VideoAgentGateway(options);
}
