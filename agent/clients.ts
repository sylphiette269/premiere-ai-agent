import path from 'node:path';

import { analyzeMusicBeats } from '../packages/audio-beat-mcp/src/audio-analysis.js';
import { planPremiereEditing } from '../packages/audio-beat-mcp/src/edit-planner.js';
import type { MusicBeatAnalysis, PremiereEditPlan } from '../packages/audio-beat-mcp/src/types.js';
import { createPremiereMcpServer, type PremiereMcpServer } from '../packages/premiere-mcp/src/mcp-runtime.js';
import type { EditingBlueprint } from '../packages/premiere-mcp/src/tools/catalog/agent-orchestration.types.js';
import { createResearchService } from '../packages/video-research-mcp/src/research-service.js';
import type {
  IngestAssetInput,
  ReferenceCandidate,
} from '../packages/video-research-mcp/src/types.js';

export interface ResearchBlueprintResult {
  blueprint: EditingBlueprint;
  blueprintPath: string;
  taskId: string;
  taskPath: string;
}

export interface VideoResearchClient {
  buildReferenceBlueprint(input: {
    goal: string;
    researchQuery?: string;
    referenceCandidates: ReferenceCandidate[];
    referenceAssets: IngestAssetInput[];
    targetDurationSec?: number;
    targetPlatform?: string;
    taskDir: string;
  }): Promise<ResearchBlueprintResult>;
}

export interface AudioBeatClient {
  analyzeAndPlan(input: { bgmPath: string }): Promise<{
    analysis: MusicBeatAnalysis;
    plan: PremiereEditPlan;
  }>;
}

export interface PremiereClient {
  assembleClosedLoop(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  criticEditResult(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  dispose(): Promise<void>;
}

async function withWorkingDirectory<T>(cwd: string, action: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await action();
  } finally {
    process.chdir(previous);
  }
}

export class WorkspaceVideoResearchClient implements VideoResearchClient {
  async buildReferenceBlueprint(input: {
    goal: string;
    researchQuery?: string;
    referenceCandidates: ReferenceCandidate[];
    referenceAssets: IngestAssetInput[];
    targetDurationSec?: number;
    targetPlatform?: string;
    taskDir: string;
  }): Promise<ResearchBlueprintResult> {
    if (input.referenceCandidates.length === 0 || input.referenceAssets.length === 0) {
      throw new Error('video-research step requires both referenceCandidates and referenceAssets.');
    }

    const cacheDir = path.join(input.taskDir, 'research-cache');
    const service = createResearchService({ cacheDir });
    const confirmed = await service.confirmReferenceSet({
      goal: input.goal,
      query: input.researchQuery,
      selectedCandidates: input.referenceCandidates,
    });
    await service.ingestReferenceAssets({
      taskId: confirmed.taskId,
      assets: input.referenceAssets,
    });
    await service.extractReferenceSignals({
      taskId: confirmed.taskId,
      cleanupManagedRawCopies: true,
    });
    const aggregated = await service.aggregateStyleBlueprint({
      taskId: confirmed.taskId,
      targetDurationSeconds: input.targetDurationSec,
      targetPlatform: input.targetPlatform,
    });

    return {
      blueprint: aggregated.blueprint,
      blueprintPath: aggregated.blueprintPath,
      taskId: confirmed.taskId,
      taskPath: confirmed.taskPath,
    };
  }
}

export class WorkspaceAudioBeatClient implements AudioBeatClient {
  private readonly packageRoot: string;

  constructor(workspaceRoot: string) {
    this.packageRoot = path.join(workspaceRoot, 'packages', 'audio-beat-mcp');
  }

  async analyzeAndPlan(input: { bgmPath: string }): Promise<{
    analysis: MusicBeatAnalysis;
    plan: PremiereEditPlan;
  }> {
    return await withWorkingDirectory(this.packageRoot, async () => {
      const analysis = await analyzeMusicBeats({
        audioPath: input.bgmPath,
        projectRoot: this.packageRoot,
      });
      const plan = planPremiereEditing({
        beatData: analysis,
      });
      return { analysis, plan };
    });
  }
}

export class WorkspacePremiereClient implements PremiereClient {
  private readonly packageRoot: string;
  private server: PremiereMcpServer | null = null;
  private started = false;

  constructor(workspaceRoot: string) {
    this.packageRoot = path.join(workspaceRoot, 'packages', 'premiere-mcp');
  }

  private async ensureStarted(): Promise<PremiereMcpServer> {
    if (!this.server) {
      this.server = createPremiereMcpServer();
    }
    if (!this.started) {
      await withWorkingDirectory(this.packageRoot, async () => {
        await this.server!.start();
      });
      this.started = true;
    }
    return this.server;
  }

  async assembleClosedLoop(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const server = await this.ensureStarted();
    return await withWorkingDirectory(this.packageRoot, async () =>
      await server.tools.executeTool('assemble_product_spot_closed_loop', input),
    ) as Record<string, unknown>;
  }

  async criticEditResult(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const server = await this.ensureStarted();
    return await withWorkingDirectory(this.packageRoot, async () =>
      await server.tools.executeTool('critic_edit_result', input),
    ) as Record<string, unknown>;
  }

  async dispose(): Promise<void> {
    if (this.server && this.started) {
      await withWorkingDirectory(this.packageRoot, async () => {
        await this.server!.stop();
      });
    }
    this.server = null;
    this.started = false;
  }
}
