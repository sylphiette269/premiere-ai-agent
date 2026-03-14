import type { MediaFolderAsset, MediaFolderManifest } from "./media-folder-manifest.js";
import type { ShotDescriptor, VideoBlueprint } from "./video-reference-analyzer.js";

export interface ReplicationCandidate {
  shotIndex: number;
  referenceShot: ShotDescriptor;
  matchedAsset: MediaFolderAsset | null;
  matchScore: number;
  matchReasons: string[];
  fallback: boolean;
}

export interface ReplicationPlan {
  sourceVideoPath: string;
  blueprint: VideoBlueprint;
  candidates: ReplicationCandidate[];
  unmatchedShotCount: number;
  estimatedTimelineDuration: number;
  transitionStrategy: string;
  warnings: string[];
}

const VISUAL_CATEGORIES = new Set<MediaFolderAsset["category"]>(["video", "image"]);
const PATH_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const MATCH_THRESHOLD = 0.4;

function normalize(value: string): string {
  return value.toLowerCase();
}

function parseDurationHint(asset: MediaFolderAsset): number | null {
  const match = asset.basename.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|min|mins|minute|minutes)/i);
  if (!match) {
    return null;
  }

  const rawValue = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const unit = (match[2] ?? "s").toLowerCase();
  if (unit.startsWith("min")) {
    return rawValue * 60;
  }

  return rawValue;
}

function inferShotTypeFromAsset(asset: MediaFolderAsset): string {
  const comparable = normalize(asset.basename);
  if (/\bclose|detail|macro\b/.test(comparable)) {
    return "close";
  }
  if (/\bmedium|mid\b/.test(comparable)) {
    return "medium";
  }
  if (/\bwide|establish|full\b/.test(comparable)) {
    return "wide";
  }
  return "unknown";
}

function getFallbackPool(manifest: MediaFolderManifest): MediaFolderAsset[] {
  return manifest.assets
    .filter((asset) => VISUAL_CATEGORIES.has(asset.category))
    .sort((left, right) => PATH_COLLATOR.compare(left.relativePath, right.relativePath));
}

function scoreAssetMatch(
  shot: ShotDescriptor,
  asset: MediaFolderAsset,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const assetShotType = inferShotTypeFromAsset(asset);
  if (assetShotType === shot.shotType && assetShotType !== "unknown") {
    score += 0.35;
    reasons.push(`shot-type:${assetShotType}`);
  } else if (shot.shotType === "unknown" || assetShotType === "unknown") {
    score += 0.05;
    reasons.push("shot-type:unknown");
  }

  if (shot.motionAmount === "high") {
    if (asset.category === "video") {
      score += 0.35;
      reasons.push("motion:video-preferred");
    } else {
      score += 0.05;
      reasons.push("motion:image-fallback");
    }
  } else if (shot.motionAmount === "low") {
    if (asset.category === "image") {
      score += 0.25;
      reasons.push("motion:image-stable");
    } else {
      score += 0.2;
      reasons.push("motion:video-stable");
    }
  } else if (asset.category === "video") {
    score += 0.25;
    reasons.push("motion:balanced-video");
  } else {
    score += 0.15;
    reasons.push("motion:balanced-image");
  }

  const durationHint = parseDurationHint(asset);
  if (durationHint === null) {
    score += 0.05;
    reasons.push("duration:no-hint");
  } else {
    const deltaPercent = Math.abs(durationHint - shot.durationSec) / Math.max(shot.durationSec, 0.01);
    if (deltaPercent <= 0.3) {
      score += 0.3;
      reasons.push("duration:close");
    } else if (deltaPercent <= 0.5) {
      score += 0.15;
      reasons.push("duration:usable");
    }
  }

  const comparable = normalize(asset.basename);
  if (shot.motionAmount === "high" && /\baction|move|moving|run|fast\b/.test(comparable)) {
    score += 0.1;
    reasons.push("motion-keyword:dynamic");
  }
  if (shot.motionAmount === "low" && /\bstill|detail|plate|frame\b/.test(comparable)) {
    score += 0.1;
    reasons.push("motion-keyword:static");
  }

  return {
    score: Math.min(1, score),
    reasons,
  };
}

export function matchAssetsToBlueprint(
  blueprint: VideoBlueprint,
  manifest: MediaFolderManifest,
): ReplicationPlan {
  const visualAssets = getFallbackPool(manifest);
  const unusedAssets = new Set(visualAssets.map((asset) => asset.absolutePath));
  const candidates: ReplicationCandidate[] = [];

  for (const shot of blueprint.shots) {
    const rankedAssets = visualAssets
      .filter((asset) => unusedAssets.has(asset.absolutePath))
      .map((asset) => ({
        asset,
        ...scoreAssetMatch(shot, asset),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return PATH_COLLATOR.compare(left.asset.relativePath, right.asset.relativePath);
      });

    const bestMatch = rankedAssets[0];
    if (bestMatch && bestMatch.score >= MATCH_THRESHOLD) {
      unusedAssets.delete(bestMatch.asset.absolutePath);
      candidates.push({
        shotIndex: shot.index,
        referenceShot: shot,
        matchedAsset: bestMatch.asset,
        matchScore: bestMatch.score,
        matchReasons: bestMatch.reasons,
        fallback: false,
      });
      continue;
    }

    const fallbackAsset = bestMatch?.asset ?? null;
    if (fallbackAsset) {
      unusedAssets.delete(fallbackAsset.absolutePath);
    }

    candidates.push({
      shotIndex: shot.index,
      referenceShot: shot,
      matchedAsset: fallbackAsset,
      matchScore: bestMatch?.score ?? 0,
      matchReasons: bestMatch?.reasons ?? ["no-compatible-assets"],
      fallback: true,
    });
  }

  const unmatchedShotCount = candidates.filter((candidate) => candidate.fallback).length;
  const warnings = unmatchedShotCount > 0
    ? [`${unmatchedShotCount} reference shot(s) still need manual asset review.`]
    : [];

  return {
    sourceVideoPath: blueprint.sourcePath,
    blueprint,
    candidates,
    unmatchedShotCount,
    estimatedTimelineDuration: blueprint.totalDuration,
    transitionStrategy: blueprint.dominantTransitions[0] ?? "cut",
    warnings,
  };
}
