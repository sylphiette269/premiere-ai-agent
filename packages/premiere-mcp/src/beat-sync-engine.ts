export type BeatSyncStrategy = 'every_beat' | 'strong_beat' | 'progressive';

export type BeatSyncMode = 'sequential' | 'random' | 'ping-pong';

export interface BeatSyncClip {
  clipId: string;
  durationSec?: number;
}

export interface BeatSyncEnergyPeak {
  time: number;
  strength: number;
}

export interface BeatSyncPlacement {
  clipId: string;
  order: number;
  beatIndex: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  accentIntensity: 'normal' | 'strong';
}

export interface BeatSyncAccentEvent {
  timeSec: number;
  beatIndex: number;
  type: 'scale_pulse';
  intensity: 'normal' | 'strong';
}

export interface BeatSyncPlan {
  strategy: BeatSyncStrategy;
  mode: BeatSyncMode;
  tempo?: number;
  cutPoints: number[];
  placements: BeatSyncPlacement[];
  accentEvents: BeatSyncAccentEvent[];
  warnings: string[];
  medianBeatIntervalSec: number;
}

export interface BeatSyncPlanInput {
  clips: BeatSyncClip[];
  beats: number[];
  strategy: BeatSyncStrategy;
  mode?: BeatSyncMode;
  beatsPerBar?: number;
  fallbackSegmentSec?: number;
  seed?: number;
  tempo?: number;
  energyPeaks?: BeatSyncEnergyPeak[];
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeBeats(beats: number[]): number[] {
  return [
    ...new Set(
      beats
        .filter((beat) => Number.isFinite(beat) && beat >= 0)
        .map((beat) => roundTime(Number(beat))),
    ),
  ].sort((left, right) => left - right);
}

function computeMedianBeatInterval(beats: number[]): number {
  if (beats.length < 2) {
    return 0.5;
  }

  const intervals = beats
    .slice(1)
    .map((beat, index) => beat - beats[index]!)
    .filter((interval) => interval > 0);

  if (intervals.length === 0) {
    return 0.5;
  }

  const sorted = [...intervals].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return roundTime(sorted[middle]!);
  }
  return roundTime((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function selectBeatIndices(
  beats: number[],
  strategy: BeatSyncStrategy,
  beatsPerBar: number,
): number[] {
  if (strategy === 'every_beat') {
    return beats.map((_beat, index) => index);
  }

  if (strategy === 'strong_beat') {
    const interval = Math.max(1, Math.floor(beatsPerBar));
    const strong = beats.map((_beat, index) => index).filter((index) => index % interval === 0);
    return strong.length > 0 ? strong : [0];
  }

  const lastIndex = beats.length - 1;
  const selected: number[] = [];
  let cursor = 0;

  while (cursor <= lastIndex) {
    selected.push(cursor);
    const progress = lastIndex <= 0 ? 1 : cursor / lastIndex;
    const stride = progress < 0.34 ? 4 : progress < 0.67 ? 2 : 1;
    cursor += stride;
  }

  if (selected[selected.length - 1] !== lastIndex) {
    selected.push(lastIndex);
  }

  return [...new Set(selected)];
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function selectClipIndex(
  placementIndex: number,
  clipCount: number,
  mode: BeatSyncMode,
  rng: () => number,
  previousIndex: number | null,
): number {
  if (clipCount <= 1) {
    return 0;
  }

  if (mode === 'sequential') {
    return placementIndex % clipCount;
  }

  if (mode === 'ping-pong') {
    const cycle = clipCount * 2 - 2;
    const position = placementIndex % cycle;
    return position < clipCount ? position : cycle - position;
  }

  let candidate = Math.floor(rng() * clipCount);
  if (previousIndex !== null && candidate === previousIndex) {
    candidate = (candidate + 1) % clipCount;
  }
  return candidate;
}

function resolveAccentIntensity(
  beatTime: number,
  energyPeaks: BeatSyncEnergyPeak[],
  toleranceSec: number,
): 'normal' | 'strong' {
  return energyPeaks.some(
    (peak) => Math.abs(peak.time - beatTime) <= toleranceSec && peak.strength >= 0.85,
  )
    ? 'strong'
    : 'normal';
}

export function buildBeatSyncPlan(input: BeatSyncPlanInput): BeatSyncPlan {
  if (!input.clips?.length) {
    throw new Error('At least one clip is required for beat sync planning.');
  }

  const beats = normalizeBeats(input.beats ?? []);
  if (beats.length === 0) {
    throw new Error('At least one beat is required for beat sync planning.');
  }

  const mode = input.mode ?? 'sequential';
  const beatsPerBar = input.beatsPerBar ?? 4;
  const medianBeatIntervalSec = input.fallbackSegmentSec ?? computeMedianBeatInterval(beats);
  const cutIndices = selectBeatIndices(beats, input.strategy, beatsPerBar);
  const cutPoints = cutIndices.map((index) => beats[index]!).map(roundTime);
  const rng = createDeterministicRandom(input.seed ?? 1);
  const energyPeaks = input.energyPeaks ?? [];
  const toleranceSec = Math.max(0.03, medianBeatIntervalSec / 4);
  const warnings: string[] = [];
  const accentEvents: BeatSyncAccentEvent[] = [];
  const placements: BeatSyncPlacement[] = [];

  let previousClipIndex: number | null = null;
  for (let placementIndex = 0; placementIndex < cutIndices.length; placementIndex += 1) {
    const beatIndex = cutIndices[placementIndex]!;
    const startSec = beats[beatIndex]!;
    const nextBeatIndex = cutIndices[placementIndex + 1];
    const endSec =
      nextBeatIndex === undefined ? startSec + medianBeatIntervalSec : beats[nextBeatIndex]!;
    const durationSec = roundTime(Math.max(0, endSec - startSec));
    const clipIndex = selectClipIndex(
      placementIndex,
      input.clips.length,
      mode,
      rng,
      previousClipIndex,
    );
    previousClipIndex = clipIndex;
    const clip = input.clips[clipIndex]!;
    const accentIntensity = resolveAccentIntensity(startSec, energyPeaks, toleranceSec);

    placements.push({
      clipId: clip.clipId,
      order: placementIndex,
      beatIndex,
      startSec: roundTime(startSec),
      endSec: roundTime(endSec),
      durationSec,
      accentIntensity,
    });
    accentEvents.push({
      timeSec: roundTime(startSec),
      beatIndex,
      type: 'scale_pulse',
      intensity: accentIntensity,
    });

    if (typeof clip.durationSec === 'number' && clip.durationSec < durationSec) {
      warnings.push(
        `Clip ${clip.clipId} duration ${clip.durationSec}s is shorter than planned segment ${durationSec}s.`,
      );
    }
  }

  return {
    strategy: input.strategy,
    mode,
    tempo: input.tempo,
    cutPoints,
    placements,
    accentEvents,
    warnings,
    medianBeatIntervalSec: roundTime(medianBeatIntervalSec),
  };
}
