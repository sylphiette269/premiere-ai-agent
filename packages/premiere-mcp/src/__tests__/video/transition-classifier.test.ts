import {
  classifyTransitionBoundary,
  parseSignalStatsSamples,
} from '../../video-transition-classifier.js';

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

describe('video-transition-classifier', () => {
  it('parses signalstats frame samples from ffmpeg output', () => {
    const samples = parseSignalStatsSamples(
      createSignalStatsOutput([42, 56.5, 81]),
    );

    expect(samples).toEqual([
      { timeSec: 0, yAvg: 42 },
      { timeSec: 0.08, yAvg: 56.5 },
      { timeSec: 0.16, yAvg: 81 },
    ]);
  });

  it('classifies gradual luminance blending as Cross Dissolve', () => {
    const result = classifyTransitionBoundary({
      fullSamples: parseSignalStatsSamples(
        createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      ),
      leftSamples: parseSignalStatsSamples(
        createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      ),
      rightSamples: parseSignalStatsSamples(
        createSignalStatsOutput([38, 49, 60, 71, 82, 93]),
      ),
    });

    expect(result.name).toBe('Cross Dissolve');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('classifies a deep mid-boundary luminance drop as Dip to Black', () => {
    const result = classifyTransitionBoundary({
      fullSamples: parseSignalStatsSamples(
        createSignalStatsOutput([124, 118, 36, 14, 42, 129]),
      ),
      leftSamples: parseSignalStatsSamples(
        createSignalStatsOutput([124, 118, 34, 13, 39, 128]),
      ),
      rightSamples: parseSignalStatsSamples(
        createSignalStatsOutput([125, 119, 37, 14, 44, 130]),
      ),
    });

    expect(result.name).toBe('Dip to Black');
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it('classifies staggered left-right changes as Push', () => {
    const result = classifyTransitionBoundary({
      fullSamples: parseSignalStatsSamples(
        createSignalStatsOutput([72, 74, 79, 88, 96, 104]),
      ),
      leftSamples: parseSignalStatsSamples(
        createSignalStatsOutput([72, 90, 103, 108, 110, 112]),
      ),
      rightSamples: parseSignalStatsSamples(
        createSignalStatsOutput([72, 74, 76, 79, 92, 108]),
      ),
    });

    expect(result.name).toBe('Push');
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  it('falls back to cut for abrupt unresolved changes', () => {
    const result = classifyTransitionBoundary({
      fullSamples: parseSignalStatsSamples(
        createSignalStatsOutput([41, 42, 43, 181, 182, 183]),
      ),
    });

    expect(result.name).toBe('cut');
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
