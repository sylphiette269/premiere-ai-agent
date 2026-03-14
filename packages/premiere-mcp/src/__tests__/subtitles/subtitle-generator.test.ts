import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { jest } from '@jest/globals';

import { generateSubtitles } from '../../subtitle-generator.js';

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

const mockExecFile = execFile as unknown as jest.MockedFunction<typeof execFile>;

function mockExecFileResponses(
  responses: Array<{
    stdout?: string;
    stderr?: string;
    error?: NodeJS.ErrnoException | Error | null;
  }>,
): void {
  let index = 0;
  mockExecFile.mockImplementation(((file: string, ...rest: unknown[]) => {
    const callback = rest[rest.length - 1] as
      | ((error: NodeJS.ErrnoException | Error | null, stdout: string, stderr: string) => void)
      | undefined;
    if (typeof callback !== 'function') {
      throw new Error(`Expected execFile callback for ${file}`);
    }

    const response = responses[index];
    index += 1;
    if (!response) {
      throw new Error(`Unexpected execFile call for ${file}`);
    }

    callback(response.error ?? null, response.stdout ?? '', response.stderr ?? '');
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

describe('generateSubtitles local backends', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('uses faster-whisper through the local Python helper when requested', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-local-subtitles-'));
    const nestedDir = path.join(root, '素材');
    const audioPath = path.join(nestedDir, '旁白.wav');
    const outputSrtPath = path.join(root, 'captions-local.srt');

    await mkdir(nestedDir, { recursive: true });
    await writeFile(audioPath, Buffer.from('fake audio'));
    mockExecFileResponses([
      {
        stdout: JSON.stringify({
          language: 'zh',
          duration: 1.8,
          segments: [
            {
              id: 1,
              start: 0,
              end: 1.8,
              text: ' 本地转录成功 ',
            },
          ],
        }),
      },
    ]);

    try {
      const result = await generateSubtitles({
        audioPath,
        outputSrtPath,
        backend: 'faster-whisper',
      });

      expect(result.backend).toBe('faster-whisper');
      expect(result.language).toBe('zh');
      expect(result.durationSec).toBe(1.8);
      expect(result.warnings).toEqual([]);
      expect(await readFile(outputSrtPath, 'utf8')).toContain('本地转录成功');
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to OpenAI when auto mode cannot start the local helper', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-auto-subtitles-'));
    const audioPath = path.join(root, 'voice.wav');
    const outputSrtPath = path.join(root, 'captions-auto.srt');
    const originalFetch = globalThis.fetch;

    await writeFile(audioPath, Buffer.from('fake audio'));
    mockExecFileResponses([
      {
        error: new Error('No module named faster_whisper'),
        stderr: 'No module named faster_whisper',
      },
    ]);

    globalThis.fetch = (async () => new Response(
      JSON.stringify({
        language: 'en',
        duration: 2.4,
        segments: [
          {
            id: 1,
            start: 0,
            end: 2.4,
            text: ' cloud fallback works ',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )) as typeof fetch;

    try {
      const result = await generateSubtitles({
        audioPath,
        outputSrtPath,
        backend: 'auto',
        apiKey: 'test-key',
      });

      expect(result.backend).toBe('openai');
      expect(result.warnings[0]).toContain('faster-whisper');
      expect(await readFile(outputSrtPath, 'utf8')).toContain('cloud fallback works');
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });
});
