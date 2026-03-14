export type BridgeConfig = {
  commandFile: string;
  resultFile: string;
  timeoutMs: number;
  pollIntervalMs: number;
};

type BridgeEnv = Partial<Record<string, string | undefined>>;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getBridgeConfig(env: BridgeEnv = process.env): BridgeConfig {
  return {
    commandFile: env.PREMIERE_MCP_COMMAND_FILE ?? "C:/pr-mcp-cmd/cmd.json",
    resultFile: env.PREMIERE_MCP_RESULT_FILE ?? "C:/pr-mcp-cmd/result.json",
    timeoutMs: parsePositiveInteger(env.PREMIERE_MCP_TIMEOUT_MS, 20000),
    pollIntervalMs: parsePositiveInteger(
      env.PREMIERE_MCP_POLL_INTERVAL_MS,
      200,
    ),
  };
}
