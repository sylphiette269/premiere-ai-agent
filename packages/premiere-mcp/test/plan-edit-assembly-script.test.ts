import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";

import JSZip from "jszip";

function runNodeScript(args: string[], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

test("plan-edit-assembly CLI writes a markdown plan from DOCX and manifest inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-plan-script-"));
  const docxPath = path.join(root, "guide.docx");
  const manifestPath = path.join(root, "manifest.json");
  const outputPath = path.join(root, "plan.md");
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>CLI Plan Guide</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Arrange the selected visual assets.</w:t></w:r></w:p>
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

  const result = await runNodeScript(
    [
      "--import",
      "tsx",
      "scripts/plan-edit-assembly.mjs",
      "--docx",
      docxPath,
      "--media-json",
      manifestPath,
      "--output",
      outputPath,
    ],
    path.resolve("e:/作业1/premiere-mcp"),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const markdown = await readFile(outputPath, "utf8");
  const summary = JSON.parse(result.stdout);

  assert.equal(summary.status, "ready");
  assert.equal(summary.selectedAssetCount, 2);
  assert.match(markdown, /# Edit Assembly Plan/);
  assert.match(markdown, /CLI Plan Guide Auto Plan/);
});
