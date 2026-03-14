import type { AggregatedBlueprint, ReferenceSignal } from '../types.js';

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function majority<T extends string>(values: T[], fallback: T): T {
  if (values.length === 0) {
    return fallback;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function majorityIgnoring<T extends string>(values: T[], ignored: T[], fallback: T): T {
  const filtered = values.filter((value) => !ignored.includes(value));
  return majority(filtered.length > 0 ? filtered : values, fallback);
}

function buildPacingCurve(signals: ReferenceSignal[]): string {
  const dominantPacing = majority(
    signals.map((signal) => signal.pacing),
    'medium',
  );
  if (dominantPacing === 'fast') {
    return 'fast-build-fast';
  }
  if (dominantPacing === 'slow') {
    return 'slow-build-hold';
  }
  return 'steady-build-steady';
}

function buildTransitionPattern(signals: ReferenceSignal[]): string[] {
  const dominant = majority(
    signals.map((signal) => signal.transitionStyle),
    'mixed',
  );
  if (dominant === 'hard_cut') {
    return ['hard_cut', 'zoom_cut', 'beat_cut'];
  }
  if (dominant === 'slow_mix') {
    return ['cross_dissolve', 'fade'];
  }
  return ['hard_cut', 'cross_dissolve'];
}

function buildMusicBeatStrategy(averageShotDuration: number): string {
  if (averageShotDuration <= 1.5) {
    return 'cut_on_beat';
  }
  if (averageShotDuration <= 3) {
    return 'accent_sections';
  }
  return 'music_support_only';
}

export function aggregateBlueprint(input: {
  signals: ReferenceSignal[];
  targetPlatform?: string;
  targetDurationSeconds?: number;
}): AggregatedBlueprint {
  const averageShotDuration = Number(average(
    input.signals.map((signal) => signal.averageShotDuration),
  ).toFixed(2));

  const targetDurationRange =
    typeof input.targetDurationSeconds === 'number' && Number.isFinite(input.targetDurationSeconds)
      ? [
          Math.max(3, input.targetDurationSeconds - 5),
          input.targetDurationSeconds + 5,
        ] as [number, number]
      : undefined;

  return {
    hookStyle: majority(input.signals.map((signal) => signal.hookStyle), 'direct_hook'),
    averageShotDuration,
    pacingCurve: buildPacingCurve(input.signals),
    transitionPattern: buildTransitionPattern(input.signals),
    textOverlayStyle: majorityIgnoring(
      input.signals.map((signal) => signal.subtitleStyle),
      ['unknown'],
      'unknown',
    ),
    musicBeatStrategy: buildMusicBeatStrategy(averageShotDuration),
    ctaPattern: majorityIgnoring(
      input.signals.map((signal) => signal.ctaPattern),
      ['none'],
      'none',
    ),
    avoidPatterns: ['cross_dissolve_only'],
    referenceCount: input.signals.length,
    targetPlatform: input.targetPlatform,
    targetDurationRange,
  };
}
