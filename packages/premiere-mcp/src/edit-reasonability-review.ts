import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

import {
  extractTransitionPlan,
  parseVisualGuideFromDocx,
  type ParsedVisualGuide,
  type VisualGuideTransitionPlan,
} from "./docx-visual-guide.js";
import type { MediaFolderAsset, MediaFolderManifest } from "./media-folder-manifest.js";
import { compareToBlueprint, type VideoQAReport } from "./video-reference-qa.js";
import type { VideoBlueprint } from "./video-reference-analyzer.js";

const VISUAL_CATEGORIES = new Set<MediaFolderAsset["category"]>(["video", "image"]);
const REFERENCE_ONLY_MEDIA_POLICY = "reference-only";

export type EditReasonabilityStatus = "ready" | "needs-review" | "blocked";
export type EditReasonabilityFindingSeverity = "blocker" | "warning" | "note";

export interface EditReasonabilityCandidate {
  assetPaths?: string[];
  transitionName?: string | null;
  transitionPolicy?: string | null;
  clipDuration?: number | null;
  motionStyle?: string | null;
  mediaPolicy?: string | null;
}

export interface EditReasonabilityFinding {
  severity: EditReasonabilityFindingSeverity;
  code: string;
  message: string;
  details?: string[];
}

export interface EditReasonabilitySummary {
  blockerCount: number;
  warningCount: number;
  noteCount: number;
  unresolvedVisualStepCount: number;
  eligibleAssetCount: number;
  selectedAssetCount: number;
  missingSelectedAssetCount: number;
}

export interface EditReasonabilityReview {
  sourceDocxPath: string;
  guideTitle: string;
  manifestSourceRoot: string;
  status: EditReasonabilityStatus;
  transitionPlan: VisualGuideTransitionPlan;
  candidate: EditReasonabilityCandidate | null;
  findings: EditReasonabilityFinding[];
  summary: EditReasonabilitySummary;
  eligibleAssets: MediaFolderAsset[];
  excludedAssets: MediaFolderAsset[];
  selectedAssets: MediaFolderAsset[];
  missingSelectedAssetPaths: string[];
}

export interface ReviewEditReasonabilityOptions {
  sourceDocxPath: string;
  guide: ParsedVisualGuide;
  manifest: MediaFolderManifest;
  transitionPlan?: VisualGuideTransitionPlan;
  candidate?: EditReasonabilityCandidate;
}

export interface ReviewEditReasonabilityFromFilesOptions
  extends EditReasonabilityCandidate {
  docxPath: string;
  mediaManifestPath: string;
  assetPaths?: string[];
}

export interface AssemblyOperationResult {
  success?: boolean;
  skipped?: boolean;
  error?: string;
  note?: string;
  [key: string]: unknown;
}

export interface AssemblyExecutionFinding {
  severity: EditReasonabilityFindingSeverity;
  code: string;
  message: string;
  details?: string[];
}

export interface AssemblyExecutionSummary {
  expectedTransitionCount: number;
  successfulTransitionCount: number;
  failedTransitionCount: number;
  failedTransitionStageCounts: Record<string, number>;
  failedEffectCount: number;
  failedAnimationCount: number;
  failedOverlayCount: number;
  failedPolishCount: number;
  targetTrackIndex: number;
  realizedClipCount: number | null;
  requestedSequenceId: string | null;
  resolvedSequenceId: string | null;
  sequenceName: string | null;
  usedActiveSequenceFallback: boolean;
  continuityIssueCount: number;
  continuityIssueSource: AssemblyContinuityIssueSource;
}

export interface AssemblyExecutionReview {
  status: EditReasonabilityStatus;
  findings: AssemblyExecutionFinding[];
  summary: AssemblyExecutionSummary;
  videoQAReport?: VideoQAReport;
}

export interface AssemblyTimelineClipSnapshot {
  id?: string;
  name?: string;
  sequenceName?: string;
  trackType?: string;
  trackIndex?: number;
  clipIndex?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  gapAfterSec?: number | null;
  overlapAfterSec?: number | null;
}

