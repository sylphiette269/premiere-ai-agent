import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generateEditReasonabilityMarkdown,
  reviewAssemblyExecution,
  reviewEditReasonability,
} from "../src/edit-reasonability-review.js";

test("reviewEditReasonability blocks invalid timeline media and forbidden default transitions", () => {
  const guide = {
    title: "Review Guide",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 13,
        text: "Add the requested clip transition.",
        rawText: "Add the requested clip transition.",
        paragraphIndex: 12,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
    ],
  };

  const manifest = {
    sourceRoot: "E:/source",
    generatedAt: "2026-03-08T12:00:00.000Z",
    mediaPolicy: "reference-only" as const,
    totalFiles: 3,
    countsByCategory: {
      video: 1,
      image: 0,
      audio: 0,
      document: 1,
      project: 1,
      other: 0,
    },
    assets: [
      {
        absolutePath: "E:/source/video/shot01.mp4",
        relativePath: "video/shot01.mp4",
        basename: "shot01.mp4",
        extension: ".mp4",
        category: "video" as const,
        sizeBytes: 1024,
      },
      {
        absolutePath: "E:/source/docs/guide.docx",
        relativePath: "docs/guide.docx",
        basename: "guide.docx",
        extension: ".docx",
        category: "document" as const,
        sizeBytes: 2048,
      },
      {
        absolutePath: "E:/source/project/edit.prproj",
        relativePath: "project/edit.prproj",
        basename: "edit.prproj",
        extension: ".prproj",
        category: "project" as const,
        sizeBytes: 4096,
      },
    ],
  };

  const review = reviewEditReasonability({
    sourceDocxPath: "E:/downloads/demo.docx",
    guide,
    transitionPlan: {
      preferredClipTransition: "Cube Spin",
      clipTransitionEvidenceSteps: [13, 14],
      keyframeEasingSteps: [],
      applyAsDefaultTransitionToAll: true,
      reorderSuggested: false,
      avoidDefaultCrossDissolve: true,
    },
    manifest,
    candidate: {
      assetPaths: [
        "E:/source/video/shot01.mp4",
        "E:/source/docs/guide.docx",
      ],
      transitionName: "Cross Dissolve",
      transitionPolicy: "explicit",
      clipDuration: 4,
      motionStyle: "alternate",
      mediaPolicy: "reference-only",
    },
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.summary.blockerCount, 3);
  assert.deepEqual(
    review.findings
      .filter((finding) => finding.severity === "blocker")
      .map((finding) => finding.code)
      .sort(),
    [
      "avoid-default-cross-dissolve",
      "invalid-selected-asset-category",
      "too-few-assets-for-transition",
    ],
  );
});

test("reviewEditReasonability keeps unresolved visual gaps visible as warnings", () => {
  const guide = {
    title: "Visual Review",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 1,
        text: "Create the sequence with settings shown in the screenshot.",
        rawText: "Create the sequence with settings shown in the screenshot.",
        paragraphIndex: 0,
        continuations: [],
        images: [],
        visualDependencies: ["settings-shown-in-screenshot"],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
    ],
  };

  const manifest = {
    sourceRoot: "E:/source",
    generatedAt: "2026-03-08T12:00:00.000Z",
    mediaPolicy: "reference-only" as const,
    totalFiles: 1,
    countsByCategory: {
      video: 1,
      image: 0,
      audio: 0,
      document: 0,
      project: 0,
      other: 0,
    },
    assets: [
      {
        absolutePath: "E:/source/video/shot01.mp4",
        relativePath: "video/shot01.mp4",
        basename: "shot01.mp4",
        extension: ".mp4",
        category: "video" as const,
        sizeBytes: 1024,
      },
    ],
  };

  const review = reviewEditReasonability({
    sourceDocxPath: "E:/downloads/demo.docx",
    guide,
    manifest,
  });

  assert.equal(review.status, "needs-review");
  assert.equal(review.summary.blockerCount, 0);
  assert.equal(review.summary.warningCount, 1);
  assert.equal(review.findings[0]?.code, "unresolved-visual-steps");
});

