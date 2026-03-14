import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BridgeClient } from "../src/bridge-client.js";

async function waitForFile(filePath: string, timeoutMs = 1000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw new Error(`Timed out waiting for file: ${filePath}`);
}

async function waitForMatchingFile(
  dirPath: string,
  pattern: RegExp,
  timeoutMs = 1000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    let entries: string[] = [];

    try {
      entries = await readdir(dirPath);
    } catch {
      entries = [];
    }

    const matched = entries.find((entry) => pattern.test(entry));

    if (matched) {
      return path.join(dirPath, matched);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for a file matching ${pattern}`);
}

async function waitForMissingFile(filePath: string, timeoutMs = 1000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await readFile(filePath, "utf8");
    } catch {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for file removal: ${filePath}`);
}

async function waitForBridgeWrite(
  dirPath: string,
  legacyCommandPath: string,
  timeoutMs = 1000,
): Promise<
  | { mode: "per-request"; filePath: string }
  | { mode: "legacy"; filePath: string }
> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    let entries: string[] = [];

    try {
      entries = await readdir(dirPath);
    } catch {
      entries = [];
    }

    const perRequestFile = entries.find((entry) => /^command-.*\.json$/.test(entry));

    if (perRequestFile) {
      return {
        mode: "per-request",
        filePath: path.join(dirPath, perRequestFile),
      };
    }

    try {
      await readFile(legacyCommandPath, "utf8");
      return {
        mode: "legacy",
        filePath: legacyCommandPath,
      };
    } catch {
      // Keep polling until one of the bridge outputs appears.
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for the bridge to write a command");
}

async function writeBridgeStatus(
  dirPath: string,
  status: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirPath, { recursive: true });
  await writeFile(
    path.join(dirPath, "bridge-status.json"),
    JSON.stringify(status),
    "utf8",
  );
}

