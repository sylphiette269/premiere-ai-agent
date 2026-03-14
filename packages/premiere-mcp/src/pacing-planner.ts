export interface PacingPlan {
  totalDurationSec: number;
  shotCount: number;
  rhythm: string;
  shotDurations: number[];
  transitionOverlapSec: number;
}

function normalizeWeights(weights: number[], total: number): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) {
    return weights.map(() => 0);
  }

  return weights.map((weight) => (weight / weightSum) * total);
}

function createDeterministicNoise(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function computePacingPlan(
  targetDurationSec: number,
  shotCount: number,
  rhythm: string,
  transitionDurationSec = 0,
): PacingPlan {
  if (shotCount <= 0) {
    return {
      totalDurationSec: targetDurationSec,
      shotCount,
      rhythm,
      shotDurations: [],
      transitionOverlapSec: 0,
    };
  }

  const overlapPerBoundary = Math.max(transitionDurationSec, 0);
  const totalOverlap = overlapPerBoundary * Math.max(shotCount - 1, 0);
  const transitionOverlapSec = -totalOverlap;
  const totalClipDuration = targetDurationSec - transitionOverlapSec;
  let weights: number[];

  if (rhythm === "building") {
    weights = Array.from({ length: shotCount }, (_, index) => {
      if (shotCount === 1) {
        return 1;
      }
      const progress = index / (shotCount - 1);
      return 1.5 - progress * 0.5;
    });
  } else if (rhythm === "irregular") {
    const nextRandom = createDeterministicNoise(shotCount);
    weights = Array.from({ length: shotCount }, () => 0.7 + nextRandom() * 0.6);
  } else {
    weights = Array.from({ length: shotCount }, () => 1);
  }

  const shotDurations = normalizeWeights(weights, totalClipDuration).map((value) =>
    Number(value.toFixed(6))
  );

  return {
    totalDurationSec: targetDurationSec,
    shotCount,
    rhythm,
    shotDurations,
    transitionOverlapSec,
  };
}
