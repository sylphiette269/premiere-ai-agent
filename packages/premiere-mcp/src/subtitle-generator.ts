import { execFile } from 'node:child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { validateFilePath } from './utils/security.js';

export interface SubtitleEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export type SubtitleBackend = 'auto' | 'openai' | 'faster-whisper';

export interface GenerateSubtitlesOptions {
  audioPath: string;
  language?: string;
  apiKey?: string;
  outputSrtPath?: string;
  backend?: SubtitleBackend;
  fasterWhisperModel?: string;
  pythonBin?: string;
}

export interface GenerateSubtitlesResult {
  srtPath: string;
  entries: SubtitleEntry[];
  language: string;
  durationSec: number;
  backend: Exclude<SubtitleBackend, 'auto'>;
  warnings: string[];
}

type SubtitleSegment = {
  id?: number;
  start: number;
  end: number;
  text: string;
};

type SubtitlePayload = {
  language?: string;
  duration?: number;
  segments?: SubtitleSegment[];
};

type ValidatedInputPath = {
  normalizedPath: string;
  fileName: string;
};

const LOCAL_WHISPER_SCRIPT = join(
  process.cwd(),
  'python',
  'faster_whisper_transcribe.py',
);
const DEFAULT_FASTER_WHISPER_MODEL = 'medium';
const MAX_COMMAND_BUFFER = 10 * 1024 * 1024;

function secondsToSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function buildSrtContent(entries: SubtitleEntry[]): string {
  return entries.map((entry) =>
    `${entry.index}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}\n`
  ).join('\n');
}

function normalizeBackend(value: string | undefined): SubtitleBackend {
  if (value === 'openai' || value === 'faster-whisper' || value === 'auto') {
    return value;
  }

  return 'auto';
}

function validateInputPath(audioPath: string): ValidatedInputPath {
  const pathValidation = validateFilePath(audioPath);
  if (!pathValidation.valid) {
    throw new Error(`Invalid audio path: ${pathValidation.error}`);
  }

  const normalizedPath = pathValidation.normalized ?? audioPath;
  return {
    normalizedPath,
    fileName: basename(normalizedPath) || 'audio',
  };
}

function toEntries(segments: SubtitleSegment[]): SubtitleEntry[] {
  return segments.map((segment, index) => ({
    index: index + 1,
    startTime: secondsToSrtTime(segment.start),
    endTime: secondsToSrtTime(segment.end),
    text: segment.text.trim(),
  }));
}

function getSrtPath(outputSrtPath: string | undefined): string {
  return outputSrtPath ?? join(tmpdir(), `premiere-mcp-subtitles-${Date.now()}.srt`);
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        maxBuffer: MAX_COMMAND_BUFFER,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(error, {
              stdout: stdout ?? '',
              stderr: stderr ?? '',
            }),
          );
          return;
        }

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

function getPythonCandidates(explicitPythonBin?: string): Array<{ command: string; argsPrefix: string[] }> {
  const configured = explicitPythonBin?.trim() || process.env.PREMIERE_PYTHON_BIN?.trim();
  if (configured) {
    return [{ command: configured, argsPrefix: [] }];
  }

  if (process.platform === 'win32') {
    return [
      { command: 'python', argsPrefix: [] },
      { command: 'py', argsPrefix: ['-3'] },
    ];
  }

  return [
    { command: 'python3', argsPrefix: [] },
    { command: 'python', argsPrefix: [] },
  ];
}

function shouldTryNextPythonCandidate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'ENOENT'
    || /spawn .* ENOENT/i.test(message)
    || /not recognized/i.test(message);
}

