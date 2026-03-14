import { execFile } from "node:child_process";
import {
  type BoundaryTransitionAnalysis,
  classifyTransitionBoundary,
  parseSignalStatsSamples,
} from "./video-transition-classifier.js";

export interface TextOverlay {
  text: string;
  startSec: number;
  endSec: number;
  confidence: number;
}

export interface KeyframeDescriptor {
  index: number;
  timeSec: number;
  score: number;
}

export interface QualityMetricSample {
  timeSec: number;
  brightness: number;
  saturation: number;
  sharpness: number;
}

export interface VideoQualityMetrics {
  sampleCount: number;
  averageBrightness: number;
  averageSaturation: number;
  averageSharpness: number;
  brightnessLevel: string;
  saturationLevel: string;
  sharpnessLevel: string;
  samples: QualityMetricSample[];
}

export interface ShotDescriptor {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  transitionIn: string | null;
  transitionOut: string | null;
  dominantColor: string;
  motionAmount: string;
  hasText: boolean;
  shotType: string;
}

export interface PacingProfile {
  avgShotDurationSec: number;
  minShotDurationSec: number;
  maxShotDurationSec: number;
  cutRate: number;
  rhythmPattern: string;
}

export interface ColorProfile {
  warmth: string;
  saturation: string;
  brightness: string;
}

export interface AudioProfile {
  hasMusic: boolean;
  hasVoiceover: boolean;
  hasNaturalSound: boolean;
  estimatedTempo?: string;
}

export interface VideoBlueprint {
  sourcePath: string;
  totalDuration: number;
  estimatedFrameRate: number;
  shots: ShotDescriptor[];
  pacing: PacingProfile;
  dominantTransitions: string[];
  colorProfile: ColorProfile;
  motionStyle: string;
  audioProfile: AudioProfile;
  textOverlays: TextOverlay[];
  keyframes?: KeyframeDescriptor[];
  qualityMetrics?: VideoQualityMetrics;
}

interface FfprobeStream {
  codec_type?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
}

interface FfprobePayload {
  format?: {
    duration?: string;
  };
  streams?: FfprobeStream[];
}

interface QualitySignalSample {
  timeSec: number;
  brightness: number;
  saturation: number;
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
  });
}

function parseNumeric(value: string | number | undefined | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parts = value.split("/");
  if (parts.length === 2) {
    const numerator = parseNumeric(parts[0]);
    const denominator = parseNumeric(parts[1]);
    if (
      numerator !== null &&
      denominator !== null &&
      denominator !== 0
    ) {
      return numerator / denominator;
    }
  }

  return parseNumeric(value);
}

function clampSceneTimes(sceneTimes: number[], totalDuration: number): number[] {
  const ordered = Array.from(new Set(sceneTimes.filter((value) =>
    Number.isFinite(value) &&
    value > 0 &&
    (totalDuration <= 0 || value < totalDuration)
  )));
  ordered.sort((left, right) => left - right);
  return ordered;
}

function extractSceneTimes(output: string): number[] {
  const sceneTimes: number[] = [];
  const pattern = /pts_time[:=](\d+(?:\.\d+)?)/g;
  let match = pattern.exec(output);
  while (match) {
    const parsed = parseNumeric(match[1]);
    if (parsed !== null) {
      sceneTimes.push(parsed);
    }
    match = pattern.exec(output);
  }
  return sceneTimes;
}

function extractSceneScores(output: string): number[] {
  const scores: number[] = [];
  const pattern = /lavfi\.scene_score=(\d+(?:\.\d+)?)/g;
  let match = pattern.exec(output);
  while (match) {
    const parsed = parseNumeric(match[1]);
    if (parsed !== null) {
      scores.push(roundMetric(parsed));
    }
    match = pattern.exec(output);
  }
  return scores;
}