export interface AssemblyTimelineTrackSnapshot {
  index?: number;
  name?: string;
  clipCount?: number;
  clips?: AssemblyTimelineClipSnapshot[];
}

export interface AssemblyTimelineSnapshot {
  success?: boolean;
  error?: string;
  sequenceId?: string;
  resolvedSequenceId?: string;
  sequenceName?: string;
  usedActiveSequenceFallback?: boolean;
  videoTracks?: AssemblyTimelineTrackSnapshot[];
  audioTracks?: AssemblyTimelineTrackSnapshot[];
}

export interface ReviewAssemblyExecutionOptions {
  requestedTransitionName?: string | null;
  requestedEffectNames?: string[];
  expectedTransitionCount?: number;
  expectedClipCount?: number;
  expectedAssetPaths?: string[];
  referenceBlueprintPath?: string;
  assembledTrackIndex?: number;
  motionStyle?: string | null;
  mogrtRequested?: boolean;
  effects?: AssemblyOperationResult[];
  transitions?: AssemblyOperationResult[];
  animations?: AssemblyOperationResult[];
  overlays?: AssemblyOperationResult[];
  polish?: AssemblyOperationResult[];
  tracks?: AssemblyTimelineSnapshot | null;
}

export type AssemblyContinuityIssueSource = "none" | "derived" | "metadata";

const CONTINUITY_TOLERANCE_SECONDS = 0.05;

function normalizeComparablePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function normalizeTransitionComparisonKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/\btransition\b/g, "")
    .replace(/\beffect\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function countFindings(
  findings: EditReasonabilityFinding[],
  severity: EditReasonabilityFindingSeverity,
): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function getSuccessfulOperations(
  operations: AssemblyOperationResult[] | undefined,
): AssemblyOperationResult[] {
  return (operations ?? []).filter(
    (operation) => operation?.skipped !== true && operation?.success !== false,
  );
}

function getFailedOperations(
  operations: AssemblyOperationResult[] | undefined,
): AssemblyOperationResult[] {
  return (operations ?? []).filter(
    (operation) => operation?.skipped !== true && operation?.success === false,
  );
}

function summarizeOperationStages(
  operations: AssemblyOperationResult[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const operation of operations) {
    const stage =
      typeof operation.stage === "string" && operation.stage.trim().length > 0
        ? operation.stage.trim()
        : "unknown";
    counts[stage] = (counts[stage] ?? 0) + 1;
  }
  return counts;
}

function formatTransitionFailureDetail(
  operation: AssemblyOperationResult,
  index: number,
): string {
  const parts = [`${index + 1}.`];
  if (typeof operation.stage === "string" && operation.stage.trim().length > 0) {
    parts.push(`[${operation.stage.trim()}]`);
  }
  parts.push(operation.error ?? "Transition application failed.");

  const context: string[] = [];
  if (typeof operation.sequenceName === "string" && operation.sequenceName.trim().length > 0) {
    context.push(`sequence=${operation.sequenceName.trim()}`);
  } else if (typeof operation.sequenceId === "string" && operation.sequenceId.trim().length > 0) {
    context.push(`sequenceId=${operation.sequenceId.trim()}`);
  }
  if (typeof operation.trackType === "string" && typeof operation.trackIndex === "number") {
    context.push(`${operation.trackType}${operation.trackIndex + 1}`);
  }
  if (typeof operation.clipIndex === "number") {
    context.push(`clip=${operation.clipIndex + 1}`);
  } else if (
    typeof operation.clipIndex1 === "number" &&
    typeof operation.clipIndex2 === "number"
  ) {
    context.push(`boundary=${operation.clipIndex1 + 1}->${operation.clipIndex2 + 1}`);
  }
  if (typeof operation.durationFrames === "number") {
    context.push(`frames=${operation.durationFrames}`);
  }
  if (typeof operation.gapAfterSec === "number") {
    context.push(`gap=${operation.gapAfterSec.toFixed(2)}s`);
  }
  if (typeof operation.overlapAfterSec === "number") {
    context.push(`overlap=${operation.overlapAfterSec.toFixed(2)}s`);
  }

  return context.length > 0 ? `${parts.join(" ")} (${context.join(", ")})` : parts.join(" ");
}

function getComparableBasename(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\\/g, "/");
  const basename = normalized.split("/").pop()?.trim();
  return basename ? basename.toLowerCase() : null;
}

