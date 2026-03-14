import type { BeatSyncAccentEvent, BeatSyncPlan, BeatSyncPlacement } from './beat-sync-engine.js';

export interface BeatSyncToolExecutor {
  (name: string, args: Record<string, unknown>): Promise<Record<string, any>>;
}

export interface ExecuteBeatSyncPlanOptions {
  sequenceId: string;
  plan: BeatSyncPlan;
  executeTool: BeatSyncToolExecutor;
  trackIndex?: number;
  insertMode?: 'overwrite' | 'insert';
  applyAccentScalePulse?: boolean;
  pulseDurationSec?: number;
  baseScale?: number;
  normalPulseScale?: number;
  strongPulseScale?: number;
}

export interface BeatSyncTimelinePlacementResult {
  placement: BeatSyncPlacement;
  timelineClipId: string;
  addResult: Record<string, any>;
}

export interface BeatSyncAccentApplicationResult {
  accentEvent: BeatSyncAccentEvent;
  timelineClipId: string;
  keyframesApplied: number;
}

export interface ExecuteBeatSyncPlanResult {
  success: boolean;
  blocked: boolean;
  error?: string;
  timelinePlacements: BeatSyncTimelinePlacementResult[];
  accentApplications: BeatSyncAccentApplicationResult[];
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function findAccentEvent(
  placement: BeatSyncPlacement,
  accentEvents: BeatSyncAccentEvent[],
): BeatSyncAccentEvent | undefined {
  return accentEvents.find((event) => event.beatIndex === placement.beatIndex);
}

function resolveTimelineClipId(result: Record<string, any>): string | null {
  const candidate = result.id ?? result.clipId ?? result.nodeId ?? null;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
}

async function applyScalePulse(
  executeTool: BeatSyncToolExecutor,
  timelineClipId: string,
  placement: BeatSyncPlacement,
  accentEvent: BeatSyncAccentEvent,
  options: {
    baseScale: number;
    normalPulseScale: number;
    strongPulseScale: number;
    pulseDurationSec: number;
  },
): Promise<BeatSyncAccentApplicationResult> {
  const pulseEnd = Math.max(0, Math.min(options.pulseDurationSec, placement.durationSec));
  const pulsePeak = roundTime(pulseEnd / 2);
  const endTime = roundTime(pulseEnd);
  const peakScale =
    accentEvent.intensity === 'strong' ? options.strongPulseScale : options.normalPulseScale;

  const keyframes = [
    { time: 0, value: options.baseScale, interpolation: 'linear' as const },
    { time: pulsePeak, value: peakScale, interpolation: 'bezier' as const },
    { time: endTime, value: options.baseScale, interpolation: 'bezier' as const },
  ];

  for (const keyframe of keyframes) {
    const result = await executeTool('add_keyframe', {
      clipId: timelineClipId,
      componentName: 'Motion',
      paramName: 'Scale',
      time: keyframe.time,
      value: keyframe.value,
      interpolation: keyframe.interpolation,
    });
    if (!result?.success) {
      throw new Error(result?.error ?? `Failed to add pulse keyframe at ${keyframe.time}s.`);
    }
  }

  return {
    accentEvent,
    timelineClipId,
    keyframesApplied: keyframes.length,
  };
}

export async function executeBeatSyncPlan(
  options: ExecuteBeatSyncPlanOptions,
): Promise<ExecuteBeatSyncPlanResult> {
  const trackIndex = options.trackIndex ?? 0;
  const insertMode = options.insertMode ?? 'overwrite';
  const applyAccentScalePulse = options.applyAccentScalePulse ?? true;
  const pulseDurationSec = options.pulseDurationSec ?? 0.2;
  const baseScale = options.baseScale ?? 100;
  const normalPulseScale = options.normalPulseScale ?? 105;
  const strongPulseScale = options.strongPulseScale ?? 110;
  const timelinePlacements: BeatSyncTimelinePlacementResult[] = [];
  const accentApplications: BeatSyncAccentApplicationResult[] = [];

  for (const placement of options.plan.placements) {
    const addResult = await options.executeTool('add_to_timeline', {
      sequenceId: options.sequenceId,
      projectItemId: placement.clipId,
      trackIndex,
      time: placement.startSec,
      insertMode,
    });

    if (!addResult?.success) {
      return {
        success: false,
        blocked: true,
        error: addResult?.error ?? `Failed to place clip ${placement.clipId}.`,
        timelinePlacements,
        accentApplications,
      };
    }

    const timelineClipId = resolveTimelineClipId(addResult);
    if (!timelineClipId) {
      return {
        success: false,
        blocked: true,
        error: `Placement for clip ${placement.clipId} did not return a timeline clip id.`,
        timelinePlacements,
        accentApplications,
      };
    }

    timelinePlacements.push({
      placement,
      timelineClipId,
      addResult,
    });

    const accentEvent = findAccentEvent(placement, options.plan.accentEvents);
    if (!applyAccentScalePulse || !accentEvent) {
      continue;
    }

    try {
      const accentApplication = await applyScalePulse(
        options.executeTool,
        timelineClipId,
        placement,
        accentEvent,
        {
          baseScale,
          normalPulseScale,
          strongPulseScale,
          pulseDurationSec,
        },
      );
      accentApplications.push(accentApplication);
    } catch (error) {
      return {
        success: false,
        blocked: true,
        error: error instanceof Error ? error.message : String(error),
        timelinePlacements,
        accentApplications,
      };
    }
  }

  return {
    success: true,
    blocked: false,
    timelinePlacements,
    accentApplications,
  };
}
