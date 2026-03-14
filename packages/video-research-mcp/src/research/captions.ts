import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CaptionAnalysis, CaptionCue } from '../types.js';

const SIDE_CAR_EXTENSIONS = ['.srt', '.vtt', '.txt', '.json'] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseTimestamp(raw: string): number | undefined {
  const normalized = raw.replace(',', '.').trim();
  const parts = normalized.split(':');
  if (parts.length !== 3) {
    return undefined;
  }
  const [hours, minutes, seconds] = parts.map(Number);
  if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return undefined;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseTimestampLine(line: string): { startSeconds?: number; endSeconds?: number } {
  const [startRaw, endRaw] = line.split('-->');
  return {
    startSeconds: startRaw ? parseTimestamp(startRaw) : undefined,
    endSeconds: endRaw ? parseTimestamp(endRaw) : undefined,
  };
}

function parseSrtOrVtt(content: string): CaptionCue[] {
  const normalized = content.replace(/\r/g, '').trim();
  if (!normalized) {
    return [];
  }

  const cues: Array<CaptionCue | null> = normalized
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const timestampLine = lines.find((line) => line.includes('-->'));
      if (!timestampLine) {
        return null;
      }
      const { startSeconds, endSeconds } = parseTimestampLine(timestampLine);
      const text = lines
        .filter((line) => !line.includes('-->') && !/^\d+$/.test(line))
        .join(' ')
        .trim();
      if (!text) {
        return null;
      }
      return { startSeconds, endSeconds, text };
    });

  return cues.filter((cue): cue is CaptionCue => cue !== null);
}

function parseJsonCaptions(content: string): CaptionCue[] {
  const parsed = JSON.parse(content) as
    | { segments?: Array<{ start?: number; end?: number; text?: string }> }
    | Array<{ start?: number; end?: number; text?: string }>;
  const segments = Array.isArray(parsed) ? parsed : parsed.segments ?? [];
  return segments
    .map((segment) => ({
      startSeconds: segment.start,
      endSeconds: segment.end,
      text: segment.text?.trim() ?? '',
    }))
    .filter((segment) => segment.text.length > 0);
}

export async function findCaptionSidecarPath(
  sourceVideoPath: string,
  explicitCaptionPath?: string,
): Promise<string | undefined> {
  if (explicitCaptionPath && await fileExists(explicitCaptionPath)) {
    return explicitCaptionPath;
  }

  const parsed = path.parse(sourceVideoPath);
  for (const extension of SIDE_CAR_EXTENSIONS) {
    const candidate = path.join(parsed.dir, `${parsed.name}${extension}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function parseCaptionAnalysis(
  sourceVideoPath: string,
  explicitCaptionPath?: string,
): Promise<CaptionAnalysis | undefined> {
  const captionPath = await findCaptionSidecarPath(sourceVideoPath, explicitCaptionPath);
  if (!captionPath) {
    return undefined;
  }

  const content = await readFile(captionPath, 'utf8');
  const extension = path.extname(captionPath).toLowerCase();
  let cues: CaptionCue[];

  if (extension === '.srt' || extension === '.vtt') {
    cues = parseSrtOrVtt(content);
  } else if (extension === '.json') {
    cues = parseJsonCaptions(content);
  } else {
    cues = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
  }

  return {
    path: captionPath,
    text: cues.map((cue) => cue.text).join(' ').trim(),
    cues,
  };
}
