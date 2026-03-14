import test from "node:test";
import assert from "node:assert/strict";

import { getBridgeConfig } from "../src/config.js";

test("getBridgeConfig returns default bridge files", () => {
  const config = getBridgeConfig();

  assert.equal(config.commandFile, "C:/pr-mcp-cmd/cmd.json");
  assert.equal(config.resultFile, "C:/pr-mcp-cmd/result.json");
  assert.equal(config.timeoutMs, 20000);
  assert.equal(config.pollIntervalMs, 200);
});

test("getBridgeConfig supports environment overrides", () => {
  const config = getBridgeConfig({
    PREMIERE_MCP_COMMAND_FILE: "D:/temp/cmd.json",
    PREMIERE_MCP_RESULT_FILE: "D:/temp/result.json",
    PREMIERE_MCP_TIMEOUT_MS: "1500",
    PREMIERE_MCP_POLL_INTERVAL_MS: "50",
  });

  assert.equal(config.commandFile, "D:/temp/cmd.json");
  assert.equal(config.resultFile, "D:/temp/result.json");
  assert.equal(config.timeoutMs, 1500);
  assert.equal(config.pollIntervalMs, 50);
});