function formatTimelineClipLabel(
  clip: AssemblyTimelineClipSnapshot,
  fallbackTrackIndex: number,
  fallbackClipIndex: number,
): string {
  const resolvedTrackIndex =
    typeof clip.trackIndex === "number" ? clip.trackIndex : fallbackTrackIndex;
  const resolvedClipIndex =
    typeof clip.clipIndex === "number" ? clip.clipIndex : fallbackClipIndex;
  const clipName = clip.name ?? clip.id ?? "clip";
  return `V${resolvedTrackIndex + 1} clip ${resolvedClipIndex + 1} (${clipName})`;
}

export function reviewEditReasonability(
  options: ReviewEditReasonabilityOptions,
): EditReasonabilityReview {
  const transitionPlan = options.transitionPlan ?? extractTransitionPlan(options.guide);
  const candidate = options.candidate ?? null;
  const findings: EditReasonabilityFinding[] = [];
  const assetByPath = new Map(
    options.manifest.assets.map((asset) => [normalizeComparablePath(asset.absolutePath), asset]),
  );

  const eligibleAssets = options.manifest.assets.filter((asset) =>
    VISUAL_CATEGORIES.has(asset.category),
  );
  const excludedAssets = options.manifest.assets.filter(
    (asset) => !VISUAL_CATEGORIES.has(asset.category),
  );

  const selectedAssets: MediaFolderAsset[] = [];
  const invalidSelectedAssets: MediaFolderAsset[] = [];
  const missingSelectedAssetPaths: string[] = [];

  for (const selectedPath of candidate?.assetPaths ?? []) {
    const asset = assetByPath.get(normalizeComparablePath(selectedPath));
    if (!asset) {
      missingSelectedAssetPaths.push(selectedPath);
      continue;
    }

    selectedAssets.push(asset);
    if (!VISUAL_CATEGORIES.has(asset.category)) {
      invalidSelectedAssets.push(asset);
    }
  }

  const unresolvedVisualSteps = options.guide.steps
    .filter((step) => step.visualDependencies.length > 0)
    .map((step) => step.number);

  if (eligibleAssets.length === 0) {
    findings.push({
      severity: "blocker",
      code: "no-visual-assets",
      message: "The scanned media folder does not contain any video or image assets for timeline assembly.",
    });
  }

  if (unresolvedVisualSteps.length > 0) {
    findings.push({
      severity: "warning",
      code: "unresolved-visual-steps",
      message: "The source guide still contains screenshot-only parameters that need manual confirmation.",
      details: unresolvedVisualSteps.map((stepNumber) => `Step ${stepNumber}`),
    });
  }

  if (excludedAssets.length > 0) {
    findings.push({
      severity: "note",
      code: "excluded-non-visual-assets",
      message: "The source folder also contains non-visual files that should stay out of the timeline selection.",
      details: excludedAssets.map((asset) => `${asset.relativePath} (${asset.category})`),
    });
  }

  if (
    candidate?.mediaPolicy &&
    candidate.mediaPolicy !== REFERENCE_ONLY_MEDIA_POLICY
  ) {
    findings.push({
      severity: "warning",
      code: "reference-only-policy-mismatch",
      message: `The candidate plan uses media policy "${candidate.mediaPolicy}" instead of "${REFERENCE_ONLY_MEDIA_POLICY}".`,
    });
  }

  if (missingSelectedAssetPaths.length > 0) {
    findings.push({
      severity: "blocker",
      code: "selected-asset-not-in-manifest",
      message: "One or more selected asset paths are not present in the scanned manifest.",
      details: missingSelectedAssetPaths,
    });
  }

  if (invalidSelectedAssets.length > 0) {
    findings.push({
      severity: "blocker",
      code: "invalid-selected-asset-category",
      message: "The candidate plan selects non-visual assets for a visual assembly workflow.",
      details: invalidSelectedAssets.map(
        (asset) => `${asset.relativePath} (${asset.category})`,
      ),
    });
  }

  const selectedVisualAssets = selectedAssets.filter((asset) =>
    VISUAL_CATEGORIES.has(asset.category),
  );

  const requestedTransitionName = candidate?.transitionName?.trim() || null;
  const requestedTransitionPolicy = candidate?.transitionPolicy?.trim() || null;
  const requestedTransitionKey = normalizeTransitionComparisonKey(requestedTransitionName);
  const preferredTransitionKey = normalizeTransitionComparisonKey(
    transitionPlan.preferredClipTransition,
  );
  if (
    requestedTransitionPolicy === "guide-derived" &&
    (transitionPlan.preferredClipTransition !== null ||
      transitionPlan.applyAsDefaultTransitionToAll)
  ) {
    findings.push({
      severity: "blocker",
      code: "guide-derived-transition-manual-only",
      message:
        "DOCX-derived clip transitions are manual-only for this workflow because the current Premiere automation path is not trusted to recreate them safely.",
      details: [
        ...(transitionPlan.preferredClipTransition
          ? [`Guide transition: ${transitionPlan.preferredClipTransition}`]
          : []),
        ...(transitionPlan.applyAsDefaultTransitionToAll
          ? ["Guide requests default-transition batch application."]
          : []),
      ],
    });
  }
  if (
    requestedTransitionName === "Cross Dissolve" &&
    transitionPlan.avoidDefaultCrossDissolve
  ) {
    findings.push({
      severity: "blocker",
      code: "avoid-default-cross-dissolve",
      message: "The guide requires an explicit transition decision, so Cross Dissolve must not be inserted as an automatic fallback.",
    });
  }

  if (
    requestedTransitionName &&
    transitionPlan.preferredClipTransition &&
    requestedTransitionKey !== preferredTransitionKey
  ) {
    findings.push({
      severity: "warning",
      code: "transition-mismatch",
      message: `The candidate transition "${requestedTransitionName}" does not match the guide preference "${transitionPlan.preferredClipTransition}".`,
    });
  }

  if (
    (requestedTransitionName !== null || transitionPlan.applyAsDefaultTransitionToAll) &&
    selectedVisualAssets.length < 2
  ) {
    findings.push({
      severity: "blocker",
      code: "too-few-assets-for-transition",
      message: "At least two visual assets are required before clip-to-clip transitions can be applied.",
    });
  }

  const blockerCount = countFindings(findings, "blocker");
  const warningCount = countFindings(findings, "warning");
  const noteCount = countFindings(findings, "note");
  const status: EditReasonabilityStatus =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "needs-review" : "ready";

  return {
    sourceDocxPath: options.sourceDocxPath,
    guideTitle: options.guide.title,
    manifestSourceRoot: options.manifest.sourceRoot,
    status,
    transitionPlan,
    candidate,
    findings,
    summary: {
      blockerCount,
      warningCount,
      noteCount,
      unresolvedVisualStepCount: unresolvedVisualSteps.length,
      eligibleAssetCount: eligibleAssets.length,
      selectedAssetCount: selectedAssets.length,
      missingSelectedAssetCount: missingSelectedAssetPaths.length,
    },
    eligibleAssets,
    excludedAssets,
    selectedAssets,
    missingSelectedAssetPaths,
  };
}

