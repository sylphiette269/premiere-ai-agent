import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { MediaProbeResult } from '../types.js';

const execFileAsync = promisify(execFile);

type FfprobeOutput = {
  format?: {
    duration?: string;
  };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }>;
};

function parseFrameRate(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const [numeratorRaw, denominatorRaw] = raw.split('/');
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw ?? '1');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  return numerator / denominator;
}

export async function probeMediaWithFfprobe(filePath: string): Promise<MediaProbeResult> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height,r_frame_rate',
      '-of',
      'json',
      filePath,
    ],
    {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const durationSeconds = Number(parsed.format?.duration ?? '0');
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Unable to read media duration via ffprobe for '${filePath}'.`);
  }

  return {
    durationSeconds,
    width: videoStream?.width,
    height: videoStream?.height,
    frameRate: parseFrameRate(videoStream?.r_frame_rate),
  };
}
