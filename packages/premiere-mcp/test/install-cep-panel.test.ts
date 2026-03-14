import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildBridgeConfigSource,
  detectConflictingBundleDirs,
  getRecommendedMcpEnv,
  installCepPanel,
} from "../scripts/install-cep-panel.mjs";

test("buildBridgeConfigSource writes the configured bridge directory", () => {
  const source = buildBridgeConfigSource("D:/custom-bridge");

  assert.match(source, /__PR_MCP_BRIDGE_DIR__/);
  assert.match(source, /D:\/custom-bridge/);
});

test("getRecommendedMcpEnv derives command and result files from the bridge directory", () => {
  assert.deepEqual(getRecommendedMcpEnv("D:/custom-bridge"), {
    PREMIERE_MCP_COMMAND_FILE: "D:/custom-bridge/cmd.json",
    PREMIERE_MCP_RESULT_FILE: "D:/custom-bridge/result.json",
  });
});

test("installCepPanel copies the CEP panel and rewrites bridge-config.js", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-install-"));
  const projectDir = path.join(tempDir, "project");
  const sourceDir = path.join(projectDir, "cep-panel");
  const targetDir = path.join(tempDir, "extensions");

  try {
    await mkdir(path.join(sourceDir, "js"), { recursive: true });
    await mkdir(path.join(sourceDir, "CSXS"), { recursive: true });
    await writeFile(path.join(sourceDir, "index.html"), "<html></html>", "utf8");
    await writeFile(
      path.join(sourceDir, "js", "bridge-config.js"),
      buildBridgeConfigSource("C:/pr-mcp-cmd"),
      "utf8",
    );
    await writeFile(
      path.join(sourceDir, "js", "panel.js"),
      "console.log('panel');",
      "utf8",
    );
    await writeFile(
      path.join(sourceDir, "CSXS", "manifest.xml"),
      "<manifest />",
      "utf8",
    );

    const result = await installCepPanel({
      projectDir,
      extensionsDir: targetDir,
      bridgeDir: "D:/custom-bridge",
    });

    assert.equal(result.targetDir, path.join(targetDir, "com.pr.mcp.panel"));
    assert.deepEqual(result.mcpEnv, {
      PREMIERE_MCP_COMMAND_FILE: "D:/custom-bridge/cmd.json",
      PREMIERE_MCP_RESULT_FILE: "D:/custom-bridge/result.json",
    });

    assert.equal(
      await readFile(path.join(result.targetDir, "index.html"), "utf8"),
      "<html></html>",
    );

    const bridgeConfig = await readFile(
      path.join(result.targetDir, "js", "bridge-config.js"),
      "utf8",
    );

    assert.match(bridgeConfig, /D:\/custom-bridge/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("installCepPanel reports conflicting bundle directories", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-install-conflict-"));
  const projectDir = path.join(tempDir, "project");
  const sourceDir = path.join(projectDir, "cep-panel");
  const targetDir = path.join(tempDir, "extensions");
  const conflictingDir = path.join(targetDir, "legacy.disabled");

  try {
    await mkdir(path.join(sourceDir, "js"), { recursive: true });
    await mkdir(path.join(sourceDir, "CSXS"), { recursive: true });
    await writeFile(path.join(sourceDir, "index.html"), "<html></html>", "utf8");
    await writeFile(path.join(sourceDir, "js", "panel.js"), "console.log('panel');", "utf8");
    await writeFile(path.join(sourceDir, "CSXS", "manifest.xml"), "<manifest />", "utf8");

    await mkdir(path.join(conflictingDir, "CSXS"), { recursive: true });
    await writeFile(
      path.join(conflictingDir, "CSXS", "manifest.xml"),
      '<ExtensionManifest ExtensionBundleId="com.pr.mcp.panel"></ExtensionManifest>',
      "utf8",
    );

    const installed = await installCepPanel({
      projectDir,
      extensionsDir: targetDir,
      bridgeDir: "D:/custom-bridge",
    });

    assert.deepEqual(installed.conflicts, [conflictingDir]);

    const directDetection = await detectConflictingBundleDirs({
      extensionsDir: targetDir,
      bundleId: "com.pr.mcp.panel",
      targetDir: installed.targetDir,
    });
    assert.deepEqual(directDetection, [conflictingDir]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
