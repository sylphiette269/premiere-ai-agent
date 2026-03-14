import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateSubtitles } from "../src/subtitle-generator.js";

test("generateSubtitles uploads the normalized audio basename to Whisper", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-subtitles-"));
  const nestedDir = path.join(root, "中文目录");
  const audioPath = path.join(nestedDir, "旁白.wav");
  const outputSrtPath = path.join(root, "captions.srt");
  const originalFetch = globalThis.fetch;
  let uploadedFileName = "";

  await mkdir(nestedDir, { recursive: true });
  await writeFile(audioPath, Buffer.from("fake audio"));

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body as FormData;
    const fileField = body.get("file");
    uploadedFileName = fileField && typeof fileField === "object" && "name" in fileField
      ? String((fileField as { name?: string }).name || "")
      : "";

    return new Response(
      JSON.stringify({
        language: "zh",
        duration: 1.2,
        segments: [{ id: 1, start: 0, end: 1.2, text: " 你好，世界 " }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const result = await generateSubtitles({
      audioPath,
      apiKey: "test-key",
      outputSrtPath,
      backend: "openai",
    });

    assert.equal(uploadedFileName, "旁白.wav");
    assert.equal(result.backend, "openai");
    assert.equal(result.language, "zh");
    assert.match(await readFile(outputSrtPath, "utf8"), /你好，世界/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