test("sendCommand writes a per-request command file and resolves a matching response file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });
    const pending = client.sendCommand("get_project_info", {});
    const commandPath = await waitForMatchingFile(
      tempDir,
      /^command-.*\.json$/,
    );
    const rawCommand = await readFile(commandPath, "utf8");
    const command = JSON.parse(rawCommand) as { id: string; action: string; params: object };

    assert.equal(command.action, "get_project_info");
    assert.deepEqual(command.params, {});
    assert.equal(path.basename(commandPath), `command-${command.id}.json`);

    await writeFile(
      path.join(tempDir, `response-${command.id}.json`),
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "test.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.deepEqual(result, {
      id: command.id,
      ok: true,
      projectName: "test.prproj",
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand creates the bridge directory when it does not exist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const bridgeDir = path.join(tempDir, "bridge");
  const commandFile = path.join(bridgeDir, "cmd.json");
  const resultFile = path.join(bridgeDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(bridgeDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });
    const pending = client.sendCommand("create_sequence", { name: "Demo" });
    const commandPath = await waitForMatchingFile(
      bridgeDir,
      /^command-.*\.json$/,
    );
    const rawCommand = await readFile(commandPath, "utf8");
    const command = JSON.parse(rawCommand) as { id: string };

    await writeFile(
      path.join(bridgeDir, `response-${command.id}.json`),
      JSON.stringify({
        id: command.id,
        ok: true,
        sequenceName: "Demo",
      }),
      "utf8",
    );

    const result = await pending;
    assert.equal(result.sequenceName, "Demo");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand leaves legacy shared bridge files untouched", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeFile(commandFile, "legacy-command", "utf8");
    await writeFile(resultFile, "legacy-result", "utf8");
    await writeBridgeStatus(tempDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });

    const pending = client.sendCommand("open_project", { path: "C:/demo.prproj" });
    const commandPath = await waitForMatchingFile(
      tempDir,
      /^command-.*\.json$/,
    );
    const rawCommand = await readFile(commandPath, "utf8");
    const command = JSON.parse(rawCommand) as { id: string };

    assert.equal(await waitForFile(commandFile), "legacy-command");
    assert.equal(await waitForFile(resultFile), "legacy-result");

    await writeFile(
      path.join(tempDir, `response-${command.id}.json`),
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "demo.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.equal(result.projectName, "demo.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand uses legacy shared bridge files when the panel reports legacy mode", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });
    await writeFile(
      resultFile,
      JSON.stringify({
        id: "stale-id",
        ok: true,
        projectName: "stale.prproj",
      }),
      "utf8",
    );

    const pending = client.sendCommand("get_project_info", {});
    const rawCommand = await waitForFile(commandFile);
    const command = JSON.parse(rawCommand) as {
      id: string;
      action: string;
      params: object;
    };

    assert.equal(command.action, "get_project_info");
    assert.deepEqual(command.params, {});
    assert.equal(path.basename(commandFile), "cmd.json");

    await writeFile(
      resultFile,
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "legacy.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.deepEqual(result, {
      id: command.id,
      ok: true,
      projectName: "legacy.prproj",
    });
    assert.equal(await waitForFile(resultFile), JSON.stringify({
      id: command.id,
      ok: true,
      projectName: "legacy.prproj",
    }));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand falls back to legacy mode when the status file disappears", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 500,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });

    const initialPending = client.sendCommand("get_project_info", {});
    const initialCommandPath = await waitForMatchingFile(
      tempDir,
      /^command-.*\.json$/,
    );
    const initialCommand = JSON.parse(
      await readFile(initialCommandPath, "utf8"),
    ) as { id: string };

    await writeFile(
      path.join(tempDir, `response-${initialCommand.id}.json`),
      JSON.stringify({
        id: initialCommand.id,
        ok: true,
        projectName: "cached.prproj",
      }),
      "utf8",
    );

    await initialPending;
    await rm(initialCommandPath, { force: true });
    await unlink(path.join(tempDir, "bridge-status.json"));

    const pending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });
    const bridgeWrite = await waitForBridgeWrite(tempDir, commandFile, 1500);

    const nextCommand = JSON.parse(
      await readFile(bridgeWrite.filePath, "utf8"),
    ) as { id: string };

    if (bridgeWrite.mode === "per-request") {
      await writeFile(
        path.join(tempDir, `response-${nextCommand.id}.json`),
        JSON.stringify({
          id: nextCommand.id,
          ok: true,
          projectName: "demo.prproj",
        }),
        "utf8",
      );
    } else {
      await writeFile(
        resultFile,
        JSON.stringify({
          id: nextCommand.id,
          ok: true,
          projectName: "demo.prproj",
        }),
        "utf8",
      );
    }

    const result = await pending;
    assert.equal(bridgeWrite.mode, "legacy");
    assert.equal(result.projectName, "demo.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand removes stale legacy result files before waiting for a fresh response", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });
    await writeFile(
      resultFile,
      JSON.stringify({
        id: "stale-id",
        ok: true,
        projectName: "stale.prproj",
      }),
      "utf8",
    );

    const pending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });
    const rawCommand = await waitForFile(commandFile);
    const command = JSON.parse(rawCommand) as { id: string };

    await waitForMissingFile(resultFile);
    await writeFile(
      resultFile,
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "fresh.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.equal(result.projectName, "fresh.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand ignores stale legacy result files that already existed before the command starts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 250,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });
    await writeFile(
      resultFile,
      JSON.stringify({
        id: "stale-id",
        ok: true,
        projectName: "stale.prproj",
      }),
      "utf8",
    );

    const pending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });

    await waitForFile(commandFile);
    await waitForMissingFile(resultFile);
    await assert.rejects(
      pending,
      /Timed out waiting for Premiere result:/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand reports discarded mismatched legacy responses when no fresh response arrives", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 250,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });

    const pending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });
    const rawCommand = await waitForFile(commandFile);
    const command = JSON.parse(rawCommand) as { id: string };

    await writeFile(
      resultFile,
      JSON.stringify({
        id: "stale-id",
        ok: true,
        projectName: "stale.prproj",
      }),
      "utf8",
    );

    await waitForMissingFile(resultFile);
    await assert.rejects(
      pending,
      /Discarded mismatched Premiere result in legacy mode: expected .* received stale-id/,
    );
    assert.notEqual(command.id, "stale-id");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand re-reads the bridge status when the panel switches bridge modes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(tempDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });

    const firstPending = client.sendCommand("get_project_info", {});
    const firstCommandPath = await waitForMatchingFile(
      tempDir,
      /^command-.*\.json$/,
    );
    const firstCommand = JSON.parse(
      await readFile(firstCommandPath, "utf8"),
    ) as { id: string };

    await writeFile(
      path.join(tempDir, `response-${firstCommand.id}.json`),
      JSON.stringify({
        id: firstCommand.id,
        ok: true,
        projectName: "per-request.prproj",
      }),
      "utf8",
    );
    await firstPending;
    await rm(firstCommandPath, { force: true });

    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });

    const secondPending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });
    const bridgeWrite = await waitForBridgeWrite(tempDir, commandFile);
    const secondCommand = JSON.parse(
      await readFile(bridgeWrite.filePath, "utf8"),
    ) as { id: string };

    assert.equal(bridgeWrite.mode, "legacy");
    await writeFile(
      resultFile,
      JSON.stringify({
        id: secondCommand.id,
        ok: true,
        projectName: "legacy.prproj",
      }),
      "utf8",
    );

    const result = await secondPending;
    assert.equal(result.projectName, "legacy.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand reads per-request response files from the command directory even when resultFile points elsewhere", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const separateResultDir = path.join(tempDir, "separate-result-dir");
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(separateResultDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "per-request",
      bridgeFsAvailable: true,
    });

    const pending = client.sendCommand("get_project_info", {});
    const commandPath = await waitForMatchingFile(
      tempDir,
      /^command-.*\.json$/,
    );
    const command = JSON.parse(await readFile(commandPath, "utf8")) as { id: string };

    await writeFile(
      path.join(tempDir, `response-${command.id}.json`),
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "same-bridge-dir.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.equal(result.projectName, "same-bridge-dir.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sendCommand reads legacy response files from the command directory even when resultFile points elsewhere", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "premiere-mcp-"));
  const separateResultDir = path.join(tempDir, "legacy-result-dir");
  const commandFile = path.join(tempDir, "cmd.json");
  const resultFile = path.join(separateResultDir, "result.json");
  const client = new BridgeClient({
    commandFile,
    resultFile,
    timeoutMs: 1000,
    pollIntervalMs: 20,
  });

  try {
    await writeBridgeStatus(tempDir, {
      bridgeMode: "legacy",
      bridgeFsAvailable: false,
    });

    const pending = client.sendCommand("open_project", {
      path: "C:/demo.prproj",
    });
    const rawCommand = await waitForFile(commandFile);
    const command = JSON.parse(rawCommand) as { id: string };

    await writeFile(
      path.join(tempDir, "result.json"),
      JSON.stringify({
        id: command.id,
        ok: true,
        projectName: "legacy-same-bridge-dir.prproj",
      }),
      "utf8",
    );

    const result = await pending;
    assert.equal(result.projectName, "legacy-same-bridge-dir.prproj");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
