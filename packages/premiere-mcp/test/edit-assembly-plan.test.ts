import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import JSZip from "jszip";

import {
  generateEditAssemblyPlanMarkdown,
  planEditAssembly,
  planEditAssemblyFromFiles,
} from "../src/edit-assembly-plan.js";

test("planEditAssembly selects visual assets in deterministic order and derives safe defaults", () => {
  const guide = {
    title: "Promo Assembly",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 13,
        text: "Use Cube Spin transition between clips.",
        rawText: "Use Cube Spin transition between clips.",
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
    totalFiles: 4,
    countsByCategory: {
      video: 2,
      image: 1,
      audio: 0,
      document: 1,
      project: 0,
      other: 0,
    },
    assets: [
      {
        absolutePath: "E:/source/video/shot10.mp4",
        relativePath: "video/shot10.mp4",
        basename: "shot10.mp4",
        extension: ".mp4",
        category: "video" as const,
        sizeBytes: 1200,
      },
      {
        absolutePath: "E:/source/video/shot2.mp4",
        relativePath: "video/shot2.mp4",
        basename: "shot2.mp4",
        extension: ".mp4",
        category: "video" as const,
        sizeBytes: 1100,
      },
      {
        absolutePath: "E:/source/images/still03.jpg",
        relativePath: "images/still03.jpg",
        basename: "still03.jpg",
        extension: ".jpg",
        category: "image" as const,
        sizeBytes: 900,
      },
      {
        absolutePath: "E:/source/docs/notes.docx",
        relativePath: "docs/notes.docx",
        basename: "notes.docx",
        extension: ".docx",
        category: "document" as const,
        sizeBytes: 512,
      },
    ],
  };

  const plan = planEditAssembly({
    sourceDocxPath: "E:/downloads/promo.docx",
    guide,
    manifest,
    transitionName: "Cube Spin",
  });

  assert.equal(plan.sequenceName, "Promo Assembly Auto Plan");
  assert.deepEqual(plan.assetPaths, [
    "E:/source/video/shot2.mp4",
    "E:/source/video/shot10.mp4",
    "E:/source/images/still03.jpg",
  ]);
  assert.equal(plan.clipDuration, 4);
  assert.equal(plan.motionStyle, "none");
  assert.equal(plan.transitionName, "Cube Spin");
  assert.equal(plan.transitionPolicy, "guide-derived");
  assert.equal(plan.mediaPolicy, "reference-only");
  assert.equal(plan.selectedAssets.length, 3);
  assert.equal(plan.skippedAssets.length, 1);
  assert.equal(plan.review.status, "blocked");
  assert.equal(
    plan.review.findings.some((finding) => finding.code === "guide-derived-transition-manual-only"),
    true,
  );
});

test("generateEditAssemblyPlanMarkdown renders plan summary and selected assets", () => {
  const guide = {
    title: "Planner Markdown",
    intro: [],
    unassignedImages: [],
    steps: [],
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
        sizeBytes: 768,
      },
    ],
  };

  const plan = planEditAssembly({
    sourceDocxPath: "E:/downloads/planner.docx",
    guide,
    manifest,
  });

  const markdown = generateEditAssemblyPlanMarkdown(plan);

  assert.match(markdown, /^---[\s\S]*status: ready/m);
  assert.match(markdown, /# Edit Assembly Plan/);
  assert.match(markdown, /## Planned Settings/);
  assert.match(markdown, /Planner Markdown Auto Plan/);
  assert.match(markdown, /video\/shot01\.mp4/);
  assert.match(markdown, /images\/still01\.jpg/);
});

test("planEditAssemblyFromFiles reads the DOCX guide and manifest JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-assembly-plan-"));
  const docxPath = path.join(root, "guide.docx");
  const manifestPath = path.join(root, "manifest.json");
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>File Plan Guide</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Prepare the timeline.</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );

  await writeFile(docxPath, await zip.generateAsync({ type: "nodebuffer" }));
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        sourceRoot: "E:/source",
        generatedAt: "2026-03-08T12:00:00.000Z",
        mediaPolicy: "reference-only",
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
            category: "video",
            sizeBytes: 1024,
          },
          {
            absolutePath: "E:/source/images/still01.jpg",
            relativePath: "images/still01.jpg",
            basename: "still01.jpg",
            extension: ".jpg",
            category: "image",
            sizeBytes: 768,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await planEditAssemblyFromFiles({
    docxPath,
    mediaManifestPath: manifestPath,
  });

  assert.equal(result.plan.sequenceName, "File Plan Guide Auto Plan");
  assert.deepEqual(result.plan.assetPaths, [
    "E:/source/video/shot01.mp4",
    "E:/source/images/still01.jpg",
  ]);
  assert.match(result.markdownPlan, /## Planned Assets/);
});

