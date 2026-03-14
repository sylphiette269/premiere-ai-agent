import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "monitor-bridge.mjs");

async function runMonitorScript(args: string[]) {
  const result = await execFileAsync(
    process.execPath,
    [scriptPath, ...args],
    { cwd: repoRoot },
  );
  return JSON.parse(result.stdout);
}

test("monitor-bridge script reports ok for a healthy bridge directory", async () => {
  const bridgeDir = await mkdtemp(path.join(os.tmpdir(), "premiere-bridge-monitor-"));

  await writeFile(
    path.join(bridgeDir, "bridge-status.json"),
    JSON.stringify({
      panelVersion: "20260311",
      bridgeFsAvailable: true,
      bridgeMode: "per-request",
      extensionId: "com.pr.mcp.panel.hidden",
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "bridge-control.json"),
    JSON.stringify({
      enabled: true,
      source: "panel",
      updatedAt: "2026-03-13T02:00:00.000Z",
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "session-context.json"),
    JSON.stringify({
      projectPath: "E:/projects/demo.prproj",
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "response-demo.json"),
    JSON.stringify({
      success: true,
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "panel.log"),
    [
      "2026-03-13T02:00:01.000Z dispatch raw_script",
      "2026-03-13T02:00:01.300Z write_result {\"success\":true}",
    ].join("\n"),
    "utf8",
  );

  const summary = await runMonitorScript([
    "--bridge-dir",
    bridgeDir,
    "--json",
    "--tail",
    "10",
  ]);

  assert.equal(summary.status, "ok");
  assert.equal(summary.bridge.mode, "per-request");
  assert.equal(summary.bridge.fsAvailable, true);
  assert.equal(summary.control.enabled, true);
  assert.equal(summary.project.path, "E:/projects/demo.prproj");
  assert.equal(summary.alerts.length, 0);
});

test("monitor-bridge script reports warnings for stale commands and panel errors", async () => {
  const bridgeDir = await mkdtemp(path.join(os.tmpdir(), "premiere-bridge-monitor-"));
  const commandPath = path.join(bridgeDir, "command-demo.json");

  await writeFile(
    path.join(bridgeDir, "bridge-status.json"),
    JSON.stringify({
      panelVersion: "20260311",
      bridgeFsAvailable: true,
      bridgeMode: "per-request",
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "bridge-control.json"),
    JSON.stringify({
      enabled: true,
      source: "panel",
    }),
    "utf8",
  );
  await writeFile(commandPath, JSON.stringify({ id: "demo" }), "utf8");
  const staleTime = new Date(Date.now() - 5 * 60 * 1000);
  await utimes(commandPath, staleTime, staleTime);
  await writeFile(
    path.join(bridgeDir, "panel.log"),
    [
      "2026-03-13T02:05:01.000Z dispatch raw_script",
      "2026-03-13T02:05:08.000Z error: command_expired",
      "2026-03-13T02:05:08.100Z raw_script {\"success\":false,\"error\":\"boom\"}",
    ].join("\n"),
    "utf8",
  );

  const summary = await runMonitorScript([
    "--bridge-dir",
    bridgeDir,
    "--json",
    "--tail",
    "10",
    "--warn-stale-seconds",
    "60",
  ]);

  assert.equal(summary.status, "warn");
  assert.match(
    JSON.stringify(summary.alerts),
    /pending_command_stale/,
  );
  assert.match(
    JSON.stringify(summary.alerts),
    /panel_log_error/,
  );
});

test("monitor-bridge script ignores embedded success:false text inside cmd_raw payloads", async () => {
  const bridgeDir = await mkdtemp(path.join(os.tmpdir(), "premiere-bridge-monitor-"));

  await writeFile(
    path.join(bridgeDir, "bridge-status.json"),
    JSON.stringify({
      panelVersion: "20260311",
      bridgeFsAvailable: true,
      bridgeMode: "per-request",
    }),
    "utf8",
  );
  await writeFile(
    path.join(bridgeDir, "panel.log"),
    [
      "2026-03-13T02:10:01.000Z cmd_raw {\"script\":\"return JSON.stringify({ success: false, error: 'not real' });\"}",
      "2026-03-13T02:10:01.050Z dispatch raw_script",
      "2026-03-13T02:10:01.150Z write_result {\"success\":true}",
    ].join("\n"),
    "utf8",
  );

  const summary = await runMonitorScript([
    "--bridge-dir",
    bridgeDir,
    "--json",
    "--tail",
    "10",
  ]);

  assert.equal(summary.status, "ok");
  assert.equal(summary.alerts.length, 0);
});
