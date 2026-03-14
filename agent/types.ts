import type { IngestAssetInput, ReferenceCandidate } from '../packages/video-research-mcp/src/types.js';
import type { MusicBeatAnalysis, PremiereEditPlan } from '../packages/audio-beat-mcp/src/types.js';
import type { EditingBlueprint } from '../packages/premiere-mcp/src/tools/catalog/agent-orchestration.types.js';

export type AgentScenarioId =
  | 'product_video_15s'
  | 'music_video_edit'
  | 'research_to_edit'
  | 'custom';

export type AgentStatus =
  | 'planning'
  | 'researching'
  | 'beating'
  | 'editing'
  | 'critiquing'
  | 'done'
  | 'failed';

export type AgentPhase = 'planning' | 'research' | 'audio' | 'editing' | 'review';

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type AgentMcp = 'video-research' | 'audio-beat' | 'premiere' | 'agent';

export interface AgentExecutionInput {
  goal: string;
  scenarioHint?: AgentScenarioId;
  sequenceName?: string;
  assetPaths?: string[];
  docxPath?: string;
  mediaManifestPath?: string;
  subtitleSourcePath?: string;
  subtitleLanguage?: string;
  bgmPath?: string;
  editingBlueprintPath?: string;
  researchTaskDir?: string;
  researchQuery?: string;
  referenceCandidates?: ReferenceCandidate[];
  referenceAssets?: IngestAssetInput[];
  targetPlatform?: string;
  targetDurationSec?: number;
  workDir?: string;
}

export interface AgentStep {
  id: string;
  title: string;
  action: string;
  mcp: AgentMcp;
  phase: AgentPhase;
  status: AgentStepStatus;
  dependsOn: string[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
}

export interface AgentTask {
  id: string;
  userGoal: string;
  scenario: AgentScenarioId;
  premiereScenario: 'natural_language' | 'docx_guided' | 'reference_video' | 'viral_style';
  status: AgentStatus;
  plan: AgentStep[];
  successCriteria: string[];
  warnings: string[];
  taskDir: string;
}

export interface Checkpoint {
  stepId: string;
  timestamp: number;
  state: 'saved' | 'restored';
  snapshot: Record<string, unknown>;
}

export interface DecisionRecord {
  stepId: string;
  timestamp: number;
  reason: string;
  alternatives: string[];
}

export interface ToolCallRecord {
  stepId: string;
  timestamp: number;
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface AgentMemory {
  taskId: string;
  goal: string;
  scenario: AgentScenarioId;
  checkpoints: Checkpoint[];
  decisions: DecisionRecord[];
  toolCallHistory: ToolCallRecord[];
  userPreferences: Record<string, unknown>;
}

export interface AgentArtifacts {
  blueprint?: EditingBlueprint;
  editingBlueprintPath?: string;
  researchTaskDir?: string;
  audioAnalysis?: MusicBeatAnalysis;
  audioPlan?: PremiereEditPlan;
  sequenceId?: string;
  assemblyResult?: Record<string, unknown>;
  criticResult?: Record<string, unknown>;
}

export interface AgentCriticReview {
  needsRevision: boolean;
  summary: string;
  findings: string[];
  actionableFixes: string[];
  raw?: Record<string, unknown>;
}

export interface AgentReport {
  taskId: string;
  goal: string;
  scenario: AgentScenarioId;
  status: 'done' | 'failed';
  summary: string;
  warnings: string[];
  steps: AgentStep[];
  artifacts: {
    taskDir: string;
    memoryPath: string;
    reportPath: string;
    editingBlueprintPath?: string;
    researchTaskDir?: string;
    sequenceId?: string;
  };
  critic: AgentCriticReview;
}
