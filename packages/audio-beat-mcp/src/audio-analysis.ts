import { execFile, type ExecFileOptions } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type {
  AnalysisSensitivity,
  BeatMethod,
  EnergyPeak,
  MusicBeatAnalysis,
} from './types.js';

export interface AnalyzeMusicBeatsOptions {
  audioPath: string;
  method?: BeatMethod;
  sensitivity?: AnalysisSensitivity;
  minGapSec?: number;
  timeoutMs?: number;
  pythonExecutable?: string;
  scriptPath?: string;
  projectRoot?: string;
}

type ExecFileLike = typeof execFile;

interface AnalyzeMusicBeatsDependencies {
  execFileFn?: ExecFileLike;
}

interface SensitivityConfig {
  energyThreshold: number;
  minGapSec: number;
  onsetStrengthFloor: number;
}

const SENSITIVITY_CONFIG: Record<AnalysisSensitivity, SensitivityConfig> = {
  low: {
    energyThreshold: 0.78,
    minGapSec: 0.18,
    onsetStrengthFloor: 0.82,
  },
  medium: {
    energyThreshold: 0.6,
    minGapSec: 0.12,
    onsetStrengthFloor: 0.68,
  },
  high: {
    energyThreshold: 0.45,
    minGapSec: 0.08,
    onsetStrengthFloor: 0.52,
  },
};

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
            `Audio analyzer failed: ${error.message}${normalizedStderr ? ` | ${normalizedStderr}` : ''}`,
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

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeTimes(values: unknown, minGapSec: number): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => roundTime(value))
    .sort((left, right) => left - right);

  const filtered: number[] = [];
  for (const time of sorted) {
    if (filtered.length === 0 || time - filtered[filtered.length - 1]! >= minGapSec) {
      filtered.push(time);
    }
  }

  return filtered;
}

function normalizeEnergyPeaks(value: unknown): EnergyPeak[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      time: Number(item.time),
      strength: Number(item.strength),
    }))
    .filter((item) => Number.isFinite(item.time) && item.time >= 0 && Number.isFinite(item.strength))
    .map((item) => ({
      time: roundTime(item.time),
      strength: Number(item.strength.toFixed(6)),
    }))
    .sort((left, right) => left.time - right.time);
}

function resolveSensitivityConfig(
  sensitivity: AnalysisSensitivity,
  minGapSec?: number,
): SensitivityConfig {
  const config = SENSITIVITY_CONFIG[sensitivity];
  return {
    ...config,
    minGapSec: minGapSec ?? config.minGapSec,
  };
}

function resolveScriptPath(projectRoot: string): string {
  return resolve(projectRoot, '..', 'premiere-mcp', 'python', 'analyze.py');
}

export async function analyzeMusicBeats(
  options: AnalyzeMusicBeatsOptions,
  dependencies: AnalyzeMusicBeatsDependencies = {},
): Promise<MusicBeatAnalysis> {
  const method = options.method ?? 'default';
  const sensitivity = options.sensitivity ?? 'medium';
  const config = resolveSensitivityConfig(sensitivity, options.minGapSec);
  const projectRoot = options.projectRoot ?? process.cwd();
  const pythonExecutable =
    options.pythonExecutable ?? process.env.AUDIO_BEAT_MCP_PYTHON ?? 'python';
  const scriptPath =
    options.scriptPath ??
    process.env.AUDIO_BEAT_MCP_ANALYZE_SCRIPT ??
    resolveScriptPath(projectRoot);
  const execFileFn = dependencies.execFileFn ?? execFile;

  await access(options.audioPath);
  await access(scriptPath);

  const tempDir = await mkdtemp(join(tmpdir(), 'audio-beat-mcp-'));
  const outputPath = join(tempDir, 'analysis.json');

  try {
    await runExecFile(
      execFileFn,
      pythonExecutable,
      [
        scriptPath,
        '--input',
        options.audioPath,
        '--output',
        outputPath,
        '--method',
        method,
        '--energy-threshold',
        String(config.energyThreshold),
      ],
      {
        cwd: projectRoot,
        windowsHide: true,
        timeout: options.timeoutMs ?? 30000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const rawPayload = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
    const energyPeaks = normalizeEnergyPeaks(rawPayload.energy_peaks);
    const beatTimes = normalizeTimes(rawPayload.beats, config.minGapSec);
    const onsetTimes = normalizeTimes(
      energyPeaks
        .filter((peak) => peak.strength >= config.onsetStrengthFloor)
        .map((peak) => peak.time),
      config.minGapSec,
    );
    const tempo = Number(rawPayload.tempo);
    const duration = Number(rawPayload.duration);

    return {
      sourceAudioPath: resolve(options.audioPath),
      duration: Number.isFinite(duration) && duration >= 0 ? roundTime(duration) : 0,
      tempo: Number.isFinite(tempo) && tempo >= 0 ? Number(tempo.toFixed(3)) : 0,
      bpm: Number.isFinite(tempo) && tempo >= 0 ? Number(tempo.toFixed(3)) : 0,
      beatTimes,
      beatCount: beatTimes.length,
      onsetTimes,
      onsetCount: onsetTimes.length,
      energyPeaks,
      method,
      sensitivity,
      minGapSec: config.minGapSec,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
