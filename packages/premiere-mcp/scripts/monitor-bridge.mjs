import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  open,
  readdir,
  readFile,
  stat,
} from "node:fs/promises";

function parseArgs(argv) {
  const args = {
    bridgeDir: process.env.PREMIERE_TEMP_DIR
      ? path.resolve(process.env.PREMIERE_TEMP_DIR)
      : path.resolve("C:/pr-mcp-cmd"),
    json: false,
    tail: 20,
    warnStaleSeconds: 90,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--bridge-dir" && argv[index + 1]) {
      args.bridgeDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--tail" && argv[index + 1]) {
      args.tail = Math.max(0, Number.parseInt(argv[index + 1], 10) || 0);
      index += 1;
      continue;
    }

    if (token === "--warn-stale-seconds" && argv[index + 1]) {
      args.warnStaleSeconds = Math.max(0, Number.parseInt(argv[index + 1], 10) || 0);
      index += 1;
      continue;
    }

    if (token === "--json") {
      args.json = true;
    }
  }

  return args;
}

async function safeReadJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function readLastLines(filePath, lineCount) {
  if (!lineCount) {
    return [];
  }

  let handle;

  try {
    handle = await open(filePath, "r");
    const fileStat = await handle.stat();
    const windowSize = Math.min(
      Math.max(lineCount * 400, 8 * 1024),
      256 * 1024,
    );
    const bytesToRead = Math.min(fileStat.size, windowSize);
    const start = Math.max(0, fileStat.size - bytesToRead);
    const buffer = Buffer.alloc(bytesToRead);

    await handle.read(buffer, 0, bytesToRead, start);

    return buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-lineCount);
  } catch {
    return [];
  } finally {
    await handle?.close().catch(() => {});
  }
}

function truncateLine(line, maxLength = 320) {
  if (!line || line.length <= maxLength) {
    return line;
  }

  return `${line.slice(0, maxLength - 3)}...`;
}

function parseLogEvent(line) {
  const match = /^\S+\s+(\S+)\s*(.*)$/.exec(line);

  if (!match) {
    return {
      event: "",
      payload: line,
    };
  }

  return {
    event: match[1],
    payload: match[2] ?? "",
  };
}

function fileSummary(name, fileStat, nowMs) {
  if (!name || !fileStat) {
    return null;
  }

  const modifiedAt = fileStat.mtime.toISOString();
  const ageSec = Math.max(
    0,
    Math.round((nowMs - fileStat.mtimeMs) / 1000),
  );

  return {
    name,
    modifiedAt,
    ageSec,
    sizeBytes: fileStat.size,
  };
}

