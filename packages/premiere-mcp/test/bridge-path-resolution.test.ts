import test from 'node:test';
import assert from 'node:assert/strict';

import { PremiereBridge } from '../src/bridge/index.js';

function withBridgeEnv(env: Partial<Record<'PREMIERE_TEMP_DIR' | 'PREMIERE_MCP_COMMAND_FILE', string>>, run: () => void): void {
  const previousTempDir = process.env.PREMIERE_TEMP_DIR;
  const previousCommandFile = process.env.PREMIERE_MCP_COMMAND_FILE;

  if (env.PREMIERE_TEMP_DIR === undefined) {
    delete process.env.PREMIERE_TEMP_DIR;
  } else {
    process.env.PREMIERE_TEMP_DIR = env.PREMIERE_TEMP_DIR;
  }

  if (env.PREMIERE_MCP_COMMAND_FILE === undefined) {
    delete process.env.PREMIERE_MCP_COMMAND_FILE;
  } else {
    process.env.PREMIERE_MCP_COMMAND_FILE = env.PREMIERE_MCP_COMMAND_FILE;
  }

  try {
    run();
  } finally {
    if (previousTempDir === undefined) {
      delete process.env.PREMIERE_TEMP_DIR;
    } else {
      process.env.PREMIERE_TEMP_DIR = previousTempDir;
    }

    if (previousCommandFile === undefined) {
      delete process.env.PREMIERE_MCP_COMMAND_FILE;
    } else {
      process.env.PREMIERE_MCP_COMMAND_FILE = previousCommandFile;
    }
  }
}

test('PremiereBridge trims trailing separators from explicit bridge directories', () => {
  withBridgeEnv({ PREMIERE_TEMP_DIR: 'D:\\custom-bridge\\' }, () => {
    const bridge = new PremiereBridge();
    assert.equal(bridge.getBridgeDirectory(), 'D:\\custom-bridge');
  });
});
