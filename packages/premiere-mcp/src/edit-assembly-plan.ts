import { readFile } from "node:fs/promises";

import {
  extractEffectPlan,
  extractTransitionPlan,
  parseVisualGuideFromDocx,
  type ParsedVisualGuide,
  type VisualGuideEffectPlan,
} from "./docx-visual-guide.js";
import {
  reviewEditReasonability,
  type EditReasonabilityReview,
  type EditReasonabilityCandidate,
} from "./edit-reasonability-review.js";
import type { MediaFolderAsset, MediaFolderManifest } from "./media-folder-manifest.js";
import type { VideoBlueprint } from "./video-reference-analyzer.js";
import { matchAssetsToBlueprint } from "./video-reference-matcher.js";

const VISUAL_CATEGORIES = new Set<MediaFolderAsset["category"]>(["video", "image"]);
const CATEGORY_PRIORITY: Record<MediaFolderAsset["category"], number> = {
  video: 0,
  image: 1,
  audio: 2,
  document: 3,
  project: 4,
  other: 5,
};
const PATH_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const REFERENCE_ONLY_MEDIA_POLICY = "reference-only" as const;
type AssemblyMotionStyle = "push_in" | "pull_out" | "alternate" | "none";

export interface PlanEditAssemblyOptions extends Omit<EditReasonabilityCandidate, "motionStyle"> {
  sourceDocxPath: string;
  guide: ParsedVisualGuide;
  manifest: MediaFolderManifest;
  sequenceName?: string;
  maxAssets?: number;
  motionStyle?: AssemblyMotionStyle | null;
  referenceBlueprint?: VideoBlueprint | null;
  referenceBlueprintPath?: string;
  matchStrategy?: string;
  minMatchScore?: number;
}

export interface PlannedAssemblyAsset {
  rank: number;
  asset: MediaFolderAsset;
  reasons: string[];
}

export interface EditAssemblyPlan {
  sourceDocxPath: string;
  guideTitle: string;
  manifestSourceRoot: string;
  sequenceName: string;
  mediaPolicy: typeof REFERENCE_ONLY_MEDIA_POLICY;
  assetPaths: string[];
  selectedAssets: PlannedAssemblyAsset[];
  skippedAssets: MediaFolderAsset[];
  transitionName: string | null;
  transitionPolicy: string;
  clipDuration: number;
  motionStyle: AssemblyMotionStyle;
  effectPlan: VisualGuideEffectPlan;
  review: EditReasonabilityReview;
}

export interface PlanEditAssemblyFromFilesOptions
  extends Omit<PlanEditAssemblyOptions, "guide" | "manifest" | "sourceDocxPath" | "referenceBlueprint"> {
  docxPath: string;
  mediaManifestPath: string;
}

function sanitizeSequenceName(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "Premiere Assembly Auto Plan";
  }

  return `${trimmed.slice(0, 48)} Auto Plan`;
}

function getOrderedVisualAssets(manifest: MediaFolderManifest): MediaFolderAsset[] {
  return manifest.assets
    .filter((asset) => VISUAL_CATEGORIES.has(asset.category))
    .sort((left, right) => {
      const categoryDelta = CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category];
      if (categoryDelta !== 0) {
        return categoryDelta;
      }

      return PATH_COLLATOR.compare(left.relativePath, right.relativePath);
    });
}

function suggestClipDuration(
  assets: MediaFolderAsset[],
  requested: number | null | undefined,
): number {
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  const count = assets.length;
  const videoCount = assets.filter((asset) => asset.category === "video").length;
  const imageCount = assets.filter((asset) => asset.category === "image").length;

  if (count >= 12) {
    return 2.5;
  }

  if (count >= 8) {
    return 3;
  }

  if (videoCount > 0 && imageCount > 0) {
    return 4;
  }

  if (imageCount === count && count > 0) {
    return 4;
  }

  return 4;
}

function suggestMotionStyle(
  assets: MediaFolderAsset[],
  requested: AssemblyMotionStyle | null | undefined,
): AssemblyMotionStyle {
  if (requested) {
    return requested;
  }

  return "none";
}