function normalizeKeyframes(
  detections: KeyframeDescriptor[],
  totalDuration: number,
): KeyframeDescriptor[] {
  const deduped = new Map<string, KeyframeDescriptor>();
  for (const detection of detections) {
    if (
      !Number.isFinite(detection.timeSec) ||
      detection.timeSec <= 0 ||
      (totalDuration > 0 && detection.timeSec >= totalDuration)
    ) {
      continue;
    }

    const key = detection.timeSec.toFixed(3);
    const existing = deduped.get(key);
    if (!existing || detection.score > existing.score) {
      deduped.set(key, {
        index: 0,
        timeSec: roundMetric(detection.timeSec),
        score: roundMetric(detection.score),
      });
    }
  }

  return [...deduped.values()]
    .sort((left, right) => left.timeSec - right.timeSec)
    .map((detection, index) => ({
      index,
      timeSec: detection.timeSec,
      score: detection.score,
    }));
}

function extractSceneDetections(output: string, totalDuration: number): KeyframeDescriptor[] {
  const times = extractSceneTimes(output);
  const scores = extractSceneScores(output);
  return normalizeKeyframes(
    times.map((timeSec, index) => ({
      index,
      timeSec,
      score: scores[index] ?? 0,
    })),
    totalDuration,
  );
}

function inferMotionAmount(durationSec: number): string {
  if (durationSec <= 2.5) {
    return "high";
  }
  if (durationSec <= 5) {
    return "medium";
  }
  return "low";
}

function inferMotionStyle(avgShotDurationSec: number): string {
  if (avgShotDurationSec <= 2.5) {
    return "fast";
  }
  if (avgShotDurationSec >= 5.5) {
    return "slow";
  }
  return "mixed";
}

function inferRhythmPattern(durations: number[]): string {
  if (durations.length <= 1) {
    return "uniform";
  }

  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);
  if (Math.abs(maxDuration - minDuration) <= 0.25) {
    return "uniform";
  }

  const first = durations[0] ?? 0;
  const last = durations[durations.length - 1] ?? 0;
  if (first > 0 && first >= last * 1.25) {
    return "building";
  }

  return "irregular";
}

function buildPacingProfile(shots: ShotDescriptor[], totalDuration: number): PacingProfile {
  const durations = shots.map((shot) => shot.durationSec);
  const safeTotalDuration = totalDuration > 0
    ? totalDuration
    : durations.reduce((sum, duration) => sum + duration, 0);
  const avgShotDurationSec = durations.length > 0
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : 0;

  return {
    avgShotDurationSec,
    minShotDurationSec: durations.length > 0 ? Math.min(...durations) : 0,
    maxShotDurationSec: durations.length > 0 ? Math.max(...durations) : 0,
    cutRate: safeTotalDuration > 0 ? shots.length / safeTotalDuration : shots.length,
    rhythmPattern: inferRhythmPattern(durations),
  };
}

function buildShots(
  totalDuration: number,
  sceneTimes: number[],
  boundaryTransitions: BoundaryTransitionAnalysis[] = [],
): ShotDescriptor[] {
  if (totalDuration <= 0) {
    return [
      {
        index: 0,
        startSec: 0,
        endSec: 0,
        durationSec: 0,
        transitionIn: null,
        transitionOut: null,
        dominantColor: "neutral",
        motionAmount: "medium",
        hasText: false,
        shotType: "unknown",
      },
    ];
  }

  const boundaries = [0, ...clampSceneTimes(sceneTimes, totalDuration), totalDuration];
  const shots: ShotDescriptor[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startSec = boundaries[index] ?? 0;
    const endSec = boundaries[index + 1] ?? startSec;
    const durationSec = Math.max(0, endSec - startSec);
    const incomingTransition = index === 0 ? null : boundaryTransitions[index - 1]?.name ?? "cut";
    const outgoingTransition = index === boundaries.length - 2 ? null : boundaryTransitions[index]?.name ?? "cut";
    shots.push({
      index,
      startSec,
      endSec,
      durationSec,
      transitionIn: incomingTransition,
      transitionOut: outgoingTransition,
      dominantColor: "neutral",
      motionAmount: inferMotionAmount(durationSec),
      hasText: false,
      shotType: "unknown",
    });
  }

  return shots;
}

const TRANSITION_ANALYSIS_WINDOW_SEC = 0.45;

