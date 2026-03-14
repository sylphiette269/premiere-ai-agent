import assert from "node:assert/strict";
import test from "node:test";

import { PremiereProTools } from "../src/tools/index.js";

test("tool execution failures redact apiKey args", async () => {
  const tools = new PremiereProTools({} as never);

  (tools as any).generateSubtitlesTool = async () => {
    throw new Error("Whisper request failed");
  };

  const result = await tools.executeTool("generate_subtitles", {
    audioPath: "E:/media/voiceover.wav",
    apiKey: "sk-secret-value",
  });

  assert.equal(result.success, false);
  assert.match(result.error, /Tool execution failed/);
  assert.deepEqual(result.args, {
    audioPath: "E:/media/voiceover.wav",
    apiKey: "[REDACTED]",
  });
});

test("unregistered helper tools stay undiscoverable and uncallable", async () => {
  const tools = new PremiereProTools({} as never);
  const toolNames = tools.getAvailableTools().map((tool) => tool.name);

  assert.equal(toolNames.includes("remove_effect"), false);
  assert.equal(toolNames.includes("create_nested_sequence"), false);
  assert.equal(toolNames.includes("unnest_sequence"), false);

  for (const [name, args] of [
    ["remove_effect", { clipId: "clip-1", effectName: "Gaussian Blur" }],
    ["create_nested_sequence", { clipIds: ["clip-1"], name: "Nested" }],
    ["unnest_sequence", { nestedSequenceClipId: "clip-1" }],
  ] as const) {
    const result = await tools.executeTool(name, args);
    assert.equal(result.success, false);
    assert.match(result.error, /Tool '.*' not found/);
  }
});
