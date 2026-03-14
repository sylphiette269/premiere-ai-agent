import { execFile, type ExecFileOptions } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { validateFilePath } from './utils/security.js';

export interface AudioAnalysisResult {
  tempo: number;
  beats: number[];
  beat_count: number;
  duration: number;
  energy_peaks?: unknown[];
  segments?: unknown[];
  rms_envelope?: unknown;
  silence?: unknown[];
  spectral_features?: unknown;
  [key: string]: unknown;
}

export interface AnalyzeAudioTrackOptions {
  inputPath: string;
  method?: 'default' | 'onset' | 'plp';
  energyThreshold?: number;
  pythonExecutable?: string;
  scriptPath?: string;
  timeoutMs?: number;
  outputPath?: string;
  projectRoot?: string;
}

type ExecFileLike = typeof execFile;

interface AudioAnalysisDependencies {
  execFileFn?: ExecFileLike;
}

function normalizeExecOutput(value: string | NodeJS.ArrayBufferView | null | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value) {
    return '';
  }

  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
}

function runExecFile(
  execFileFn: ExecFileLike,
  command: string,
  args: string[],
  options: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFileFn(command, args, options, (error, stdout, stderr) => {
      const normalizedStdout = normalizeExecOutput(stdout);
      const normalizedStderr = normalizeExecOutput(stderr);
      if (error) {
        rejectPromise(
          new Error(
            `Audio analysis failed: ${error.message}${normalizedStderr ? ` | ${normalizedStderr}` : ''}`,
          ),
        );
        return;
      }

      resolvePromise({
        stdout: normalizedStdout,
        stderr: normalizedStderr,
      });
    });
  });
}

function parseEnergyThreshold(value: number | undefined): string {
  const numericValue = value ?? 0.6;
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Invalid energyThreshold: ${value}`);
  }
  return String(numericValue);
}

function resolveScriptPath(projectRoot: string): string {
  return resolve(projectRoot, 'python', 'analyze.py');
}

export async function analyzeAudioTrack(
  options: AnalyzeAudioTrackOptions,
  dependencies: AudioAnalysisDependencies = {},
): Promise<AudioAnalysisResult> {
  const pathValidation = validateFilePath(options.inputPath);
  if (!pathValidation.valid) {
    throw new Error(`Invalid input path: ${pathValidation.error}`);
  }

  const projectRoot = options.projectRoot ?? process.cwd();
  const execFileFn = dependencies.execFileFn ?? execFile;
  const pythonExecutable = options.pythonExecutable ?? 'python';
  const scriptPath = options.scriptPath ?? resolveScriptPath(projectRoot);
  const method = options.method ?? 'default';
  const energyThreshold = parseEnergyThreshold(options.energyThreshold);
  const tempDir = options.outputPath ? null : await mkdtemp(join(tmpdir(), 'premiere-mcp-audio-'));
  const outputPath = options.outputPath ?? join(tempDir as string, 'analysis.json');

  try {
    await runExecFile(
      execFileFn,
      pythonExecutable,
      [
        scriptPath,
        '--input',
        pathValidation.normalized ?? options.inputPath,
        '--output',
        outputPath,
        '--method',
        method,
        '--energy-threshold',
        energyThreshold,
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        timeout: options.timeoutMs ?? 30000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const payload = await readFile(outputPath, 'utf8');
    try {
      return JSON.parse(payload) as AudioAnalysisResult;
    } catch (error) {
      throw new Error(
        `Invalid audio analysis JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
