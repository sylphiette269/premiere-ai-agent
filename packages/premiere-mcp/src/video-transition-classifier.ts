export interface TransitionSignalSample {
  timeSec: number;
  yAvg: number;
}

export interface BoundaryTransitionAnalysis {
  name: string;
  confidence: number;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSectionValues(samples: TransitionSignalSample[], section: "pre" | "mid" | "post"): number[] {
  if (samples.length === 0) {
    return [];
  }

  const sectionSize = Math.max(1, Math.floor(samples.length / 3));
  if (section === "pre") {
    return samples.slice(0, sectionSize).map((sample) => sample.yAvg);
  }
  if (section === "post") {
    return samples.slice(Math.max(0, samples.length - sectionSize)).map((sample) => sample.yAvg);
  }

  const midStart = Math.max(sectionSize, Math.floor((samples.length - sectionSize) / 2));
  return samples
    .slice(midStart, Math.min(samples.length, midStart + sectionSize))
    .map((sample) => sample.yAvg);
}

function getStepMetrics(samples: TransitionSignalSample[]) {
  const deltas = samples
    .slice(1)
    .map((sample, index) => sample.yAvg - (samples[index]?.yAvg ?? sample.yAvg));
  const absoluteDeltas = deltas.map((delta) => Math.abs(delta));
  const directions = deltas
    .map((delta) => (delta > 0 ? 1 : delta < 0 ? -1 : 0))
    .filter((direction) => direction !== 0);

  let directionChanges = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) {
      directionChanges += 1;
    }
  }

  return {
    maxStep: absoluteDeltas.length > 0 ? Math.max(...absoluteDeltas) : 0,
    directionChanges,
  };
}

function findHalfwayCrossing(samples: TransitionSignalSample[]): number | null {
  if (samples.length < 2) {
    return null;
  }

  const first = average(getSectionValues(samples, "pre"));
  const last = average(getSectionValues(samples, "post"));
  const midpoint = (first + last) / 2;
  const increasing = last >= first;

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]?.yAvg ?? midpoint;
    if ((increasing && value >= midpoint) || (!increasing && value <= midpoint)) {
      return index / Math.max(1, samples.length - 1);
    }
  }

  return null;
}

export function parseSignalStatsSamples(output: string): TransitionSignalSample[] {
  const samples: TransitionSignalSample[] = [];
  const lines = output.split(/\r?\n/);
  let currentTime: number | null = null;

  for (const line of lines) {
    const timeMatch = line.match(/pts_time[:=](\d+(?:\.\d+)?)/);
    if (timeMatch) {
      currentTime = Number.parseFloat(timeMatch[1] ?? "");
      continue;
    }

    const yAvgMatch = line.match(/lavfi\.signalstats\.YAVG=(\d+(?:\.\d+)?)/);
    if (yAvgMatch && currentTime !== null) {
      const yAvg = Number.parseFloat(yAvgMatch[1] ?? "");
      if (Number.isFinite(yAvg)) {
        samples.push({
          timeSec: currentTime,
          yAvg,
        });
      }
    }
  }

  return samples;
}

export function classifyTransitionBoundary(input: {
  fullSamples: TransitionSignalSample[];
  leftSamples?: TransitionSignalSample[];
  rightSamples?: TransitionSignalSample[];
}): BoundaryTransitionAnalysis {
  const fullSamples = input.fullSamples;
  if (fullSamples.length < 4) {
    return {
      name: "cut",
      confidence: 0.4,
    };
  }

  const pre = average(getSectionValues(fullSamples, "pre"));
  const mid = average(getSectionValues(fullSamples, "mid"));
  const post = average(getSectionValues(fullSamples, "post"));
  const yValues = fullSamples.map((sample) => sample.yAvg);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const totalRange = Math.max(0, maxY - minY);
  const { maxStep, directionChanges } = getStepMetrics(fullSamples);
  const stepRatio = totalRange > 0 ? maxStep / totalRange : 1;
  const edgeMinimum = Math.min(pre, post);
  const edgeMaximum = Math.max(pre, post);

  if (edgeMinimum >= 20 && mid <= Math.min(48, edgeMinimum * 0.45)) {
    return {
      name: "Dip to Black",
      confidence: 0.92,
    };
  }

  if (edgeMaximum <= 235 && mid >= Math.max(210, edgeMaximum * 1.12)) {
    return {
      name: "Dip to White",
      confidence: 0.88,
    };
  }

  const leftCrossing = input.leftSamples ? findHalfwayCrossing(input.leftSamples) : null;
  const rightCrossing = input.rightSamples ? findHalfwayCrossing(input.rightSamples) : null;
  if (leftCrossing !== null && rightCrossing !== null) {
    const crossingDelay = Math.abs(leftCrossing - rightCrossing);
    if (crossingDelay >= 0.22 && totalRange >= 10) {
      return {
        name: "Push",
        confidence: Math.min(0.9, Number((0.6 + crossingDelay / 2).toFixed(3))),
      };
    }
  }

  const midpointTarget = (pre + post) / 2;
  const midpointDelta = Math.abs(mid - midpointTarget);
  if (
    totalRange >= 12 &&
    stepRatio <= 0.55 &&
    directionChanges <= 1 &&
    midpointDelta <= Math.max(8, totalRange * 0.2)
  ) {
    return {
      name: "Cross Dissolve",
      confidence: Math.max(0.72, Number((1 - stepRatio / 2).toFixed(3))),
    };
  }

  return {
    name: "cut",
    confidence: stepRatio >= 0.75 ? 0.9 : 0.6,
  };
}