test("planEditAssembly keeps guide-derived clip effects visible in the plan output", () => {
  const guide = {
    title: "Effectful Planner",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 5,
        text: "Add 'Gaussian Blur' to the clip.",
        rawText: "Add 'Gaussian Blur' to the clip.",
        paragraphIndex: 4,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["Gaussian Blur"],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
      {
        number: 6,
        text: "Copy 'Gaussian Blur' to all other clips with CTRL+ALT+V.",
        rawText: "Copy 'Gaussian Blur' to all other clips with CTRL+ALT+V.",
        paragraphIndex: 5,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["Gaussian Blur"],
        mentionedShortcuts: ["CTRL+ALT+V"],
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

  const plan = planEditAssembly({
    sourceDocxPath: "E:/downloads/effectful.docx",
    guide,
    manifest,
  });
  const markdown = generateEditAssemblyPlanMarkdown(plan);

  assert.deepEqual(plan.effectPlan.globalClipEffects, ["Gaussian Blur"]);
  assert.match(markdown, /## Planned Effects/);
  assert.match(markdown, /Gaussian Blur/);
});

test("planEditAssemblyFromFiles uses blueprint matching when referenceBlueprintPath is supplied", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-assembly-blueprint-"));
  const docxPath = path.join(root, "guide.docx");
  const manifestPath = path.join(root, "manifest.json");
  const blueprintPath = path.join(root, "reference-blueprint.json");
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Blueprint Guided Plan</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Follow the reference edit.</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );

  await writeFile(docxPath, await zip.generateAsync({ type: "nodebuffer" }));
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        sourceRoot: "E:/source",
        generatedAt: "2026-03-09T12:00:00.000Z",
        mediaPolicy: "reference-only",
        totalFiles: 3,
        countsByCategory: {
          video: 2,
          image: 1,
          audio: 0,
          document: 0,
          project: 0,
          other: 0,
        },
        assets: [
          {
            absolutePath: "E:/source/video/wide_intro_5s.mp4",
            relativePath: "video/wide_intro_5s.mp4",
            basename: "wide_intro_5s.mp4",
            extension: ".mp4",
            category: "video",
            sizeBytes: 1024,
          },
          {
            absolutePath: "E:/source/video/medium_action_3s.mp4",
            relativePath: "video/medium_action_3s.mp4",
            basename: "medium_action_3s.mp4",
            extension: ".mp4",
            category: "video",
            sizeBytes: 1024,
          },
          {
            absolutePath: "E:/source/images/close_detail_2s.jpg",
            relativePath: "images/close_detail_2s.jpg",
            basename: "close_detail_2s.jpg",
            extension: ".jpg",
            category: "image",
            sizeBytes: 1024,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    blueprintPath,
    JSON.stringify(
      {
        sourcePath: "E:/reference/demo.mp4",
        totalDuration: 10,
        estimatedFrameRate: 25,
        shots: [
          {
            index: 0,
            startSec: 0,
            endSec: 5,
            durationSec: 5,
            transitionIn: null,
            transitionOut: "cut",
            dominantColor: "neutral",
            motionAmount: "medium",
            hasText: false,
            shotType: "wide",
          },
          {
            index: 1,
            startSec: 5,
            endSec: 7,
            durationSec: 2,
            transitionIn: "cut",
            transitionOut: null,
            dominantColor: "neutral",
            motionAmount: "low",
            hasText: false,
            shotType: "close",
          },
        ],
        pacing: {
          avgShotDurationSec: 3.5,
          minShotDurationSec: 2,
          maxShotDurationSec: 5,
          cutRate: 2,
          rhythmPattern: "uniform",
        },
        dominantTransitions: ["cut"],
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

  const result = await planEditAssemblyFromFiles({
    docxPath,
    mediaManifestPath: manifestPath,
    referenceBlueprintPath: blueprintPath,
  });

  assert.deepEqual(
    result.plan.selectedAssets.map((entry) => entry.asset.relativePath),
    [
      "images/close_detail_2s.jpg",
      "video/wide_intro_5s.mp4",
    ],
  );
  assert.equal(result.plan.assetPaths[0], "E:/source/images/close_detail_2s.jpg");
});