export function reviewAssemblyExecution(
  options: ReviewAssemblyExecutionOptions,
): AssemblyExecutionReview {
  const findings: AssemblyExecutionFinding[] = [];
  const expectedTransitionCount = options.expectedTransitionCount ?? 0;
  const targetTrackIndex = options.assembledTrackIndex ?? 0;
  const successfulTransitions = getSuccessfulOperations(options.transitions);
  const failedTransitions = getFailedOperations(options.transitions);
  const failedEffects = getFailedOperations(options.effects);
  const failedAnimations = getFailedOperations(options.animations);
  const failedOverlays = getFailedOperations(options.overlays);
  const failedPolish = getFailedOperations(options.polish);
  const failedTransitionStageCounts = summarizeOperationStages(failedTransitions);
  const requestedSequenceId =
    typeof options.tracks?.sequenceId === "string" ? options.tracks.sequenceId : null;
  const resolvedSequenceId =
    typeof options.tracks?.resolvedSequenceId === "string"
      ? options.tracks.resolvedSequenceId
      : null;
  const sequenceName =
    typeof options.tracks?.sequenceName === "string" ? options.tracks.sequenceName : null;
  const usedActiveSequenceFallback = options.tracks?.usedActiveSequenceFallback === true;
  let realizedClipCount: number | null = null;
  let continuityIssueCount = 0;
  let continuityIssueSource: AssemblyContinuityIssueSource = "none";
  let videoQAReport: VideoQAReport | undefined;

  if (
    options.requestedTransitionName &&
    expectedTransitionCount > 0 &&
    failedTransitions.length > 0
  ) {
    findings.push({
      severity: "blocker",
      code: "transition-operations-failed",
      message: `The explicit transition "${options.requestedTransitionName}" did not apply cleanly to every expected clip boundary.`,
      details: failedTransitions.map(
        (operation, index) => formatTransitionFailureDetail(operation, index),
      ),
    });
  }

  if ((options.requestedEffectNames ?? []).length > 0 && failedEffects.length > 0) {
    findings.push({
      severity: "blocker",
      code: "guide-effect-operations-failed",
      message:
        "One or more guide-derived clip effects failed to apply, so the assembled timeline is missing required finishing work.",
      details: failedEffects.map(
        (operation, index) =>
          `${index + 1}. ${operation.error ?? "Guide-derived effect application failed."}`,
      ),
    });
  }

  if (options.mogrtRequested && failedOverlays.length > 0) {
    findings.push({
      severity: "blocker",
      code: "overlay-operations-failed",
      message:
        "The requested MOGRT overlay did not import successfully, so the branded assembly is incomplete.",
      details: failedOverlays.map(
        (operation, index) =>
          `${index + 1}. ${operation.error ?? "Overlay import failed."}`,
      ),
    });
  }

  if ((options.motionStyle ?? "none") !== "none" && failedAnimations.length > 0) {
    findings.push({
      severity: "warning",
      code: "animation-operations-failed",
      message:
        "One or more motion keyframe operations failed, so the assembled timeline needs manual motion review.",
      details: failedAnimations.map(
        (operation, index) =>
          `${index + 1}. ${operation.error ?? "Keyframe application failed."}`,
      ),
    });
  }

  if (failedPolish.length > 0) {
    findings.push({
      severity: "warning",
      code: "polish-operations-failed",
      message:
        "One or more finishing operations failed, so the assembled timeline needs manual polish review.",
      details: failedPolish.map(
        (operation, index) =>
          `${index + 1}. ${operation.error ?? "Finishing operation failed."}`,
      ),
    });
  }

  const expectedClipCount =
    options.expectedClipCount ??
    (Array.isArray(options.expectedAssetPaths) ? options.expectedAssetPaths.length : 0);

  if (options.tracks) {
    if (options.tracks.success === false) {
      findings.push({
        severity: "warning",
        code: "timeline-snapshot-unavailable",
        message:
          "The assembled timeline could not be read back from Premiere, so clip-level conformance still needs manual review.",
        details: options.tracks.error ? [options.tracks.error] : undefined,
      });
    } else {
      if (usedActiveSequenceFallback) {
        findings.push({
          severity: "warning",
          code: "timeline-sequence-fallback-used",
          message:
            "The realized timeline snapshot fell back to Premiere's active sequence instead of the requested sequence, so conformance still needs manual review.",
          details: [
            ...(requestedSequenceId ? [`Requested sequence: ${requestedSequenceId}`] : []),
            ...(resolvedSequenceId ? [`Resolved sequence: ${resolvedSequenceId}`] : []),
            ...(sequenceName ? [`Resolved sequence name: ${sequenceName}`] : []),
          ],
        });
      }

      const videoTracks = Array.isArray(options.tracks.videoTracks)
        ? options.tracks.videoTracks
        : [];
      const targetTrack =
        videoTracks.find((track) => track.index === targetTrackIndex) ??
        videoTracks[targetTrackIndex] ??
        null;

      if (!targetTrack) {
        findings.push({
          severity: "warning",
          code: "timeline-track-snapshot-missing",
          message: `The assembled main video track V${targetTrackIndex + 1} was not present in the returned timeline snapshot.`,
        });
      } else {
        const realizedClips = Array.isArray(targetTrack.clips) ? targetTrack.clips : [];
        realizedClipCount =
          typeof targetTrack.clipCount === "number"
            ? targetTrack.clipCount
            : realizedClips.length;

        if (expectedClipCount > 0 && realizedClipCount < expectedClipCount) {
          findings.push({
            severity: "blocker",
            code: "timeline-missing-clips",
            message:
              "The realized main video track contains fewer clips than the assembled plan expected.",
            details: [
              `Expected clips: ${expectedClipCount}`,
              `Realized clips on V${targetTrackIndex + 1}: ${realizedClipCount}`,
            ],
          });
        } else if (expectedClipCount > 0 && realizedClipCount > expectedClipCount) {
          findings.push({
            severity: "warning",
            code: "timeline-extra-clips",
            message:
              "The realized main video track contains more clips than the assembled plan expected.",
            details: [
              `Expected clips: ${expectedClipCount}`,
              `Realized clips on V${targetTrackIndex + 1}: ${realizedClipCount}`,
            ],
          });
        }

        const invalidDurationClips = realizedClips.filter(
          (clip) => typeof clip.duration === "number" && clip.duration <= 0,
        );
        if (invalidDurationClips.length > 0) {
          findings.push({
            severity: "warning",
            code: "timeline-invalid-clip-duration",
            message:
              "One or more realized clips have zero or negative duration and need manual timeline review.",
            details: invalidDurationClips.map(
              (clip, index) =>
                `${index + 1}. ${clip.name ?? clip.id ?? "Unnamed clip"} (${clip.duration}s)`,
            ),
          });
        }

        const expectedAssetNames = (options.expectedAssetPaths ?? [])
          .map((assetPath) => getComparableBasename(assetPath))
          .filter((value): value is string => value !== null);
        const realizedClipNames = realizedClips
          .map((clip) => getComparableBasename(clip.name))
          .filter((value): value is string => value !== null);
        const comparedCount = Math.min(expectedAssetNames.length, realizedClipNames.length);
        const orderMismatches: string[] = [];
        for (let index = 0; index < comparedCount; index += 1) {
          if (expectedAssetNames[index] !== realizedClipNames[index]) {
            orderMismatches.push(
              `${index + 1}. expected ${expectedAssetNames[index]}, realized ${realizedClipNames[index]}`,
            );
          }
        }
        if (orderMismatches.length > 0) {
          findings.push({
            severity: "warning",
            code: "timeline-order-mismatch",
            message:
              "The realized clip order on the main video track no longer matches the assembled asset plan.",
            details: orderMismatches,
          });
        }

        const continuityIssues: string[] = [];
        let usedMetadataContinuity = false;
        let usedDerivedContinuity = false;
        for (let index = 0; index < realizedClips.length - 1; index += 1) {
          const current = realizedClips[index];
          const next = realizedClips[index + 1];
          const currentLabel = formatTimelineClipLabel(current, targetTrackIndex, index);
          const nextLabel = formatTimelineClipLabel(next, targetTrackIndex, index + 1);
          const gapAfterSec =
            typeof current.gapAfterSec === "number" ? current.gapAfterSec : null;
          const overlapAfterSec =
            typeof current.overlapAfterSec === "number" ? current.overlapAfterSec : null;

          if (gapAfterSec !== null) {
            usedMetadataContinuity = true;
            if (gapAfterSec > CONTINUITY_TOLERANCE_SECONDS) {
              continuityIssues.push(
                `${index + 1}. gap of ${gapAfterSec.toFixed(2)}s between ${currentLabel} and ${nextLabel}`,
              );
            }
            continue;
          }

          if (overlapAfterSec !== null) {
            usedMetadataContinuity = true;
            if (overlapAfterSec > CONTINUITY_TOLERANCE_SECONDS) {
              continuityIssues.push(
                `${index + 1}. overlap of ${overlapAfterSec.toFixed(2)}s between ${currentLabel} and ${nextLabel}`,
              );
            }
            continue;
          }

          if (
            typeof current.endTime !== "number" ||
            typeof next.startTime !== "number"
          ) {
            continue;
          }

          usedDerivedContinuity = true;
          const delta = next.startTime - current.endTime;
          if (delta > CONTINUITY_TOLERANCE_SECONDS) {
            continuityIssues.push(
              `${index + 1}. gap of ${delta.toFixed(2)}s between ${currentLabel} and ${nextLabel}`,
            );
          } else if (delta < -CONTINUITY_TOLERANCE_SECONDS) {
            continuityIssues.push(
              `${index + 1}. overlap of ${Math.abs(delta).toFixed(2)}s between ${currentLabel} and ${nextLabel}`,
            );
          }
        }
        continuityIssueCount = continuityIssues.length;
        if (usedMetadataContinuity) {
          continuityIssueSource = "metadata";
        } else if (usedDerivedContinuity) {
          continuityIssueSource = "derived";
        }
        if (continuityIssues.length > 0) {
          findings.push({
            severity: "warning",
            code: "timeline-continuity-mismatch",
            message:
              "The realized main video track contains timing gaps or overlaps between adjacent clips.",
            details: continuityIssues,
          });
        }
      }
    }
  }

  if (options.referenceBlueprintPath) {
    try {
      const blueprint = JSON.parse(
        readFileSync(options.referenceBlueprintPath, "utf8"),
      ) as VideoBlueprint;
      videoQAReport = compareToBlueprint(blueprint, {
        summary: {
          realizedClipCount,
        },
        requestedTransitionName: options.requestedTransitionName,
        tracks: options.tracks ?? null,
      });

      if (videoQAReport.status === "fail") {
        findings.push({
          severity: "blocker",
          code: "reference-video-qa-failed",
          message:
            "The assembled timeline diverges too far from the reference video blueprint and needs manual correction.",
          details: [
            ...videoQAReport.blockers,
            ...videoQAReport.warnings,
          ],
        });
      } else if (videoQAReport.status === "needs-review") {
        findings.push({
          severity: "warning",
          code: "reference-video-qa-needs-review",
          message:
            "The assembled timeline still needs review against the reference video blueprint.",
          details: [
            ...videoQAReport.blockers,
            ...videoQAReport.warnings,
          ],
        });
      }
    } catch (error) {
      findings.push({
        severity: "warning",
        code: "reference-blueprint-unavailable",
        message:
          "The reference blueprint could not be read for post-assembly QA.",
        details: [String(error)],
      });
    }
  }

  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const status: EditReasonabilityStatus =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "needs-review" : "ready";

  return {
    status,
    findings,
    summary: {
      expectedTransitionCount,
      successfulTransitionCount: successfulTransitions.length,
      failedTransitionCount: failedTransitions.length,
      failedTransitionStageCounts,
      failedEffectCount: failedEffects.length,
      failedAnimationCount: failedAnimations.length,
      failedOverlayCount: failedOverlays.length,
      failedPolishCount: failedPolish.length,
      targetTrackIndex,
      realizedClipCount,
      requestedSequenceId,
      resolvedSequenceId,
      sequenceName,
      usedActiveSequenceFallback,
      continuityIssueCount,
      continuityIssueSource,
    },
    videoQAReport,
  };
}

