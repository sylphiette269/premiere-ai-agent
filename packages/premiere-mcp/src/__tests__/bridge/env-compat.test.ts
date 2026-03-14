import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

import { PremiereBridge } from '../../bridge/index.js';

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
  },
}));

describe('PremiereBridge environment compatibility', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PREMIERE_TEMP_DIR;
    delete process.env.PREMIERE_BRIDGE_RECOVERY_COMMAND;
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
    delete process.env.PREMIERE_MCP_COMMAND_FILE;
    delete process.env.PREMIERE_BRIDGE_RECOVERY_COMMAND;
  });

  it('infers the bridge temp directory from PREMIERE_MCP_COMMAND_FILE when PREMIERE_TEMP_DIR is unset', async () => {
    process.env.PREMIERE_MCP_COMMAND_FILE = 'D:\\custom-bridge\\cmd.json';

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    expect(mockFs.mkdir).toHaveBeenCalledWith('D:\\custom-bridge', {
      recursive: true,
      mode: 0o700,
    });
  });
});
