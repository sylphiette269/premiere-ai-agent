import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

import { jest } from '@jest/globals';

import { analyzeAudioTrack } from '../../audio-analysis.js';

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

const mockExecFile = execFile as unknown as jest.MockedFunction<typeof execFile>;

describe('analyzeAudioTrack', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('invokes python analyze.py and returns parsed JSON output', async () => {
    mockExecFile.mockImplementation(((
      file: string,
      args: readonly string[],
      _options: unknown,
      callback: unknown,
    ) => {
      expect(file).toBe('python-custom');
      expect(Array.isArray(args)).toBe(true);
      expect(args[0]?.replace(/\\/g, '/')).toContain('python/analyze.py');
      expect(args).toContain('--input');
      expect(args.map((value) => value.replace(/\\/g, '/'))).toContain('E:/audio/demo.wav');
      expect(args).toContain('--method');
      expect(args).toContain('onset');
      expect(args).toContain('--energy-threshold');
      expect(args).toContain('0.7');

      const outputIndex = args.indexOf('--output');
      expect(outputIndex).toBeGreaterThan(-1);
      const outputPath = args[outputIndex + 1];

      return void writeFile(
        outputPath,
        JSON.stringify({
          tempo: 128,
          beats: [0, 0.468, 0.937],
          beat_count: 3,
          duration: 1.4,
          energy_peaks: [{ time: 0.468, strength: 0.9 }],
        }),
        'utf8',
      ).then(() => {
        (callback as (error: Error | null, stdout: string, stderr: string) => void)(
          null,
          'Analysis written',
          '',
        );
      });
    }) as typeof execFile);

    const result = await analyzeAudioTrack({
      inputPath: 'E:/audio/demo.wav',
      method: 'onset',
      energyThreshold: 0.7,
      pythonExecutable: 'python-custom',
    });

    expect(result.tempo).toBe(128);
    expect(result.beat_count).toBe(3);
    expect(result.energy_peaks).toHaveLength(1);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('throws a readable error when python execution fails', async () => {
    mockExecFile.mockImplementation(((
      _file: string,
      _args: readonly string[],
      _options: unknown,
      callback: unknown,
    ) => {
      return void (callback as (error: Error | null, stdout: string, stderr: string) => void)(
        Object.assign(new Error('spawn python ENOENT'), { code: 'ENOENT' }),
        '',
        'python missing',
      );
    }) as typeof execFile);

    await expect(
      analyzeAudioTrack({
        inputPath: 'E:/audio/demo.wav',
      }),
    ).rejects.toThrow('Audio analysis failed');
  });

  it('throws when python writes invalid JSON output', async () => {
    mockExecFile.mockImplementation(((
      _file: string,
      args: readonly string[],
      _options: unknown,
      callback: unknown,
    ) => {
      const outputIndex = args.indexOf('--output');
      const outputPath = args[outputIndex + 1];

      return void writeFile(outputPath, 'not-json', 'utf8').then(() => {
        (callback as (error: Error | null, stdout: string, stderr: string) => void)(null, '', '');
      });
    }) as typeof execFile);

    await expect(
      analyzeAudioTrack({
        inputPath: 'E:/audio/demo.wav',
      }),
    ).rejects.toThrow('Invalid audio analysis JSON');
  });
});
