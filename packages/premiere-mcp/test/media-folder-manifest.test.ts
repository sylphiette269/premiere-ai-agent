import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  generateMediaFolderMarkdown,
  scanMediaFolder,
  writeMediaFolderPlan,
} from "../src/media-folder-manifest.js";

test("scanMediaFolder keeps original absolute paths and classifies media types", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "premiere-media-scan-"));
  const sourceDir = path.join(root, "source");

  await mkdir(path.join(sourceDir, "video"), { recursive: true });
  await mkdir(path.join(sourceDir, "images"), { recursive: true });
  await mkdir(path.join(sourceDir, "audio"), { recursive: true });
  await mkdir(path.join(sourceDir, "docs"), { recursive: true });
  await mkdir(path.join(sourceDir, "project"), { recursive: true });

  const videoPath = path.join(sourceDir, "video", "shot01.mp4");
  const imagePath = path.join(sourceDir, "images", "still01.jpg");
  const audioPath = path.join(sourceDir, "audio", "voice01.wav");
  const docPath = path.join(sourceDir, "docs", "guide.md");
  const projectPath = path.join(sourceDir, "project", "edit.prproj");

  await writeFile(videoPath, "video");
  await writeFile(imagePath, "image");
  await writeFile(audioPath, "audio");
  await writeFile(docPath, "# guide");
  await writeFile(projectPath, "project");

  const manifest = await scanMediaFolder(sourceDir);

  assert.equal(manifest.mediaPolicy, "reference-only");
  assert.equal(manifest.sourceRoot, sourceDir);
  assert.equal(manifest.totalFiles, 5);
  assert.deepEqual(
    manifest.assets.map((asset) => ({
      relativePath: asset.relativePath,
      category: asset.category,
      absolutePath: asset.absolutePath,
    })),
    [
      { relativePath: "audio/voice01.wav", category: "audio", absolutePath: audioPath },
      { relativePath: "docs/guide.md", category: "document", absolutePath: docPath },
      { relativePath: "images/still01.jpg", category: "image", absolutePath: imagePath },
      { relativePath: "project/edit.prproj", category: "project", absolutePath: projectPath },
      { relativePath: "video/shot01.mp4", category: "video", absolutePath: videoPath },
    ],
  );

  await rm(root, { recursive: true, force: true });
});

test("generateMediaFolderMarkdown states the reference-only policy and no-copy rule", async () => {
  const markdown = generateMediaFolderMarkdown({
    sourceRoot: "E:/素材",
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
        absolutePath: "E:/素材/video/shot01.mp4",
        relativePath: "video/shot01.mp4",
        basename: "shot01.mp4",
        extension: ".mp4",
        category: "video",
        sizeBytes: 1024,
      },
      {
        absolutePath: "E:/素材/images/still01.jpg",
        relativePath: "images/still01.jpg",
        basename: "still01.jpg",
        extension: ".jpg",
        category: "image",
        sizeBytes: 512,
      },
    ],
  });

  assert.match(markdown, /media-policy:\s+reference-only/i);
  assert.match(markdown, /Do not copy, duplicate, stage, or relocate source media/i);
  assert.match(markdown, /E:\/素材\/video\/shot01\.mp4/i);
  assert.match(markdown, /E:\/素材\/images\/still01\.jpg/i);
});

test("writeMediaFolderPlan writes markdown and json outputs from a source folder", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "premiere-media-plan-"));
  const sourceDir = path.join(root, "source");
  const outputDir = path.join(root, "output");
  const clipPath = path.join(sourceDir, "clip.mp4");
  const markdownPath = path.join(outputDir, "folder-plan.md");
  const jsonPath = path.join(outputDir, "folder-plan.json");

  await mkdir(sourceDir, { recursive: true });
  await writeFile(clipPath, "clip");

  const result = await writeMediaFolderPlan({
    inputDir: sourceDir,
    markdownPath,
    jsonPath,
  });

  const markdown = await readFile(markdownPath, "utf8");
  const manifestText = await readFile(jsonPath, "utf8");
  const clipStats = await stat(clipPath);
  const parsed = JSON.parse(manifestText);

  assert.equal(result.manifest.mediaPolicy, "reference-only");
  assert.equal(result.markdownPath, markdownPath);
  assert.equal(result.jsonPath, jsonPath);
  assert.match(markdown, /reference-only/i);
  assert.equal(parsed.assets[0].absolutePath, clipPath);
  assert.equal(parsed.assets[0].sizeBytes, clipStats.size);

  await rm(root, { recursive: true, force: true });
});
