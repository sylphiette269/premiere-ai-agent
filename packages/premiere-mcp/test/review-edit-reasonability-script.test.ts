import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import JSZip from "jszip";

const execFileAsync = promisify(execFile);

test("review-edit-reasonability script writes a markdown report", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-review-script-"));
  const docxPath = path.join(root, "guide.docx");
  const manifestPath = path.join(root, "manifest.json");
  const outputPath = path.join(root, "review.md");
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Review Guide</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Add the requested clip transition.</w:t></w:r></w:p>
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
            sizeBytes: 512,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/review-edit-reasonability.mjs",
      "--docx",
      docxPath,
      "--media-json",
      manifestPath,
      "--output",
      outputPath,
      "--asset",
      "E:/source/video/shot01.mp4",
      "--asset",
      "E:/source/images/still01.jpg",
      "--transition-name",
      "Cube Spin",
      "--transition-policy",
      "explicit",
      "--clip-duration",
      "4",
      "--motion-style",
      "alternate",
    ],
    {
      cwd: path.join("e:", "作业1", "premiere-mcp"),
    },
  );

  const markdown = await readFile(outputPath, "utf8");

  assert.match(markdown, /status: ready/);
  assert.match(markdown, /Cube Spin/);
  assert.match(markdown, /video\/shot01\.mp4/);
});