async function sampleBoundarySignals(
  videoPath: string,
  boundarySec: number,
  totalDuration: number,
  region: "full" | "left" | "right",
): Promise<string> {
  const startSec = Math.max(0, boundarySec - TRANSITION_ANALYSIS_WINDOW_SEC);
  const endSec = totalDuration > 0
    ? Math.min(totalDuration, boundarySec + TRANSITION_ANALYSIS_WINDOW_SEC)
    : boundarySec + TRANSITION_ANALYSIS_WINDOW_SEC;
  const durationSec = Math.max(0.15, endSec - startSec);
  const filter = region === "left"
    ? "crop=iw/3:ih:0:0,signalstats,metadata=print:file=-"
    : region === "right"
      ? "crop=iw/3:ih:2*iw/3:0,signalstats,metadata=print:file=-"
      : "signalstats,metadata=print:file=-";
  const result = await runCommand("ffmpeg", [
    "-v",
    "error",
    "-ss",
    startSec.toFixed(3),
    "-t",
    durationSec.toFixed(3),
    "-i",
    videoPath,
    "-vf",
    filter,
    "-an",
    "-f",
    "null",
    "-",
  ]);
  return `${result.stdout}\n${result.stderr}`;
}

async function analyzeBoundaryTransitions(
  videoPath: string,
  totalDuration: number,
  sceneTimes: number[],
): Promise<BoundaryTransitionAnalysis[]> {
  const boundaries = clampSceneTimes(sceneTimes, totalDuration);
  const analyses: BoundaryTransitionAnalysis[] = [];

  for (const boundarySec of boundaries) {
    try {
      const [fullOutput, leftOutput, rightOutput] = await Promise.all([
        sampleBoundarySignals(videoPath, boundarySec, totalDuration, "full"),
        sampleBoundarySignals(videoPath, boundarySec, totalDuration, "left"),
        sampleBoundarySignals(videoPath, boundarySec, totalDuration, "right"),
      ]);
      analyses.push(
        classifyTransitionBoundary({
          fullSamples: parseSignalStatsSamples(fullOutput),
          leftSamples: parseSignalStatsSamples(leftOutput),
          rightSamples: parseSignalStatsSamples(rightOutput),
        }),
      );
    } catch {
      analyses.push({
        name: "cut",
        confidence: 0.4,
      });
    }
  }

  return analyses;
}

