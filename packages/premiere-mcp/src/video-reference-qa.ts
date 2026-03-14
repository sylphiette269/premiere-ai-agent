import type {
  AssemblyExecutionReview,
  AssemblyExecutionSummary,
  AssemblyTimelineSnapshot,
} from "./edit-reasonability-review.js";
import type { VideoBlueprint } from "./video-reference-analyzer.js";

export interface VideoQAReport {
  status: string;
  shotCountMatch: boolean;
  durationDeltaSec: number;
  pacingDeltaPercent: number;
  transitionMismatches: Array<{
    shotIndex: number;
    expected: string | null;
    actual: string | null;
  }>;
  missingShots: number[];
  warnings: string[];
  blockers: string[];
}

export interface ReferenceAssemblyReviewInput
  extends Omit<Partial<AssemblyExecutionReview>, "summary"> {
  summary?: Partial<AssemblyExecutionSummary>;
  requestedTransitionName?: string | null;
  tracks?: AssemblyTimelineSnapshot | null;
}

function getPrimaryVideoTrack(review: ReferenceAssemblyReviewInput) {
  const tracks = review.tracks;
  if (!tracks || tracks.success === false || !Array.isArray(tracks.videoTracks)) {
    return null;
  }

  return tracks.videoTracks.find((track) => track.index === 0) ?? tracks.videoTracks[0] ?? null;
}

function getActualShotCount(review: ReferenceAssemblyReviewInput): number {
  const summarizedCount = review.summary?.realizedClipCount;
  if (typeof summarizedCount === "number" && summarizedCount >= 0) {
    return summarizedCount;
  }

  const primaryTrack = getPrimaryVideoTrack(review);
  if (typeof primaryTrack?.clipCount === "number") {
    return primaryTrack.clipCount;
  }

  return Array.isArray(primaryTrack?.clips) ? primaryTrack.clips.length : 0;
}

function getActualDuration(review: ReferenceAssemblyReviewInput): number {
  const primaryTrack = getPrimaryVideoTrack(review);
  const clips = Array.isArray(primaryTrack?.clips) ? primaryTrack.clips : [];
  if (clips.length === 0) {
    return 0;
  }

  const firstClip = clips[0];
  const lastClip = clips[clips.length - 1];
  const firstStart = typeof firstClip?.startTime === "number" ? firstClip.startTime : 0;
  const lastEnd = typeof lastClip?.endTime === "number"
    ? lastClip.endTime
    : firstStart;
  return Math.max(0, lastEnd - firstStart);
}

function getActualAverageShotDuration(review: ReferenceAssemblyReviewInput): number {
  const primaryTrack = getPrimaryVideoTrack(review);
  const clips = Array.isArray(primaryTrack?.clips) ? primaryTrack.clips : [];
  const durations = clips
    .map((clip) => clip.duration)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (durations.length === 0) {
    return 0;
  }

  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}

function normalizeTransition(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/\btransition\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function compareToBlueprint(
  blueprint: VideoBlueprint,
  assemblyReview: ReferenceAssemblyReviewInput,
): VideoQAReport {
  const actualShotCount = getActualShotCount(assemblyReview);
  const actualDuration = getActualDuration(assemblyReview);
  const actualAverageShotDuration = getActualAverageShotDuration(assemblyReview);
  const shotCountMatch = actualShotCount === blueprint.shots.length;
  const durationDeltaSec = Number(
    Math.abs(actualDuration - blueprint.totalDuration).toFixed(3),
  );
  const pacingDeltaPercent = blueprint.pacing.avgShotDurationSec > 0
    ? Number(
        (
          (Math.abs(actualAverageShotDuration - blueprint.pacing.avgShotDurationSec) /
            blueprint.pacing.avgShotDurationSec) *
          100
        ).toFixed(3),
      )
    : 0;
  const actualTransition = normalizeTransition(assemblyReview.requestedTransitionName);
  const expectedTransition = normalizeTransition(blueprint.dominantTransitions[0] ?? null);

  const transitionMismatches = blueprint.shots
    .slice(0, -1)
    .map((shot) => ({
      shotIndex: shot.index,
      expected: normalizeTransition(shot.transitionOut ?? expectedTransition),
      actual: actualTransition,
    }))
    .filter((item) => item.expected !== item.actual);

  const missingShots = actualShotCount < blueprint.shots.length
    ? blueprint.shots.slice(actualShotCount).map((shot) => shot.index)
    : [];

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (durationDeltaSec > 5) {
    blockers.push("The assembled timeline duration drifts from the reference blueprint by more than five seconds.");
  }

  if (!shotCountMatch) {
    blockers.push("The assembled shot count does not match the reference blueprint.");
  }

  if (transitionMismatches.length > 0) {
    warnings.push("The assembled transition strategy does not fully match the reference blueprint.");
  }

  if (pacingDeltaPercent > 20) {
    warnings.push("The assembled pacing still differs noticeably from the reference blueprint.");
  }

  const status = blockers.length > 0
    ? "fail"
    : warnings.length > 0
      ? "needs-review"
      : "pass";

  return {
    status,
    shotCountMatch,
    durationDeltaSec,
    pacingDeltaPercent,
    transitionMismatches,
    missingShots,
    warnings,
    blockers,
  };
}
