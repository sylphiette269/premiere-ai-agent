import { RECOVERY_WAIT_MS } from "./exchange.js";
import type { SessionContext } from "./types.js";
import { validateFilePath } from "../utils/security.js";

export function escapePowerShellArgument(value: string): string {
  return value
    .replace(/`/g, "``")
    .replace(/\r/g, "`r")
    .replace(/\n/g, "`n")
    .replace(/"/g, '`"')
    .replace(/\$/g, "`$");
}

export function extractSessionContext(result: unknown): SessionContext | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  for (const key of ["path", "projectPath"]) {
    const value = (result as Record<string, unknown>)[key];
    if (typeof value === "string" && /\.prproj$/i.test(value.trim())) {
      return { projectPath: value.trim() };
    }
  }

  return null;
}

export function parseSessionContext(raw: string): SessionContext | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const projectPath = typeof parsed.projectPath === "string" ? parsed.projectPath.trim() : "";

  if (!projectPath) {
    return null;
  }

  const validation = validateFilePath(projectPath);
  if (!validation.valid) {
    return null;
  }

  return { projectPath: validation.normalized || projectPath };
}

export function buildRecoveryCommand(
  scriptPath: string,
  bridgeDir: string,
  projectPath: string | undefined,
  escapeArg: (value: string) => string = escapePowerShellArgument,
): string {
  const parts = [
    `powershell -ExecutionPolicy Bypass -File "${escapeArg(scriptPath)}"`,
    `-TempDir "${escapeArg(bridgeDir)}"`,
  ];

  if (projectPath) {
    parts.push(`-ProjectPath "${escapeArg(projectPath)}"`);
  }

  return parts.join(" ");
}

export function resolveRecoveryWaitMs(
  env: NodeJS.ProcessEnv = process.env,
  fallbackMs: number = RECOVERY_WAIT_MS,
): number {
  const value = Number(env.PREMIERE_BRIDGE_RECOVERY_WAIT_MS);
  return Number.isFinite(value) && value >= 0 ? value : fallbackMs;
}