function resolveTransitionPolicy(
  requestedTransitionName: string | null,
  requestedTransitionPolicy: string | null | undefined,
): string {
  if (requestedTransitionPolicy?.trim()) {
    return requestedTransitionPolicy.trim();
  }

  return requestedTransitionName ? "guide-derived" : "explicit-only";
}

function selectAssetsFromBlueprint(
  blueprint: VideoBlueprint,
  manifest: MediaFolderManifest,
  maxAssets: number | null,
  minMatchScore: number,
): PlannedAssemblyAsset[] {
  const replicationPlan = matchAssetsToBlueprint(blueprint, manifest);
  const matchedCandidates = replicationPlan.candidates
    .filter((candidate) =>
      candidate.matchedAsset !== null &&
      candidate.matchScore >= minMatchScore,
    )
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }
      if (left.shotIndex !== right.shotIndex) {
        return left.shotIndex - right.shotIndex;
      }
      return PATH_COLLATOR.compare(
        left.matchedAsset?.relativePath ?? "",
        right.matchedAsset?.relativePath ?? "",
      );
    });

  const limitedCandidates = maxAssets !== null
    ? matchedCandidates.slice(0, maxAssets)
    : matchedCandidates;

  return limitedCandidates.map((candidate, index) => ({
    rank: index + 1,
    asset: candidate.matchedAsset as MediaFolderAsset,
    reasons: [
      "blueprint-match",
      `match-score:${candidate.matchScore.toFixed(3)}`,
      ...candidate.matchReasons,
    ],
  }));
}

export function planEditAssembly(options: PlanEditAssemblyOptions): EditAssemblyPlan {
  const orderedVisualAssets = getOrderedVisualAssets(options.manifest);
  const maxAssets = typeof options.maxAssets === "number" && options.maxAssets > 0
    ? Math.floor(options.maxAssets)
    : null;
  const matchStrategy = options.referenceBlueprint ? "blueprint" : options.matchStrategy ?? "keyword";
  const minMatchScore =
    typeof options.minMatchScore === "number" && Number.isFinite(options.minMatchScore)
      ? options.minMatchScore
      : 0.4;
  const selectedAssets = matchStrategy === "blueprint" && options.referenceBlueprint
    ? selectAssetsFromBlueprint(
        options.referenceBlueprint,
        options.manifest,
        maxAssets,
        minMatchScore,
      )
    : (maxAssets !== null
        ? orderedVisualAssets.slice(0, maxAssets)
        : orderedVisualAssets).map((asset, index) => ({
          rank: index + 1,
          asset,
          reasons: [
            "visual-asset",
            "deterministic-folder-order",
            asset.category === "video" ? "video-priority" : "image-fallback",
          ],
        }));
  const selectedAssetPool = selectedAssets.map((entry) => entry.asset);
  const selectedAssetPaths = selectedAssets.map((entry) => entry.asset.absolutePath);
  const selectedPathSet = new Set(selectedAssetPaths);
  const skippedAssets = options.manifest.assets.filter(
    (asset) => !selectedPathSet.has(asset.absolutePath),
  );
  const effectPlan = extractEffectPlan(options.guide);
  const transitionPlan = extractTransitionPlan(options.guide);
  const transitionName =
    options.transitionName?.trim() ||
    transitionPlan.preferredClipTransition ||
    null;
  const transitionPolicy = resolveTransitionPolicy(
    transitionName,
    options.transitionPolicy,
  );
  const clipDuration = suggestClipDuration(selectedAssetPool, options.clipDuration);
  const motionStyle = suggestMotionStyle(selectedAssetPool, options.motionStyle);
  const mediaPolicy = REFERENCE_ONLY_MEDIA_POLICY;
  const review = reviewEditReasonability({
    sourceDocxPath: options.sourceDocxPath,
    guide: options.guide,
    manifest: options.manifest,
    transitionPlan,
    candidate: {
      assetPaths: selectedAssetPaths,
      transitionName,
      transitionPolicy,
      clipDuration,
      motionStyle,
      mediaPolicy,
    },
  });

  return {
    sourceDocxPath: options.sourceDocxPath,
    guideTitle: options.guide.title,
    manifestSourceRoot: options.manifest.sourceRoot,
    sequenceName: options.sequenceName?.trim()
      ? options.sequenceName.trim()
      : sanitizeSequenceName(options.guide.title),
    mediaPolicy,
    assetPaths: selectedAssetPaths,
    selectedAssets,
    skippedAssets,
    transitionName,
    transitionPolicy,
    clipDuration,
    motionStyle,
    effectPlan,
    review,
  };
}