async function findLatestMatchingFile(bridgeDir, pattern) {
  let entries = [];

  try {
    entries = await readdir(bridgeDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name);

  if (candidates.length === 0) {
    return null;
  }

  const stats = await Promise.all(
    candidates.map(async (name) => ({
      name,
      fileStat: await safeStat(path.join(bridgeDir, name)),
    })),
  );

  return stats
    .filter((entry) => entry.fileStat)
    .sort((left, right) => right.fileStat.mtimeMs - left.fileStat.mtimeMs)[0] ?? null;
}

function buildAlerts({
  statusPayload,
  controlPayload,
  latestCommand,
  recentLog,
  warnStaleSeconds,
}) {
  const alerts = [];

  if (!statusPayload) {
    alerts.push({
      level: "error",
      code: "bridge_status_missing",
      message: "缺少 bridge-status.json，无法确认面板桥接状态。",
    });
    return alerts;
  }

  if (statusPayload.bridgeFsAvailable === false) {
    alerts.push({
      level: "error",
      code: "bridge_fs_unavailable",
      message: "CEP 面板报告 bridge 文件系统不可用。",
    });
  }

  if (!statusPayload.bridgeMode) {
    alerts.push({
      level: "warn",
      code: "bridge_mode_unknown",
      message: "bridge-status.json 未提供 bridgeMode。",
    });
  }

  if (controlPayload && controlPayload.enabled === false) {
    alerts.push({
      level: "warn",
      code: "bridge_disabled",
      message: "bridge-control.json 显示桥接当前被禁用。",
    });
  }

  if (latestCommand && latestCommand.ageSec > warnStaleSeconds) {
    alerts.push({
      level: "warn",
      code: "pending_command_stale",
      message: `检测到等待超过 ${warnStaleSeconds}s 的 command 文件：${latestCommand.name}。`,
      file: latestCommand.name,
      ageSec: latestCommand.ageSec,
    });
  }

  const errorLines = recentLog.filter((line) => {
    const { event, payload } = parseLogEvent(line);
    const normalizedPayload = payload.toLowerCase();

    if (event === "error:") {
      return true;
    }

    if (event === "raw_script" || event === "write_result") {
      return (
        normalizedPayload.includes("command_expired") ||
        normalizedPayload.includes("\"success\":false")
      );
    }

    return false;
  });

  if (errorLines.length > 0) {
    alerts.push({
      level: "warn",
      code: "panel_log_error",
      message: `最近日志中有 ${errorLines.length} 条疑似错误记录。`,
      samples: errorLines.slice(-3).map((line) => truncateLine(line)),
    });
  }

  return alerts;
}

function summarizeStatus(alerts) {
  if (alerts.some((alert) => alert.level === "error")) {
    return "error";
  }
  if (alerts.some((alert) => alert.level === "warn")) {
    return "warn";
  }
  return "ok";
}

export async function inspectBridge(bridgeDir, options = {}) {
  const warnStaleSeconds = options.warnStaleSeconds ?? 90;
  const tail = options.tail ?? 20;
  const now = new Date();
  const nowMs = now.getTime();
  const statusPayload = await safeReadJson(path.join(bridgeDir, "bridge-status.json"));
  const controlPayload = await safeReadJson(path.join(bridgeDir, "bridge-control.json"));
  const sessionPayload = await safeReadJson(path.join(bridgeDir, "session-context.json"));
  const recentLog = await readLastLines(path.join(bridgeDir, "panel.log"), tail);
  const latestCommandEntry = await findLatestMatchingFile(bridgeDir, /^command-.*\.json$/);
  const latestResponseEntry = await findLatestMatchingFile(bridgeDir, /^response-.*\.json$/);
  const latestCommand = latestCommandEntry
    ? fileSummary(latestCommandEntry.name, latestCommandEntry.fileStat, nowMs)
    : null;
  const latestResponse = latestResponseEntry
    ? fileSummary(latestResponseEntry.name, latestResponseEntry.fileStat, nowMs)
    : null;
  const alerts = buildAlerts({
    statusPayload,
    controlPayload,
    latestCommand,
    recentLog,
    warnStaleSeconds,
  });

  return {
    status: summarizeStatus(alerts),
    checkedAt: now.toISOString(),
    bridgeDir,
    bridge: {
      mode: statusPayload?.bridgeMode ?? null,
      fsAvailable: statusPayload?.bridgeFsAvailable ?? null,
      panelVersion: statusPayload?.panelVersion ?? null,
      extensionId: statusPayload?.extensionId ?? null,
    },
    control: {
      enabled: controlPayload?.enabled ?? null,
      source: controlPayload?.source ?? null,
      updatedAt: controlPayload?.updatedAt ?? null,
    },
    project: {
      path: sessionPayload?.projectPath ?? null,
    },
    activity: {
      latestCommand,
      latestResponse,
    },
    alerts,
    recentLog: recentLog.map((line) => truncateLine(line)),
  };
}

function renderText(summary) {
  const lines = [
    "Bridge Monitor",
    `status: ${summary.status}`,
    `bridgeDir: ${summary.bridgeDir}`,
    `bridge: mode=${summary.bridge.mode ?? "unknown"} fsAvailable=${summary.bridge.fsAvailable ?? "unknown"} panelVersion=${summary.bridge.panelVersion ?? "unknown"}`,
    `control: enabled=${summary.control.enabled ?? "unknown"} source=${summary.control.source ?? "unknown"}`,
    `project: ${summary.project.path ?? "(none)"}`,
    `latestCommand: ${summary.activity.latestCommand ? `${summary.activity.latestCommand.name} (${summary.activity.latestCommand.ageSec}s)` : "(none)"}`,
    `latestResponse: ${summary.activity.latestResponse ? `${summary.activity.latestResponse.name} (${summary.activity.latestResponse.ageSec}s)` : "(none)"}`,
  ];

  if (summary.alerts.length === 0) {
    lines.push("alerts: none");
  } else {
    lines.push("alerts:");
    for (const alert of summary.alerts) {
      lines.push(`- [${alert.level}] ${alert.code}: ${alert.message}`);
    }
  }

  if (summary.recentLog.length > 0) {
    lines.push("recentLog:");
    for (const line of summary.recentLog) {
      lines.push(`- ${line}`);
    }
  }

  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const summary = await inspectBridge(args.bridgeDir, {
    tail: args.tail,
    warnStaleSeconds: args.warnStaleSeconds,
  });
  const output = args.json
    ? JSON.stringify(summary, null, 2)
    : renderText(summary);

  console.log(output);
  return summary.status === "error" ? 1 : 0;
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(
      JSON.stringify(
        {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