function buildResultFromPayload(
  payload: SubtitlePayload,
  outputSrtPath: string | undefined,
  backend: Exclude<SubtitleBackend, 'auto'>,
  warnings: string[] = [],
): GenerateSubtitlesResult {
  const segments = payload.segments ?? [];
  const entries = toEntries(segments);
  const durationFromSegments = segments.length > 0
    ? Math.max(...segments.map((segment) => segment.end))
    : 0;

  return {
    srtPath: getSrtPath(outputSrtPath),
    entries,
    language: payload.language ?? 'unknown',
    durationSec: roundMetric(
      typeof payload.duration === 'number' && Number.isFinite(payload.duration)
        ? payload.duration
        : durationFromSegments,
    ),
    backend,
    warnings,
  };
}

async function writeSrtFile(result: GenerateSubtitlesResult): Promise<GenerateSubtitlesResult> {
  await fs.writeFile(result.srtPath, buildSrtContent(result.entries), 'utf8');
  return result;
}

async function generateSubtitlesWithOpenAi(
  inputPath: ValidatedInputPath,
  options: GenerateSubtitlesOptions,
  warnings: string[] = [],
): Promise<GenerateSubtitlesResult> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI subtitle backend.');
  }

  const audioBuffer = await fs.readFile(inputPath.normalizedPath);
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), inputPath.fileName);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  if (options.language) {
    formData.append('language', options.language);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    language: string;
    duration: number;
    segments: Array<{ id: number; start: number; end: number; text: string }>;
  };

  return await writeSrtFile(buildResultFromPayload(data, options.outputSrtPath, 'openai', warnings));
}

async function generateSubtitlesWithFasterWhisper(
  inputPath: ValidatedInputPath,
  options: GenerateSubtitlesOptions,
): Promise<GenerateSubtitlesResult> {
  const model = options.fasterWhisperModel
    ?? process.env.PREMIERE_FASTER_WHISPER_MODEL
    ?? DEFAULT_FASTER_WHISPER_MODEL;
  const scriptArgs = [
    LOCAL_WHISPER_SCRIPT,
    '--input',
    inputPath.normalizedPath,
    '--model',
    model,
  ];
  if (options.language) {
    scriptArgs.push('--language', options.language);
  }

  const candidates = getPythonCandidates(options.pythonBin);
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) {
      continue;
    }

    try {
      const result = await runCommand(candidate.command, [...candidate.argsPrefix, ...scriptArgs]);
      const payload = JSON.parse(result.stdout || '{}') as SubtitlePayload;
      return await writeSrtFile(
        buildResultFromPayload(payload, options.outputSrtPath, 'faster-whisper'),
      );
    } catch (error) {
      lastError = error;
      if (index < candidates.length - 1 && shouldTryNextPythonCandidate(error)) {
        continue;
      }
      break;
    }
  }

  const stderr = (lastError as { stderr?: string } | undefined)?.stderr?.trim();
  const stdout = (lastError as { stdout?: string } | undefined)?.stdout?.trim();
  const details = stderr || stdout || (lastError instanceof Error ? lastError.message : String(lastError));
  throw new Error(
    `faster-whisper backend failed: ${details}. Install local dependencies with "pip install -r python/requirements.txt".`,
  );
}

export async function generateSubtitles(
  options: GenerateSubtitlesOptions,
): Promise<GenerateSubtitlesResult> {
  const inputPath = validateInputPath(options.audioPath);
  const backend = normalizeBackend(
    options.backend ?? process.env.PREMIERE_SUBTITLE_BACKEND,
  );

  if (backend === 'openai') {
    return await generateSubtitlesWithOpenAi(inputPath, options);
  }

  if (backend === 'faster-whisper') {
    return await generateSubtitlesWithFasterWhisper(inputPath, options);
  }

  try {
    return await generateSubtitlesWithFasterWhisper(inputPath, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const warnings = [`faster-whisper backend unavailable: ${message}`];
    if (options.apiKey ?? process.env.OPENAI_API_KEY) {
      return await generateSubtitlesWithOpenAi(inputPath, options, warnings);
    }

    throw new Error(
      `${warnings[0]} Provide OPENAI_API_KEY for the OpenAI fallback or install the local faster-whisper runtime.`,
    );
  }
}
