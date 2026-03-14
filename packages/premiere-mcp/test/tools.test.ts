import assert from "node:assert/strict";
import test from "node:test";

import { executePremiereTool, premiereToolDefinitions } from "../src/tools.js";

test("premiere_get_project_info maps to get_project_info", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const result = await executePremiereTool(
    "premiere_get_project_info",
    {},
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "1", ok: true, projectName: "demo.prproj" };
      },
    },
  );

  assert.deepEqual(calls, [{ action: "get_project_info", params: {} }]);
  assert.deepEqual(result, { id: "1", ok: true, projectName: "demo.prproj" });
});

test("premiere_open_project maps the project path", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  const path = "C:/pr-mcp-cmd/mcp-test.prproj";

  const result = await executePremiereTool(
    "premiere_open_project",
    { path },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "open-1", ok: true, projectPath: path };
      },
    },
  );

  assert.deepEqual(calls, [{ action: "open_project", params: { path } }]);
  assert.deepEqual(result, { id: "open-1", ok: true, projectPath: path });
});

test("premiere_import_media rejects an empty path list", async () => {
  await assert.rejects(
    () =>
      executePremiereTool("premiere_import_media", { paths: [] }, {
        sendCommand: async () => ({ id: "1", ok: true }),
      }),
    /at least 1/i,
  );
});

test("premiere_import_media defaults importMode to reference-only", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const result = await executePremiereTool(
    "premiere_import_media",
    { paths: ["C:/media/shot01.mp4"] },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "import-1", ok: true, mediaPolicy: "reference-only" };
      },
    },
  );

  assert.deepEqual(calls, [
    {
      action: "import_media",
      params: {
        paths: ["C:/media/shot01.mp4"],
        importMode: "reference-only",
      },
    },
  ]);
  assert.deepEqual(result, {
    id: "import-1",
    ok: true,
    mediaPolicy: "reference-only",
  });
});

test("premiere_create_sequence maps the sequence name", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const result = await executePremiereTool(
    "premiere_create_sequence",
    { name: "Auto Sequence" },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "2", ok: true, sequenceName: "Auto Sequence" };
      },
    },
  );

  assert.deepEqual(calls, [
    { action: "create_sequence", params: { name: "Auto Sequence" } },
  ]);
  assert.deepEqual(result, {
    id: "2",
    ok: true,
    sequenceName: "Auto Sequence",
  });
});

test("premiere_create_sequence forwards an optional preset path", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  const presetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";

  const result = await executePremiereTool(
    "premiere_create_sequence",
    { name: "Preset Sequence", presetPath },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "2b", ok: true, sequenceName: "Preset Sequence", presetPath };
      },
    },
  );

  assert.deepEqual(calls, [
    { action: "create_sequence", params: { name: "Preset Sequence", presetPath } },
  ]);
  assert.deepEqual(result, {
    id: "2b",
    ok: true,
    sequenceName: "Preset Sequence",
    presetPath,
  });
});

test("premiere_create_sequence forwards an optional media path", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];
  const mediaPath = "C:/pr-mcp-cmd/sample1.jpg";

  const result = await executePremiereTool(
    "premiere_create_sequence",
    { name: "Clip Driven Sequence", mediaPath },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "2c", ok: true, sequenceName: "Clip Driven Sequence", mode: "createNewSequenceFromClips" };
      },
    },
  );

  assert.deepEqual(calls, [
    { action: "create_sequence", params: { name: "Clip Driven Sequence", mediaPath } },
  ]);
  assert.deepEqual(result, {
    id: "2c",
    ok: true,
    sequenceName: "Clip Driven Sequence",
    mode: "createNewSequenceFromClips",
  });
});

test("premiere_add_clip_to_timeline maps media placement parameters", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const result = await executePremiereTool(
    "premiere_add_clip_to_timeline",
    {
      mediaPath: "E:/作业1/sample1.jpg",
      trackIndex: 1,
      startTime: 12.5,
    },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "3", ok: true, message: "added" };
      },
    },
  );

  assert.deepEqual(calls, [
    {
      action: "add_clip_to_timeline",
      params: {
        mediaPath: "E:/作业1/sample1.jpg",
        trackIndex: 1,
        startTime: 12.5,
      },
    },
  ]);
  assert.deepEqual(result, { id: "3", ok: true, message: "added" });
});

test("premiere_export_sequence requires an output path", async () => {
  await assert.rejects(
    () =>
      executePremiereTool("premiere_export_sequence", {}, {
        sendCommand: async () => ({ id: "4", ok: true }),
      }),
    /outputPath/i,
  );
});

test("premiere_export_sequence maps the output path", async () => {
  const calls: Array<{ action: string; params: Record<string, unknown> }> = [];

  const result = await executePremiereTool(
    "premiere_export_sequence",
    { outputPath: "E:/作业1/output.mp4" },
    {
      sendCommand: async (action, params) => {
        calls.push({ action, params });
        return { id: "5", ok: true, outputPath: "E:/作业1/output.mp4" };
      },
    },
  );

  assert.deepEqual(calls, [
    {
      action: "export_sequence",
      params: { outputPath: "E:/作业1/output.mp4" },
    },
  ]);
  assert.deepEqual(result, {
    id: "5",
    ok: true,
    outputPath: "E:/作业1/output.mp4",
  });
});

test("premiere tool definitions expose the expected names", () => {
  const names = premiereToolDefinitions.map((tool) => tool.name).sort();

  assert.deepEqual(names, [
    "premiere_add_clip_to_timeline",
    "premiere_create_sequence",
    "premiere_export_sequence",
    "premiere_get_project_info",
    "premiere_import_media",
    "premiere_open_project",
  ]);
});
