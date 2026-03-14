import { execFile } from 'node:child_process';

import { jest } from '@jest/globals';

import { analyzeVideoReference } from '../../video-reference-analyzer.js';

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

const mockExecFile = execFile as unknown as jest.MockedFunction<typeof execFile>;

function mockExecFileSequence(
  sequence: Array<{
    command: string;
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
      throw new Error('Expected execFile callback');
    }

    const response = sequence[index];
    index += 1;
    if (!response) {
      throw new Error(`Unexpected execFile call for ${file}`);
    }

    expect(file).toBe(response.command);
    callback(response.error ?? null, response.stdout ?? '', response.stderr ?? '');
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

function createSignalStatsOutput(values: number[]): string {
  return values
    .map(
      (value, index) =>
        [
          `frame:${index} pts:${index} pts_time:${(index * 0.08).toFixed(3)}`,
          `lavfi.signalstats.YAVG=${value.toFixed(3)}`,
        ].join('\n'),
    )
    .join('\n');
}

function createQualityStatsOutput(samples: Array<{ yAvg: number; satAvg: number }>): string {
  return samples
    .map(
      (sample, index) =>
        [
          `frame:${index} pts:${index} pts_time:${(index * 4).toFixed(3)}`,
          `lavfi.signalstats.YAVG=${sample.yAvg.toFixed(3)}`,
          `lavfi.signalstats.SATAVG=${sample.satAvg.toFixed(3)}`,
        ].join('\n'),
    )
    .join('\n');
}

describe('analyzeVideoReference', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('returns a structured video blueprint when ffprobe metadata is available', async () => {
    mockExecFileSequence([
      {
        command: 'ffprobe',
        stdout: JSON.stringify({
          format: {
            duration: '12.5',
          },
          streams: [
            {
              codec_type: 'video',
              avg_frame_rate: '25/1',
            },
            {
              codec_type: 'audio',
            },
          ],
        }),
      },
      {
        command: 'ffmpeg',
        stderr: [
          '[Parsed_showinfo_0 @ 000001] pts_time:2.5',
          '[Parsed_showinfo_0 @ 000002] pts_time:8.0',
        ].join('\n'),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([42, 43, 44, 188, 190, 192]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([42, 43, 44, 188, 190, 192]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([42, 43, 44, 188, 190, 192]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([124, 118, 34, 14, 43, 128]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([123, 117, 33, 13, 42, 127]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([125, 119, 36, 14, 44, 129]),
      },
      {
        command: 'ffmpeg',
        stdout: createQualityStatsOutput([
          { yAvg: 38, satAvg: 18 },
          { yAvg: 52, satAvg: 22 },
          { yAvg: 46, satAvg: 20 },
        ]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([12, 18, 15]),
      },
    ]);

    const blueprint = await analyzeVideoReference('E:/reference/demo.mp4');

    expect(blueprint.sourcePath).toBe('E:/reference/demo.mp4');
    expect(blueprint.totalDuration).toBeCloseTo(12.5, 3);
    expect(blueprint.estimatedFrameRate).toBeCloseTo(25, 3);
    expect(blueprint.shots).toHaveLength(3);
    expect(blueprint.shots.map((shot) => Number(shot.durationSec.toFixed(2)))).toEqual([2.5, 5.5, 4.5]);
    expect(blueprint.shots.map((shot) => shot.transitionIn)).toEqual([null, 'cut', 'Dip to Black']);
    expect(blueprint.shots.map((shot) => shot.transitionOut)).toEqual(['cut', 'Dip to Black', null]);
    expect(blueprint.pacing.avgShotDurationSec).toBeCloseTo(12.5 / 3, 3);
    expect(blueprint.pacing.rhythmPattern).toBe('irregular');
    expect(blueprint.audioProfile.hasNaturalSound).toBe(true);
    expect(blueprint.keyframes).toEqual([
      {
        index: 0,
        timeSec: 2.5,
        score: 0,
      },
      {
        index: 1,
        timeSec: 8,
        score: 0,
      },
    ]);
    expect(blueprint.qualityMetrics).toEqual({
      sampleCount: 3,
      averageBrightness: 45.333333,
      averageSaturation: 20,
      averageSharpness: 15,
      brightnessLevel: 'low',
      saturationLevel: 'low',
      sharpnessLevel: 'soft',
      samples: [
        {
          timeSec: 0,
          brightness: 38,
          saturation: 18,
          sharpness: 12,
        },
        {
          timeSec: 4,
          brightness: 52,
          saturation: 22,
          sharpness: 18,
        },
        {
          timeSec: 8,
          brightness: 46,
          saturation: 20,
          sharpness: 15,
        },
      ],
    });
    expect(blueprint.colorProfile.saturation).toBe('low');
    expect(blueprint.colorProfile.brightness).toBe('low');
    expect(blueprint.textOverlays).toEqual([]);
    expect(blueprint.dominantTransitions).toEqual(['cut']);
  });

  it('surfaces Cross Dissolve as the dominant transition when every boundary resolves to it', async () => {
    mockExecFileSequence([
      {
        command: 'ffprobe',
        stdout: JSON.stringify({
          format: {
            duration: '8.0',
          },
          streams: [
            {
              codec_type: 'video',
              avg_frame_rate: '30/1',
            },
          ],
        }),
      },
      {
        command: 'ffmpeg',
        stderr: '[Parsed_showinfo_0 @ 000001] pts_time:4.0',
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      },
      {
        command: 'ffmpeg',
        stdout: createQualityStatsOutput([
          { yAvg: 180, satAvg: 142 },
          { yAvg: 190, satAvg: 148 },
        ]),
      },
      {
        command: 'ffmpeg',
        stdout: createSignalStatsOutput([48, 52]),
      },
    ]);

    const blueprint = await analyzeVideoReference('E:/reference/dissolve.mp4');

    expect(blueprint.shots).toHaveLength(2);
    expect(blueprint.shots[0]?.transitionOut).toBe('Cross Dissolve');
    expect(blueprint.shots[1]?.transitionIn).toBe('Cross Dissolve');
    expect(blueprint.keyframes).toEqual([
      {
        index: 0,
        timeSec: 4,
        score: 0,
      },
    ]);
    expect(blueprint.qualityMetrics.averageBrightness).toBe(185);
    expect(blueprint.qualityMetrics.averageSaturation).toBe(145);
    expect(blueprint.qualityMetrics.averageSharpness).toBe(50);
    expect(blueprint.qualityMetrics.brightnessLevel).toBe('high');
    expect(blueprint.qualityMetrics.saturationLevel).toBe('high');
    expect(blueprint.qualityMetrics.sharpnessLevel).toBe('balanced');
    expect(blueprint.dominantTransitions).toEqual(['Cross Dissolve']);
  });

  it('falls back to a minimal blueprint when ffprobe is unavailable', async () => {
    const missingBinaryError = Object.assign(new Error('spawn ffprobe ENOENT'), {
      code: 'ENOENT',
    });
    mockExecFileSequence([
      {
        command: 'ffprobe',
        error: missingBinaryError,
      },
    ]);

    const blueprint = await analyzeVideoReference('E:/reference/fallback.mp4');

    expect(blueprint.sourcePath).toBe('E:/reference/fallback.mp4');
    expect(blueprint.totalDuration).toBe(0);
    expect(blueprint.estimatedFrameRate).toBe(30);
    expect(blueprint.shots).toHaveLength(1);
    expect(blueprint.shots[0]).toMatchObject({
      index: 0,
      startSec: 0,
      endSec: 0,
      durationSec: 0,
      dominantColor: 'neutral',
      motionAmount: 'medium',
      shotType: 'unknown',
    });
    expect(blueprint.audioProfile).toMatchObject({
      hasMusic: false,
      hasVoiceover: false,
      hasNaturalSound: false,
    });
    expect(blueprint.keyframes).toEqual([]);
    expect(blueprint.qualityMetrics).toEqual({
      sampleCount: 0,
      averageBrightness: 0,
      averageSaturation: 0,
      averageSharpness: 0,
      brightnessLevel: 'unknown',
      saturationLevel: 'unknown',
      sharpnessLevel: 'unknown',
      samples: [],
    });
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });
});
