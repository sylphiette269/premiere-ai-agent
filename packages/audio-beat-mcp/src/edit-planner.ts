import type {
  AnimationPlanItem,
  EditingStyle,
  MarkerPlanItem,
  MusicBeatAnalysis,
  PremiereEditPlan,
} from './types.js';

export interface PlanPremiereEditingOptions {
  beatData: MusicBeatAnalysis;
  editingStyle?: EditingStyle;
  beatsPerBar?: number;
  pulseDurationSec?: number;
  baseScale?: number;
  normalPulseScale?: number;
  strongPulseScale?: number;
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function isNear(target: number, candidates: number[], toleranceSec: number): boolean {
  return candidates.some((candidate) => Math.abs(candidate - target) <= toleranceSec);
}

function dedupeMarkers(markers: MarkerPlanItem[], toleranceSec: number): MarkerPlanItem[] {
  const result: MarkerPlanItem[] = [];

  for (const marker of [...markers].sort((left, right) => left.timeSec - right.timeSec)) {
    const existing = result.find((item) => Math.abs(item.timeSec - marker.timeSec) <= toleranceSec);
    if (!existing) {
      result.push(marker);
      continue;
    }

    const currentPriority = marker.source === 'onset' ? 3 : marker.source === 'cut' ? 2 : 1;
    const existingPriority =
      existing.source === 'onset' ? 3 : existing.source === 'cut' ? 2 : 1;
    if (currentPriority > existingPriority) {
      existing.name = marker.name;
      existing.color = marker.color;
      existing.comment = marker.comment;
      existing.source = marker.source;
    }
  }

  return result;
}

function buildScalePulse(
  triggerTimeSec: number,
  intensity: 'normal' | 'strong',
  pulseDurationSec: number,
  baseScale: number,
  normalPulseScale: number,
  strongPulseScale: number,
): AnimationPlanItem {
  const peakScale = intensity === 'strong' ? strongPulseScale : normalPulseScale;
  const half = roundTime(pulseDurationSec / 2);
  const full = roundTime(pulseDurationSec);

  return {
    triggerTimeSec: roundTime(triggerTimeSec),
    property: 'Scale',
    label: 'scale_pulse',
    intensity,
    steps: [
      { offsetSec: 0, value: baseScale, interpolation: 'linear' },
      { offsetSec: half, value: peakScale, interpolation: 'bezier' },
      { offsetSec: full, value: baseScale, interpolation: 'bezier' },
    ],
  };
}

export function planPremiereEditing(options: PlanPremiereEditingOptions): PremiereEditPlan {
  const editingStyle = options.editingStyle ?? 'beat_markers_and_scale';
  const beatsPerBar = Math.max(1, Math.floor(options.beatsPerBar ?? 4));
  const pulseDurationSec = options.pulseDurationSec ?? 0.2;
  const baseScale = options.baseScale ?? 100;
  const normalPulseScale = options.normalPulseScale ?? 105;
  const strongPulseScale = options.strongPulseScale ?? 112;
  const beatTimes = options.beatData.beatTimes ?? [];
  const onsetTimes = options.beatData.onsetTimes ?? [];
  const notes: string[] = [];

  const downbeats = beatTimes.filter((_beat, index) => index % beatsPerBar === 0);
  const cutPoints =
    editingStyle === 'cut_on_beat'
      ? downbeats.length > 1
        ? downbeats
        : beatTimes.filter((_beat, index) => index % 2 === 0)
      : editingStyle === 'drum_punch'
        ? onsetTimes.length > 0
          ? onsetTimes
          : beatTimes
        : beatTimes;

  const markers: MarkerPlanItem[] = [];
  const animations: AnimationPlanItem[] = [];

  if (editingStyle === 'marker_only') {
    notes.push('Current style generates markers only and skips keyframe animation.');
  }

  if (editingStyle === 'cut_on_beat') {
    notes.push('Prefer handing cut points to the external Premiere MCP execution layer.');
  }

  if (editingStyle === 'drum_punch') {
    notes.push('Drum punch style prefers onsetTimes and only falls back to beatTimes.');
  }

  for (const timeSec of beatTimes) {
    const isDownbeat = isNear(timeSec, downbeats, 0.001);
    markers.push({
      timeSec: roundTime(timeSec),
      name: isDownbeat ? 'Downbeat' : 'Beat',
      color: 'green',
      comment: isDownbeat ? 'Strong bar beat' : 'Detected beat',
      source: isDownbeat ? 'downbeat' : 'beat',
    });

    if (editingStyle === 'beat_markers_and_scale') {
      const intensity = isNear(timeSec, onsetTimes, 0.08) || isDownbeat ? 'strong' : 'normal';
      animations.push(
        buildScalePulse(
          timeSec,
          intensity,
          pulseDurationSec,
          baseScale,
          normalPulseScale,
          strongPulseScale,
        ),
      );
    }
  }

  for (const timeSec of onsetTimes) {
    markers.push({
      timeSec: roundTime(timeSec),
      name: 'Drum Hit',
      color: 'red',
      comment: 'Detected onset / transient',
      source: 'onset',
    });

    if (editingStyle === 'drum_punch') {
      animations.push(
        buildScalePulse(
          timeSec,
          'strong',
          pulseDurationSec,
          baseScale,
          Math.max(normalPulseScale, baseScale + 8),
          Math.max(strongPulseScale, baseScale + 16),
        ),
      );
    }
  }

  if (editingStyle === 'cut_on_beat') {
    for (const timeSec of cutPoints) {
      markers.push({
        timeSec: roundTime(timeSec),
        name: 'Cut Point',
        color: 'blue',
        comment: 'Recommended cut point',
        source: 'cut',
      });
    }
  }

  return {
    style: editingStyle,
    bpm: options.beatData.bpm,
    beatCount: options.beatData.beatCount,
    onsetCount: options.beatData.onsetCount,
    cutPoints: cutPoints.map((value) => roundTime(value)),
    markerPlan: dedupeMarkers(markers, 0.05),
    animationPlan: animations.sort((left, right) => left.triggerTimeSec - right.triggerTimeSec),
    notes,
  };
}
