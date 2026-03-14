import {
  analyzeAudioTrack,
  type AnalyzeAudioTrackOptions,
  type AudioAnalysisResult,
} from './audio-analysis.js';
import {
  buildBeatSyncPlan,
  type BeatSyncEnergyPeak,
  type BeatSyncPlan,
  type BeatSyncPlanInput,
} from './beat-sync-engine.js';
import {
  executeBeatSyncPlan,
  type BeatSyncToolExecutor,
  type ExecuteBeatSyncPlanResult,
} from './beat-sync-executor.js';

export interface BeatSyncWorkflowExecutionOptions {
  sequenceId: string;
  executeTool?: BeatSyncToolExecutor;
  trackIndex?: number;
  insertMode?: 'overwrite' | 'insert';
  applyAccentScalePulse?: boolean;
  pulseDurationSec?: number;
  baseScale?: number;
  normalPulseScale?: number;
  strongPulseScale?: number;
}

export interface RunBeatSyncWorkflowOptions {
  audio: AnalyzeAudioTrackOptions;
  planning: Omit<BeatSyncPlanInput, 'beats' | 'tempo' | 'energyPeaks'>;
  execution?: BeatSyncWorkflowExecutionOptions;
  dryRun?: boolean;
}

export interface RunBeatSyncWorkflowResult {
  analysis: AudioAnalysisResult;
  plan: BeatSyncPlan;
  execution: ExecuteBeatSyncPlanResult | null;
}

interface BeatSyncWorkflowDependencies {
  analyzeAudioTrackFn?: typeof analyzeAudioTrack;
  buildBeatSyncPlanFn?: typeof buildBeatSyncPlan;
  executeBeatSyncPlanFn?: typeof executeBeatSyncPlan;
}

function isBeatSyncEnergyPeak(value: unknown): value is BeatSyncEnergyPeak {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.time) && Number.isFinite(candidate.strength);
}

function normalizeEnergyPeaks(energyPeaks: unknown): BeatSyncEnergyPeak[] {
  if (!Array.isArray(energyPeaks)) {
    return [];
  }

  return energyPeaks.filter(isBeatSyncEnergyPeak);
}

export async function runBeatSyncWorkflow(
  options: RunBeatSyncWorkflowOptions,
  dependencies: BeatSyncWorkflowDependencies = {},
): Promise<RunBeatSyncWorkflowResult> {
  const analyzeAudioTrackFn = dependencies.analyzeAudioTrackFn ?? analyzeAudioTrack;
  const buildBeatSyncPlanFn = dependencies.buildBeatSyncPlanFn ?? buildBeatSyncPlan;
  const executeBeatSyncPlanFn = dependencies.executeBeatSyncPlanFn ?? executeBeatSyncPlan;

  const analysis = await analyzeAudioTrackFn(options.audio);
  const plan = buildBeatSyncPlanFn({
    ...options.planning,
    beats: analysis.beats ?? [],
    tempo: analysis.tempo,
    energyPeaks: normalizeEnergyPeaks(analysis.energy_peaks),
  });

  if (options.dryRun || !options.execution) {
    return {
      analysis,
      plan,
      execution: null,
    };
  }

  if (!options.execution.executeTool) {
    throw new Error('execution.executeTool is required when workflow execution is enabled.');
  }

  const execution = await executeBeatSyncPlanFn({
    sequenceId: options.execution.sequenceId,
    plan,
    executeTool: options.execution.executeTool,
    trackIndex: options.execution.trackIndex,
    insertMode: options.execution.insertMode,
    applyAccentScalePulse: options.execution.applyAccentScalePulse,
    pulseDurationSec: options.execution.pulseDurationSec,
    baseScale: options.execution.baseScale,
    normalPulseScale: options.execution.normalPulseScale,
    strongPulseScale: options.execution.strongPulseScale,
  });

  return {
    analysis,
    plan,
    execution,
  };
}