test("generateEditReasonabilityMarkdown renders status, findings, and asset selections", () => {
  const guide = {
    title: "Report Guide",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 13,
        text: "Use the requested clip transition.",
        rawText: "Use the requested clip transition.",
        paragraphIndex: 12,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
    ],
  };

  const manifest = {
    sourceRoot: "E:/source",
    generatedAt: "2026-03-08T12:00:00.000Z",
    mediaPolicy: "reference-only" as const,
    totalFiles: 2,
    countsByCategory: {
      video: 1,
      image: 1,
      audio: 0,
      document: 0,
      project: 0,
      other: 0,
    },
    assets: [
      {
        absolutePath: "E:/source/video/shot01.mp4",
        relativePath: "video/shot01.mp4",
        basename: "shot01.mp4",
        extension: ".mp4",
        category: "video" as const,
        sizeBytes: 1024,
      },
      {
        absolutePath: "E:/source/images/still01.jpg",
        relativePath: "images/still01.jpg",
        basename: "still01.jpg",
        extension: ".jpg",
        category: "image" as const,
        sizeBytes: 512,
      },
    ],
  };

  const review = reviewEditReasonability({
    sourceDocxPath: "E:/downloads/demo.docx",
    guide,
    transitionPlan: {
      preferredClipTransition: "Cube Spin",
      clipTransitionEvidenceSteps: [13],
      keyframeEasingSteps: [],
      applyAsDefaultTransitionToAll: false,
      reorderSuggested: false,
      avoidDefaultCrossDissolve: true,
    },
    manifest,
    candidate: {
      assetPaths: [
        "E:/source/video/shot01.mp4",
        "E:/source/images/still01.jpg",
      ],
      transitionName: "Cube Spin",
      transitionPolicy: "explicit",
      clipDuration: 4,
      motionStyle: "alternate",
      mediaPolicy: "reference-only",
    },
  });

  const markdown = generateEditReasonabilityMarkdown(review);

  assert.match(markdown, /^---[\s\S]*status: ready/m);
  assert.match(markdown, /## Review Status/);
  assert.match(markdown, /- Status: ready/);
  assert.match(markdown, /## Transition Expectations/);
  assert.match(markdown, /Cube Spin/);
  assert.match(markdown, /## Selected Assets/);
  assert.match(markdown, /video\/shot01\.mp4/);
  assert.match(markdown, /images\/still01\.jpg/);
});

test("reviewAssemblyExecution blocks when an explicit transition operation fails", () => {
  const review = reviewAssemblyExecution({
    requestedTransitionName: "Cube Spin",
    expectedTransitionCount: 1,
    transitions: [
      {
        success: false,
        error: "Transition could not be applied.",
      },
    ],
    motionStyle: "none",
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.summary.failedTransitionCount, 1);
  assert.deepEqual(review.summary.failedTransitionStageCounts, { unknown: 1 });
  assert.equal(review.summary.successfulTransitionCount, 0);
  assert.equal(review.findings[0]?.code, "transition-operations-failed");
});

test("reviewAssemblyExecution preserves structured transition failure context in findings", () => {
  const review = reviewAssemblyExecution({
    requestedTransitionName: "Cross Dissolve",
    expectedTransitionCount: 1,
    transitions: [
      {
        success: false,
        stage: "invalid_clip_pair",
        error: "Clips leave a visible gap and cannot share a transition",
        sequenceName: "Promo Sequence",
        trackType: "video",
        trackIndex: 0,
        clipIndex1: 2,
        clipIndex2: 3,
        durationFrames: 15,
        gapAfterSec: 0.2,
      },
    ],
  });

  assert.equal(review.status, "blocked");
  assert.deepEqual(review.summary.failedTransitionStageCounts, {
    invalid_clip_pair: 1,
  });
  assert.match(
    review.findings[0]?.details?.[0] ?? "",
    /\[invalid_clip_pair\].*Promo Sequence.*video1.*boundary=3->4.*frames=15.*gap=0\.20s/,
  );
});

test("reviewAssemblyExecution blocks when the realized main video track is missing planned clips", () => {
  const review = reviewAssemblyExecution({
    expectedClipCount: 2,
    expectedAssetPaths: [
      "E:/source/video/shot01.mp4",
      "E:/source/video/shot02.mp4",
    ],
    assembledTrackIndex: 0,
    tracks: {
      success: true,
      videoTracks: [
        {
          index: 0,
          name: "Video 1",
          clipCount: 1,
          clips: [
            {
              id: "clip-1",
              name: "shot01.mp4",
              startTime: 0,
              endTime: 4,
              duration: 4,
            },
          ],
        },
      ],
      audioTracks: [],
    },
  });

  assert.equal(review.status, "blocked");
  assert.equal(review.findings[0]?.code, "timeline-missing-clips");
  assert.equal(review.summary.realizedClipCount, 1);
});

test("reviewAssemblyExecution warns when timeline order or continuity drifts from the plan", () => {
  const review = reviewAssemblyExecution({
    expectedClipCount: 2,
    expectedAssetPaths: [
      "E:/source/video/shot01.mp4",
      "E:/source/video/shot02.mp4",
    ],
    assembledTrackIndex: 0,
    tracks: {
      success: true,
      videoTracks: [
        {
          index: 0,
          name: "Video 1",
          clipCount: 2,
          clips: [
            {
              id: "clip-2",
              name: "shot02.mp4",
              startTime: 0,
              endTime: 4,
              duration: 4,
            },
            {
              id: "clip-1",
              name: "shot01.mp4",
              startTime: 4.5,
              endTime: 8.5,
              duration: 4,
            },
          ],
        },
      ],
      audioTracks: [],
    },
  });

  assert.equal(review.status, "needs-review");
  assert.deepEqual(
    review.findings.map((finding) => finding.code).sort(),
    ["timeline-continuity-mismatch", "timeline-order-mismatch"],
  );
});

test("reviewAssemblyExecution surfaces sequence fallback context and uses continuity metadata when available", () => {
  const review = reviewAssemblyExecution({
    expectedClipCount: 2,
    assembledTrackIndex: 0,
    tracks: {
      success: true,
      sequenceId: "requested-sequence",
      resolvedSequenceId: "active-sequence",
      sequenceName: "Recovered Active Sequence",
      usedActiveSequenceFallback: true,
      videoTracks: [
        {
          index: 0,
          name: "Video 1",
          clipCount: 2,
          clips: [
            {
              id: "clip-1",
              name: "shot01.mp4",
              trackIndex: 0,
              clipIndex: 0,
              gapAfterSec: 0.25,
            },
            {
              id: "clip-2",
              name: "shot02.mp4",
              trackIndex: 0,
              clipIndex: 1,
            },
          ],
        },
      ],
      audioTracks: [],
    },
  });

  assert.equal(review.status, "needs-review");
  assert.equal(review.summary.requestedSequenceId, "requested-sequence");
  assert.equal(review.summary.resolvedSequenceId, "active-sequence");
  assert.equal(review.summary.sequenceName, "Recovered Active Sequence");
  assert.equal(review.summary.usedActiveSequenceFallback, true);
  assert.equal(review.summary.continuityIssueCount, 1);
  assert.equal(review.summary.continuityIssueSource, "metadata");
  assert.deepEqual(
    review.findings.map((finding) => finding.code).sort(),
    ["timeline-continuity-mismatch", "timeline-sequence-fallback-used"],
  );
  assert.match(
    review.findings.find((finding) => finding.code === "timeline-continuity-mismatch")
      ?.details?.[0] ?? "",
    /V1 clip 1 \(shot01\.mp4\)/,
  );
});

test("reviewAssemblyExecution attaches a video QA report when referenceBlueprintPath is provided", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-reference-qa-"));
  const blueprintPath = path.join(root, "reference-blueprint.json");
  await writeFile(
    blueprintPath,
    JSON.stringify(
      {
        sourcePath: "E:/reference/demo.mp4",
        totalDuration: 12,
        estimatedFrameRate: 25,
        shots: [
          {
            index: 0,
            startSec: 0,
            endSec: 4,
            durationSec: 4,
            transitionIn: null,
            transitionOut: "Cube Spin",
            dominantColor: "neutral",
            motionAmount: "medium",
            hasText: false,
            shotType: "wide",
          },
          {
            index: 1,
            startSec: 4,
            endSec: 8,
            durationSec: 4,
            transitionIn: "Cube Spin",
            transitionOut: "Cube Spin",
            dominantColor: "neutral",
            motionAmount: "medium",
            hasText: false,
            shotType: "medium",
          },
          {
            index: 2,
            startSec: 8,
            endSec: 12,
            durationSec: 4,
            transitionIn: "Cube Spin",
            transitionOut: null,
            dominantColor: "neutral",
            motionAmount: "medium",
            hasText: false,
            shotType: "close",
          },
        ],
        pacing: {
          avgShotDurationSec: 4,
          minShotDurationSec: 4,
          maxShotDurationSec: 4,
          cutRate: 3,
          rhythmPattern: "uniform",
        },
        dominantTransitions: ["Cube Spin"],
        colorProfile: {
          warmth: "neutral",
          saturation: "medium",
          brightness: "medium",
        },
        motionStyle: "mixed",
        audioProfile: {
          hasMusic: false,
          hasVoiceover: false,
          hasNaturalSound: true,
        },
        textOverlays: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const review = reviewAssemblyExecution({
    referenceBlueprintPath: blueprintPath,
    requestedTransitionName: "Cross Dissolve",
    expectedClipCount: 3,
    tracks: {
      success: true,
      videoTracks: [
        {
          index: 0,
          clipCount: 3,
          clips: [
            { id: "clip-1", name: "shot-1", startTime: 0, endTime: 4, duration: 4 },
            { id: "clip-2", name: "shot-2", startTime: 4, endTime: 8, duration: 4 },
            { id: "clip-3", name: "shot-3", startTime: 8, endTime: 12, duration: 4 },
          ],
        },
      ],
      audioTracks: [],
    },
  });

  assert.equal(review.status, "needs-review");
  assert.equal(review.videoQAReport?.status, "needs-review");
  assert.equal(review.findings[0]?.code, "reference-video-qa-needs-review");
});
