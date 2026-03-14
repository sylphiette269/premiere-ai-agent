/**
 * Unit tests for PremiereBridge
 */

import { PremiereBridge } from '../../bridge/index.js';
import { mkdirSync, promises as fs } from 'fs';
import { exec } from 'child_process';
import { join } from 'path';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
  }
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('PremiereBridge', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = '/tmp/premiere-mcp-bridge-test';
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
    delete process.env.PREMIERE_BRIDGE_RECOVERY_COMMAND;
  });

  it('initializes using the configured temp directory', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/premiere-mcp-bridge-test', {
      recursive: true,
      mode: 0o700
    });
  });

  it('does not create a generated bridge directory during construction', () => {
    delete process.env.PREMIERE_TEMP_DIR;
    delete process.env.PREMIERE_MCP_COMMAND_FILE;

    const bridge = new PremiereBridge();

    expect(bridge.getBridgeDirectory()).toContain('premiere-bridge-');
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockFs.mkdir).not.toHaveBeenCalled();
  });

  it('creates a generated bridge directory during initialize', async () => {
    delete process.env.PREMIERE_TEMP_DIR;
    delete process.env.PREMIERE_MCP_COMMAND_FILE;

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);

    await bridge.initialize();

    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(mockFs.mkdir).toHaveBeenCalledWith(bridge.getBridgeDirectory(), {
      recursive: true,
      mode: 0o700,
    });
  });

  it('initialization no longer probes the Premiere executable path', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    expect(mockFs.access).not.toHaveBeenCalled();
  });

  it('writes explicit sequence settings when createSequence receives custom dimensions and rates', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      id: 'seq-custom',
      name: 'Custom Sequence',
      duration: 0,
      frameRate: 25,
      videoTracks: [],
      audioTracks: []
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.createSequence('Custom Sequence', undefined, {
      width: 1920,
      height: 1080,
      frameRate: 25,
      sampleRate: 48000
    });

    const [, actionPayload] = mockFs.writeFile.mock.calls[0];
    const actionCommand = JSON.parse(String(actionPayload));
    expect(actionCommand).toMatchObject({
      action: 'create_sequence',
      params: { name: 'Custom Sequence' },
    });

    const [, writtenPayload] = mockFs.writeFile.mock.calls[1];
    const command = JSON.parse(String(writtenPayload));
    const script = String(command.script);

    expect(script).toContain('sequence.getSettings()');
    expect(script).toContain('settings.videoFrameWidth = 1920');
    expect(script).toContain('settings.videoFrameHeight = 1080');
    expect(script).toContain('settings.videoFrameRate = new Time()');
    expect(script).toContain('settings.videoFrameRate.setSecondsAsFraction(1, 25)');
    expect(script).toContain('settings.audioSampleRate = new Time()');
    expect(script).toContain('settings.audioSampleRate.setSecondsAsFraction(1, 48000)');
    expect(script).toContain('sequence.setSettings(settings)');
    expect(script).toContain('duration: bridgeTicksToSeconds(sequence.end) - bridgeTicksToSeconds(sequence.zeroPoint)');
    expect(script).not.toContain('duration: sequence.end - sequence.zeroPoint');
  });

  it('writes clip-derived sequence creation options into the action payload', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify({
        ok: true,
        mode: 'createNewSequenceFromClips',
        sequenceName: 'Clip Derived Sequence',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        id: 'seq-clip-derived',
        name: 'Clip Derived Sequence',
        duration: 0,
        frameRate: 25,
        videoTracks: [],
        audioTracks: [],
      }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.createSequence(
      'Clip Derived Sequence',
      undefined,
      undefined,
      {
        mediaPath: 'E:/media/shot01.mp4',
        avoidCreateNewSequence: true,
      },
    );

    const [, actionPayload] = mockFs.writeFile.mock.calls[0];
    const actionCommand = JSON.parse(String(actionPayload));

    expect(actionCommand).toMatchObject({
      action: 'create_sequence',
      params: {
        name: 'Clip Derived Sequence',
        mediaPath: 'E:/media/shot01.mp4',
        avoidCreateNewSequence: true,
      },
    });
  });

  it('writes and cleans up command and response files during executeScript', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result = await bridge.executeScript('return JSON.stringify({ ok: true });');
    const [commandPath, writtenPayload] = mockFs.writeFile.mock.calls[0] as [string, string];
    const responsePath = commandPath.replace('command-', 'response-');

    expect(result).toEqual({ ok: true });
    expect(commandPath).toMatch(/command-[0-9a-f-]+\.json$/i);
    expect(String(writtenPayload)).toContain('return JSON.stringify');
    expect(mockFs.unlink).toHaveBeenCalledWith(commandPath);
    expect(mockFs.unlink).toHaveBeenCalledWith(responsePath);
  });

  it('writes command timeout metadata for CEP recovery', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.executeScript('return JSON.stringify({ ok: true });');

    const [, writtenPayload] = mockFs.writeFile.mock.calls[0];
    const command = JSON.parse(String(writtenPayload));

    expect(command.timeoutMs).toBe(55000);
    expect(typeof command.id).toBe('string');
    expect(typeof command.expiresAt).toBe('string');
    expect(Number.isNaN(Date.parse(command.expiresAt))).toBe(false);
    expect(Date.parse(command.expiresAt)).toBeGreaterThan(Date.parse(command.timestamp));
  });

  it('runs the configured recovery command and retries once after a bridge timeout', async () => {
    process.env.PREMIERE_BRIDGE_RECOVERY_COMMAND = 'powershell -File ./scripts/recover-windows-cep-bridge.ps1';

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockExec.mockImplementation(((_command: string, callback?: any) => {
      callback?.(null, 'recovered', '');
      return {} as any;
    }) as typeof exec);

    await bridge.initialize();

    const waitForResponse = jest
      .spyOn(bridge as any, 'waitForResponse')
      .mockRejectedValueOnce(new Error('PremiereBridge timeout. Ensure Premiere Pro is open, CEP panel is running, and bridge directory is: /tmp/premiere-mcp-bridge-test'))
      .mockResolvedValueOnce({ ok: true, recovered: true });

    const result = await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(result).toEqual({ ok: true, recovered: true });
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith(
      'powershell -File ./scripts/recover-windows-cep-bridge.ps1',
      expect.any(Function)
    );
    expect(waitForResponse).toHaveBeenCalledTimes(2);
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('persists the last opened project path for bridge recovery', async () => {
    process.env.PREMIERE_TEMP_DIR = 'C:\\Temp\\premiere-mcp-bridge-test';

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: true,
      path: 'E:\\projects\\demo.prproj',
      name: 'demo.prproj'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(mockFs.writeFile).toHaveBeenNthCalledWith(
      2,
      join('C:\\Temp\\premiere-mcp-bridge-test', 'session-context.json'),
      JSON.stringify({ projectPath: 'E:\\projects\\demo.prproj' })
    );
  });

  it('uses the default recovery script and persisted project path when no recovery command is configured', async () => {
    process.env.PREMIERE_TEMP_DIR = 'C:\\Temp\\premiere-mcp-bridge-test';

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockExec.mockImplementation(((_command: string, callback?: any) => {
      callback?.(null, 'recovered', '');
      return {} as any;
    }) as typeof exec);

    jest
      .spyOn(bridge as any, 'recoveryScriptPath')
      .mockReturnValue('C:\\premiere-mcp-upstream\\scripts\\recover-windows-cep-bridge.ps1');
    jest
      .spyOn(bridge as any, 'loadContext')
      .mockResolvedValue({ projectPath: 'E:\\浣滀笟1\\鏈懡鍚?prproj' });

    await bridge.initialize();

    const waitForResponse = jest
      .spyOn(bridge as any, 'waitForResponse')
      .mockRejectedValueOnce(new Error('PremiereBridge timeout. Ensure Premiere Pro is open, CEP panel is running, and bridge directory is: C:\\Temp\\premiere-mcp-bridge-test'))
      .mockResolvedValueOnce({ ok: true, recovered: true });

    const result = await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(result).toEqual({ ok: true, recovered: true });
    expect(mockExec).toHaveBeenCalledWith(
      'powershell -ExecutionPolicy Bypass -File "C:\\premiere-mcp-upstream\\scripts\\recover-windows-cep-bridge.ps1" -TempDir "C:\\Temp\\premiere-mcp-bridge-test" -ProjectPath "E:\\浣滀笟1\\鏈懡鍚?prproj"',
      expect.any(Function)
    );
    expect(waitForResponse).toHaveBeenCalledTimes(2);
  });

  it('escapes PowerShell recovery arguments when persisted paths contain quotes and variables', async () => {
    process.env.PREMIERE_TEMP_DIR = 'C:\\Temp\\premiere-mcp-bridge-test';

    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockExec.mockImplementation(((_command: string, callback?: any) => {
      callback?.(null, 'recovered', '');
      return {} as any;
    }) as typeof exec);

    jest
      .spyOn(bridge as any, 'recoveryScriptPath')
      .mockReturnValue('C:\\premiere-mcp-upstream\\scripts\\recover-windows-cep-bridge.ps1');
    jest
      .spyOn(bridge as any, 'loadContext')
      .mockResolvedValue({ projectPath: 'E:\\Projects\\Bob "Cut" $env:TEMP.prproj' });

    await bridge.initialize();

    const waitForResponse = jest
      .spyOn(bridge as any, 'waitForResponse')
      .mockRejectedValueOnce(new Error('PremiereBridge timeout. Ensure Premiere Pro is open, CEP panel is running, and bridge directory is: C:\\Temp\\premiere-mcp-bridge-test'))
      .mockResolvedValueOnce({ ok: true, recovered: true });

    const result = await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(result).toEqual({ ok: true, recovered: true });
    expect(mockExec).toHaveBeenCalledWith(
      'powershell -ExecutionPolicy Bypass -File "C:\\premiere-mcp-upstream\\scripts\\recover-windows-cep-bridge.ps1" -TempDir "C:\\Temp\\premiere-mcp-bridge-test" -ProjectPath "E:\\Projects\\Bob `"Cut`" `$env:TEMP.prproj"',
      expect.any(Function)
    );
    expect(waitForResponse).toHaveBeenCalledTimes(2);
  });

  it('ignores invalid persisted recovery project paths', async () => {
    process.env.PREMIERE_TEMP_DIR = 'C:\\Temp\\premiere-mcp-bridge-test';

    const bridge = new PremiereBridge();
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      projectPath: 'C:\\Windows\\System32\\cmd.exe'
    }));

    const result = await (bridge as any).loadContext();

    expect(result).toBeNull();
  });

  it('passes through importMedia responses', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: true,
      id: 'item-123',
      name: 'video.mp4'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result = await bridge.importMedia('/path/to/video.mp4');

    expect(result.success).toBe(true);
    expect(result.id).toBe('item-123');
  });

  it('rejects generated verification artifacts before writing bridge commands', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);

    await bridge.initialize();

    await expect(
      bridge.importMedia('C:/Users/test/AppData/Local/Temp/premiere-fade-verify-demo/frame-17.jpg'),
    ).rejects.toThrow('generated_verification_artifact_not_allowed');

    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('fails fast when waitForResponse hits a non-retryable filesystem error', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('permission denied'), {
      code: 'EACCES'
    }) as NodeJS.ErrnoException);

    await bridge.initialize();

    await expect((bridge as any).waitForResponse('/tmp/response.json', 200)).rejects.toThrow('permission denied');
    expect(mockFs.readFile).toHaveBeenCalledTimes(1);
  });

  it('retries when waitForResponse sees a partially written JSON payload', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.readFile
      .mockResolvedValueOnce('{"result":')
      .mockResolvedValueOnce(JSON.stringify({ result: { ok: true, projectName: 'demo.prproj' } }));

    await bridge.initialize();

    await expect((bridge as any).waitForResponse('/tmp/response.json', 600)).resolves.toEqual({
      ok: true,
      projectName: 'demo.prproj',
    });
    expect(mockFs.readFile).toHaveBeenCalledTimes(2);
  });

  it('fails fast when waitForResponse sees malformed JSON that is not a partial write', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.readFile.mockResolvedValue('{"result": invalid}');

    await bridge.initialize();

    await expect((bridge as any).waitForResponse('/tmp/response.json', 600)).rejects.toThrow(
      'Invalid Premiere bridge response JSON'
    );
    expect(mockFs.readFile).toHaveBeenCalledTimes(1);
  });

  it('escapes createProject and openProject arguments before embedding them in ExtendScript', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    jest.spyOn(bridge as any, 'waitForResponse').mockResolvedValue({ ok: true });

    await bridge.initialize();
    await bridge.createProject('Demo "Project"\nOne', 'C:\\Projects\\Demo "Root"');

    let [, payload] = mockFs.writeFile.mock.calls[0];
    let command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `app.newProject(${JSON.stringify('Demo "Project"\nOne')}, ${JSON.stringify('C:\\Projects\\Demo "Root"')});`
    );

    mockFs.writeFile.mockClear();
    await bridge.openProject('C:\\Projects\\Demo "Root"\\edit.prproj');

    [, payload] = mockFs.writeFile.mock.calls[0];
    command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `app.openDocument(${JSON.stringify('C:\\Projects\\Demo "Root"\\edit.prproj')});`
    );
  });

  it('escapes bridge helper arguments before writing script files', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    jest.spyOn(bridge as any, 'waitForResponse').mockResolvedValue({ ok: true });

    await bridge.initialize();

    await bridge.createSequence('Seq "A"', 'C:\\Presets\\Demo "Preset".sqpreset');
    let [, payload] = mockFs.writeFile.mock.calls[0];
    let command = JSON.parse(String(payload));
    expect(command).toMatchObject({
      action: 'create_sequence',
      params: {
        name: 'Seq "A"',
        presetPath: 'C:\\Presets\\Demo "Preset".sqpreset',
      },
    });

    [, payload] = mockFs.writeFile.mock.calls[1];
    command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `var requestedSequenceName = ${JSON.stringify('Seq "A"')};`
    );
    expect(String(command.script)).toContain(
      'if (!sequence) {'
    );

    mockFs.writeFile.mockClear();
    await bridge.createSequence('Seq Without Preset');
    [, payload] = mockFs.writeFile.mock.calls[0];
    command = JSON.parse(String(payload));
    expect(command).toMatchObject({
      action: 'create_sequence',
      params: {
        name: 'Seq Without Preset',
      },
    });

    [, payload] = mockFs.writeFile.mock.calls[1];
    command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `var requestedSequenceName = ${JSON.stringify('Seq Without Preset')};`
    );
    expect(String(command.script)).not.toContain(
      'createNewSequence('
    );

    mockFs.writeFile.mockClear();
    await bridge.addToTimeline('seq-"1"', 'item-"2"', 1, 12.5);
    [, payload] = mockFs.writeFile.mock.calls[0];
    command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `var sequence = bridgeLookupSequence(${JSON.stringify('seq-"1"')});`
    );
    expect(String(command.script)).toContain(
      `var projectItem = bridgeLookupProjectItem(${JSON.stringify('item-"2"')});`
    );

    mockFs.writeFile.mockClear();
    await bridge.renderSequence('seq-"1"', 'C:\\Exports\\Demo "Cut".mp4', 'C:\\Presets\\H264 "HQ".epr');
    [, payload] = mockFs.writeFile.mock.calls[0];
    command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `var sequence = app.project.getSequenceByID(${JSON.stringify('seq-"1"')});`
    );
    expect(String(command.script)).toContain(
      `encoder.encodeSequence(sequence, ${JSON.stringify('C:\\Exports\\Demo "Cut".mp4')}, ${JSON.stringify('C:\\Presets\\H264 "HQ".epr')},`
    );
  });

  it('uses the sequence name confirmed by the bridge action when resolving the created sequence', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify({
        ok: true,
        sequenceName: 'Resolved Seq Name',
        mode: 'qe.project.newSequence',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        id: 'seq-123',
        name: 'Resolved Seq Name',
        duration: 0,
        frameRate: 25,
        videoTracks: [],
        audioTracks: [],
      }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.createSequence('Requested Seq Name');

    const [, payload] = mockFs.writeFile.mock.calls[1];
    const command = JSON.parse(String(payload));
    expect(String(command.script)).toContain(
      `var requestedSequenceName = ${JSON.stringify('Resolved Seq Name')};`
    );
    expect(String(command.script)).not.toContain(
      `var requestedSequenceName = ${JSON.stringify('Requested Seq Name')};`
    );
  });

  it('rejects invalid custom frame rates before dispatching sequence creation', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    await expect(
      bridge.createSequence('Invalid Sequence', undefined, { frameRate: Number.NaN as unknown as number }),
    ).rejects.toThrow('Invalid frame rate');
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('throws when renderSequence reports that the target sequence does not exist', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'sequence_not_found',
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();

    await expect(
      bridge.renderSequence('missing-seq', 'C:\\Exports\\missing.mp4', 'C:\\Presets\\preset.epr'),
    ).rejects.toThrow('sequence_not_found');
  });

  it('does not delete externally managed temp directories during cleanup', async () => {
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();
    await bridge.cleanup();

    expect(mockFs.rm).not.toHaveBeenCalled();
  });

  it('deletes generated temp directories when no external temp dir is configured', async () => {
    delete process.env.PREMIERE_TEMP_DIR;
    const bridge = new PremiereBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.rm.mockResolvedValue(undefined);

    await bridge.initialize();
    const generatedDir = bridge.getBridgeDirectory();
    await bridge.cleanup();

    expect(mockFs.rm).toHaveBeenCalledWith(generatedDir, { recursive: true });
  });
});