function pushFindingsSection(
  lines: string[],
  title: string,
  findings: EditReasonabilityFinding[],
): void {
  lines.push(`### ${title}`, "");
  if (findings.length === 0) {
    lines.push("- None", "");
    return;
  }

  for (const finding of findings) {
    lines.push(`- [${finding.code}] ${finding.message}`);
    for (const detail of finding.details ?? []) {
      lines.push(`  - ${detail}`);
    }
  }
  lines.push("");
}

export function generateEditReasonabilityMarkdown(
  review: EditReasonabilityReview,
): string {
  const lines: string[] = [
    "---",
    `source_docx: ${JSON.stringify(review.sourceDocxPath)}`,
    `guide_title: ${JSON.stringify(review.guideTitle)}`,
    `source_root: ${JSON.stringify(review.manifestSourceRoot)}`,
    `status: ${review.status}`,
    `blocker_count: ${review.summary.blockerCount}`,
    `warning_count: ${review.summary.warningCount}`,
    `note_count: ${review.summary.noteCount}`,
    "---",
    "",
    "# Edit Reasonability Review",
    "",
    "## Review Status",
    "",
    `- Status: ${review.status}`,
    `- Eligible visual assets: ${review.summary.eligibleAssetCount}`,
    `- Selected assets: ${review.summary.selectedAssetCount}`,
    `- Missing selected assets: ${review.summary.missingSelectedAssetCount}`,
    `- Unresolved visual steps: ${review.summary.unresolvedVisualStepCount}`,
    "",
    "## Transition Expectations",
    "",
    `- Preferred clip transition: ${review.transitionPlan.preferredClipTransition ?? "none"}`,
    `- Candidate transition: ${review.candidate?.transitionName?.trim() || "none"}`,
    `- Batch apply default transition: ${review.transitionPlan.applyAsDefaultTransitionToAll ? "yes" : "no"}`,
    `- Reorder suggested: ${review.transitionPlan.reorderSuggested ? "yes" : "no"}`,
    `- Avoid default Cross Dissolve: ${review.transitionPlan.avoidDefaultCrossDissolve ? "yes" : "no"}`,
    "",
    "## Findings",
    "",
  ];

  pushFindingsSection(
    lines,
    "Blockers",
    review.findings.filter((finding) => finding.severity === "blocker"),
  );
  pushFindingsSection(
    lines,
    "Warnings",
    review.findings.filter((finding) => finding.severity === "warning"),
  );
  pushFindingsSection(
    lines,
    "Notes",
    review.findings.filter((finding) => finding.severity === "note"),
  );

  lines.push("## Selected Assets", "");
  if (review.selectedAssets.length === 0) {
    lines.push("- None", "");
  } else {
    for (const asset of review.selectedAssets) {
      lines.push(`- ${asset.relativePath} (${asset.category})`);
    }
    lines.push("");
  }

  if (review.missingSelectedAssetPaths.length > 0) {
    lines.push("## Missing Selected Assets", "");
    for (const assetPath of review.missingSelectedAssetPaths) {
      lines.push(`- ${assetPath}`);
    }
    lines.push("");
  }

  lines.push("## Excluded Assets", "");
  if (review.excludedAssets.length === 0) {
    lines.push("- None", "");
  } else {
    for (const asset of review.excludedAssets) {
      lines.push(`- ${asset.relativePath} (${asset.category})`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function reviewEditReasonabilityFromFiles(
  options: ReviewEditReasonabilityFromFilesOptions,
): Promise<{
  review: EditReasonabilityReview;
  markdownReport: string;
}> {
  const guide = await parseVisualGuideFromDocx(options.docxPath);
  const manifest = JSON.parse(
    await readFile(options.mediaManifestPath, "utf8"),
  ) as MediaFolderManifest;

  const hasCandidate =
    (options.assetPaths?.length ?? 0) > 0 ||
    options.transitionName !== undefined ||
    options.transitionPolicy !== undefined ||
    options.clipDuration !== undefined ||
    options.motionStyle !== undefined ||
    options.mediaPolicy !== undefined;

  const review = reviewEditReasonability({
    sourceDocxPath: options.docxPath,
    guide,
    manifest,
    candidate: hasCandidate
      ? {
          assetPaths: options.assetPaths,
          transitionName: options.transitionName,
          transitionPolicy: options.transitionPolicy,
          clipDuration: options.clipDuration,
          motionStyle: options.motionStyle,
          mediaPolicy: options.mediaPolicy,
        }
      : undefined,
  });

  return {
    review,
    markdownReport: generateEditReasonabilityMarkdown(review),
  };
}