function buildDominantTransitions(boundaryTransitions: BoundaryTransitionAnalysis[]): string[] {
  if (boundaryTransitions.length === 0) {
    return [];
  }

  const namedCounts = new Map<string, number>();
  for (const transition of boundaryTransitions) {
    if (transition.name !== "cut") {
      namedCounts.set(transition.name, (namedCounts.get(transition.name) ?? 0) + 1);
    }
  }

  if (namedCounts.size === 0) {
    return ["cut"];
  }

  const sortedNamed = [...namedCounts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  const [dominantName, dominantCount] = sortedNamed[0] ?? [];
  if (!dominantName || dominantCount === undefined) {
    return ["cut"];
  }

  return dominantCount > boundaryTransitions.length / 2
    ? [dominantName]
    : ["cut"];
}

function createEmptyQualityMetrics(): VideoQualityMetrics {
  return {
    sampleCount: 0,
    averageBrightness: 0,
    averageSaturation: 0,
    averageSharpness: 0,
    brightnessLevel: "unknown",
    saturationLevel: "unknown",
    sharpnessLevel: "unknown",
    samples: [],
  };
}

function makeTimeKey(timeSec: number): string {
  return roundMetric(timeSec).toFixed(3);
}

function parseQualitySignalSamples(output: string): QualitySignalSample[] {
  const samples = new Map<string, QualitySignalSample>();
  const lines = output.split(/\r?\n/);
  let currentTime: number | null = null;

  for (const line of lines) {
    const timeMatch = line.match(/pts_time[:=](\d+(?:\.\d+)?)/);
    if (timeMatch) {
      currentTime = Number.parseFloat(timeMatch[1] ?? "");
      const key = currentTime.toFixed(3);
      if (Number.isFinite(currentTime) && !samples.has(key)) {
        samples.set(key, {
          timeSec: roundMetric(currentTime),
          brightness: 0,
          saturation: 0,
        });
      }
      continue;
    }

    if (currentTime === null) {
      continue;
    }

    const key = currentTime.toFixed(3);
    const sample = samples.get(key);
    if (!sample) {
      continue;
    }

    const brightnessMatch = line.match(/lavfi\.signalstats\.YAVG=(\d+(?:\.\d+)?)/);
    if (brightnessMatch) {
      sample.brightness = roundMetric(Number.parseFloat(brightnessMatch[1] ?? "0"));
      continue;
    }

    const saturationMatch = line.match(/lavfi\.signalstats\.SATAVG=(\d+(?:\.\d+)?)/);
    if (saturationMatch) {
      sample.saturation = roundMetric(Number.parseFloat(saturationMatch[1] ?? "0"));
    }
  }

  return [...samples.values()].sort((left, right) => left.timeSec - right.timeSec);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function describeBrightness(value: number): string {
  if (value <= 0) {
    return "unknown";
  }
  if (value < 70) {
    return "low";
  }
  if (value < 170) {
    return "medium";
  }
  return "high";
}

function describeSaturation(value: number): string {
  if (value <= 0) {
    return "unknown";
  }
  if (value < 40) {
    return "low";
  }
  if (value < 120) {
    return "medium";
  }
  return "high";
}

function describeSharpness(value: number): string {
  if (value <= 0) {
    return "unknown";
  }
  if (value < 20) {
    return "soft";
  }
  if (value < 60) {
    return "balanced";
  }
  return "sharp";
}

function mergeQualitySamples(
  qualitySamples: QualitySignalSample[],
  sharpnessSamples: Array<{ timeSec: number; yAvg: number }>,
): QualityMetricSample[] {
  const sharpnessLookup = new Map<string, number>();
  for (const sample of sharpnessSamples) {
    sharpnessLookup.set(makeTimeKey(sample.timeSec), roundMetric(sample.yAvg));
  }

  return qualitySamples.map((sample, index) => ({
    timeSec: sample.timeSec,
    brightness: roundMetric(sample.brightness),
    saturation: roundMetric(sample.saturation),
    sharpness: sharpnessLookup.get(makeTimeKey(sample.timeSec))
      ?? roundMetric(sharpnessSamples[index]?.yAvg ?? 0),
  }));
}

function buildQualityMetrics(samples: QualityMetricSample[]): VideoQualityMetrics {
  if (samples.length === 0) {
    return createEmptyQualityMetrics();
  }

  const brightnessValues = samples.map((sample) => sample.brightness);
  const saturationValues = samples.map((sample) => sample.saturation);
  const sharpnessValues = samples.map((sample) => sample.sharpness);
  const averageBrightness = roundMetric(average(brightnessValues));
  const averageSaturation = roundMetric(average(saturationValues));
  const averageSharpness = roundMetric(average(sharpnessValues));

  return {
    sampleCount: samples.length,
    averageBrightness,
    averageSaturation,
    averageSharpness,
    brightnessLevel: describeBrightness(averageBrightness),
    saturationLevel: describeSaturation(averageSaturation),
    sharpnessLevel: describeSharpness(averageSharpness),
    samples,
  };
}

function buildSamplingFilter(totalDuration: number): string {
  if (!(totalDuration > 0)) {
    return "signalstats,metadata=print:file=-";
  }

  const sampleCount = Math.max(3, Math.min(24, Math.round(totalDuration / 2)));
  const sampleRate = Math.max(0.2, sampleCount / totalDuration);
  return `fps=${sampleRate.toFixed(6)},signalstats,metadata=print:file=-`;
}

function buildSharpnessFilter(totalDuration: number): string {
  if (!(totalDuration > 0)) {
    return "format=gray,edgedetect=low=0.08:high=0.2,signalstats,metadata=print:file=-";
  }

  const sampleCount = Math.max(3, Math.min(24, Math.round(totalDuration / 2)));
  const sampleRate = Math.max(0.2, sampleCount / totalDuration);
  return `fps=${sampleRate.toFixed(6)},format=gray,edgedetect=low=0.08:high=0.2,signalstats,metadata=print:file=-`;
}

async function analyzeQualityMetrics(
  videoPath: string,
  totalDuration: number,
): Promise<VideoQualityMetrics> {
  try {
    const qualityOutput = await runCommand("ffmpeg", [
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      buildSamplingFilter(totalDuration),
      "-an",
      "-f",
      "null",
      "-",
    ]);
    const qualitySamples = parseQualitySignalSamples(`${qualityOutput.stdout}\n${qualityOutput.stderr}`);
    if (qualitySamples.length === 0) {
      return createEmptyQualityMetrics();
    }

    let sharpnessSamples: Array<{ timeSec: number; yAvg: number }> = [];
    try {
      const sharpnessOutput = await runCommand("ffmpeg", [
        "-v",
        "error",
        "-i",
        videoPath,
        "-vf",
        buildSharpnessFilter(totalDuration),
        "-an",
        "-f",
        "null",
        "-",
      ]);
      sharpnessSamples = parseSignalStatsSamples(`${sharpnessOutput.stdout}\n${sharpnessOutput.stderr}`);
    } catch {
      sharpnessSamples = [];
    }

    return buildQualityMetrics(mergeQualitySamples(qualitySamples, sharpnessSamples));
  } catch {
    return createEmptyQualityMetrics();
  }
}

function createMinimalBlueprint(videoPath: string): VideoBlueprint {
  const shots = buildShots(0, [], []);
  return {
    sourcePath: videoPath,
    totalDuration: 0,
    estimatedFrameRate: 30,
    shots,
    pacing: buildPacingProfile(shots, 0),
    dominantTransitions: [],
    colorProfile: {
      warmth: "neutral",
      saturation: "medium",
      brightness: "medium",
    },
    motionStyle: "mixed",
    audioProfile: {
      hasMusic: false,
      hasVoiceover: false,
      hasNaturalSound: false,
    },
    textOverlays: [],
    keyframes: [],
    qualityMetrics: createEmptyQualityMetrics(),
  };
}

export async function analyzeVideoReference(videoPath: string): Promise<VideoBlueprint> {
  try {
    const ffprobeResult = await runCommand("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ]);
    const payload = JSON.parse(ffprobeResult.stdout || "{}") as FfprobePayload;
    const streams = payload.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === "video");
    const audioStream = streams.find((stream) => stream.codec_type === "audio");
    const totalDuration =
      parseNumeric(payload.format?.duration) ??
      parseNumeric(videoStream?.duration) ??
      0;
    const estimatedFrameRate =
      parseFrameRate(videoStream?.avg_frame_rate) ??
      parseFrameRate(videoStream?.r_frame_rate) ??
      30;

    let keyframes: KeyframeDescriptor[] = [];
    try {
      const ffmpegResult = await runCommand("ffmpeg", [
        "-i",
        videoPath,
        "-vf",
        "select='gt(scene,0.3)',metadata=print:file=-,showinfo",
        "-f",
        "null",
        "-",
      ]);
      keyframes = extractSceneDetections(
        `${ffmpegResult.stdout}\n${ffmpegResult.stderr}`,
        totalDuration,
      );
    } catch {
      keyframes = [];
    }

    const sceneTimes = keyframes.map((keyframe) => keyframe.timeSec);
    const boundaryTransitions = await analyzeBoundaryTransitions(videoPath, totalDuration, sceneTimes);
    const shots = buildShots(totalDuration, sceneTimes, boundaryTransitions);
    const pacing = buildPacingProfile(shots, totalDuration);
    const qualityMetrics = await analyzeQualityMetrics(videoPath, totalDuration);
    const saturationLevel = qualityMetrics.saturationLevel !== "unknown"
      ? qualityMetrics.saturationLevel
      : "medium";
    const brightnessLevel = qualityMetrics.brightnessLevel !== "unknown"
      ? qualityMetrics.brightnessLevel
      : "medium";

    return {
      sourcePath: videoPath,
      totalDuration,
      estimatedFrameRate,
      shots,
      pacing,
      dominantTransitions: buildDominantTransitions(boundaryTransitions),
      colorProfile: {
        warmth: "neutral",
        saturation: saturationLevel,
        brightness: brightnessLevel,
      },
      motionStyle: inferMotionStyle(pacing.avgShotDurationSec),
      audioProfile: {
        hasMusic: false,
        hasVoiceover: false,
        hasNaturalSound: Boolean(audioStream),
      },
      textOverlays: [],
      keyframes,
      qualityMetrics,
    };
  } catch {
    return createMinimalBlueprint(videoPath);
  }
}