export function generateEditAssemblyPlanMarkdown(plan: EditAssemblyPlan): string {
  const lines: string[] = [
    "---",
    `source_docx: ${JSON.stringify(plan.sourceDocxPath)}`,
    `guide_title: ${JSON.stringify(plan.guideTitle)}`,
    `sequence_name: ${JSON.stringify(plan.sequenceName)}`,
    `status: ${plan.review.status}`,
    `selected_asset_count: ${plan.selectedAssets.length}`,
    `skipped_asset_count: ${plan.skippedAssets.length}`,
    "---",
    "",
    "# Edit Assembly Plan",
    "",
    "## Planned Settings",
    "",
    `- Sequence Name: ${plan.sequenceName}`,
    `- Media Policy: ${plan.mediaPolicy}`,
    `- Clip Duration: ${plan.clipDuration}`,
    `- Motion Style: ${plan.motionStyle}`,
    `- Transition Name: ${plan.transitionName ?? "none"}`,
    `- Transition Policy: ${plan.transitionPolicy}`,
    `- Review Status: ${plan.review.status}`,
    "",
    "## Planned Effects",
    "",
    `- Global Clip Effects: ${plan.effectPlan.globalClipEffects.length > 0 ? plan.effectPlan.globalClipEffects.join(", ") : "none"}`,
    `- Optional Clip Effects: ${plan.effectPlan.optionalClipEffects.length > 0 ? plan.effectPlan.optionalClipEffects.join(", ") : "none"}`,
    "",
    "## Planned Assets",
    "",
  ];

  if (plan.selectedAssets.length === 0) {
    lines.push("- None", "");
  } else {
    for (const entry of plan.selectedAssets) {
      lines.push(
        `- ${entry.rank}. ${entry.asset.relativePath} (${entry.asset.category}) [${entry.reasons.join(", ")}]`,
      );
    }
    lines.push("");
  }

  lines.push("## Skipped Assets", "");
  if (plan.skippedAssets.length === 0) {
    lines.push("- None", "");
  } else {
    for (const asset of plan.skippedAssets) {
      lines.push(`- ${asset.relativePath} (${asset.category})`);
    }
    lines.push("");
  }

  lines.push("## Review Summary", "");
  lines.push(`- Blockers: ${plan.review.summary.blockerCount}`);
  lines.push(`- Warnings: ${plan.review.summary.warningCount}`);
  lines.push(`- Notes: ${plan.review.summary.noteCount}`);
  lines.push(`- Unresolved Visual Steps: ${plan.review.summary.unresolvedVisualStepCount}`);
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}

export async function planEditAssemblyFromFiles(
  options: PlanEditAssemblyFromFilesOptions,
): Promise<{
  plan: EditAssemblyPlan;
  markdownPlan: string;
}> {
  const guide = await parseVisualGuideFromDocx(options.docxPath);
  const manifest = JSON.parse(
    await readFile(options.mediaManifestPath, "utf8"),
  ) as MediaFolderManifest;
  const referenceBlueprint = options.referenceBlueprintPath
    ? JSON.parse(await readFile(options.referenceBlueprintPath, "utf8")) as VideoBlueprint
    : null;

  const plan = planEditAssembly({
    sourceDocxPath: options.docxPath,
    guide,
    manifest,
    sequenceName: options.sequenceName,
    maxAssets: options.maxAssets,
    transitionName: options.transitionName,
    transitionPolicy: options.transitionPolicy,
    clipDuration: options.clipDuration,
    motionStyle: options.motionStyle,
    mediaPolicy: options.mediaPolicy,
    assetPaths: options.assetPaths,
    referenceBlueprint,
    referenceBlueprintPath: options.referenceBlueprintPath,
    matchStrategy: options.matchStrategy,
    minMatchScore: options.minMatchScore,
  });

  return {
    plan,
    markdownPlan: generateEditAssemblyPlanMarkdown(plan),
  };
}
