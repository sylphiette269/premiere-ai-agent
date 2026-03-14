import {
  compareResultToBlueprint,
  criticEditResult,
} from '../../tools/catalog/critic-tools.js';

describe('criticEditResult', () => {
  it('fails on an empty timeline', () => {
    const result = criticEditResult({
      goal: '做一个视频',
      scenario: 'natural_language',
      timelineData: {
        totalDuration: 0,
        videoClips: [],
        audioClips: [],
        transitions: [],
        effects: [],
        textLayers: [],
      },
    });

    expect(result.critic.passed).toBe(false);
    expect(result.critic.score).toBe(0);
  });

  it('fails viral_style when cross dissolve dominates', () => {
    const result = criticEditResult({
      goal: '做一个爆款短视频',
      scenario: 'viral_style',
      timelineData: {
        totalDuration: 30,
        videoClips: [
          { id: '1', duration: 5, trackIndex: 0, startTime: 0, endTime: 5 },
          { id: '2', duration: 5, trackIndex: 0, startTime: 5, endTime: 10 },
          { id: '3', duration: 5, trackIndex: 0, startTime: 10, endTime: 15 },
          { id: '4', duration: 5, trackIndex: 0, startTime: 15, endTime: 20 },
          { id: '5', duration: 5, trackIndex: 0, startTime: 20, endTime: 25 },
          { id: '6', duration: 5, trackIndex: 0, startTime: 25, endTime: 30 },
        ],
        audioClips: [
          { id: 'a1', duration: 30, trackIndex: 0, startTime: 0, endTime: 30 },
        ],
        transitions: [
          { type: 'Cross Dissolve', duration: 1, position: 5 },
          { type: 'Cross Dissolve', duration: 1, position: 10 },
          { type: 'Cross Dissolve', duration: 1, position: 15 },
          { type: 'Cross Dissolve', duration: 1, position: 20 },
          { type: 'Cross Dissolve', duration: 1, position: 25 },
        ],
        effects: [],
        textLayers: [],
      },
    });

    expect(result.critic.passed).toBe(false);
    expect(
      result.critic.findings.some((entry) => entry.includes('Cross dissolve')),
    ).toBe(true);
    expect(
      result.critic.findings.some((entry) => entry.includes('镜头平均时长')),
    ).toBe(true);
  });

  it('passes a reasonable fast-paced viral edit', () => {
    const result = criticEditResult({
      goal: '做快节奏产品视频',
      scenario: 'viral_style',
      timelineData: {
        totalDuration: 30,
        videoClips: [
          { id: '1', duration: 1.2, trackIndex: 0, startTime: 0, endTime: 1.2 },
          { id: '2', duration: 0.8, trackIndex: 0, startTime: 1.2, endTime: 2.0 },
          { id: '3', duration: 1.5, trackIndex: 0, startTime: 2.0, endTime: 3.5 },
          { id: '4', duration: 2.0, trackIndex: 0, startTime: 3.5, endTime: 5.5 },
          { id: '5', duration: 1.0, trackIndex: 0, startTime: 5.5, endTime: 6.5 },
          { id: '6', duration: 0.6, trackIndex: 0, startTime: 6.5, endTime: 7.1 },
          { id: '7', duration: 0.5, trackIndex: 0, startTime: 7.1, endTime: 7.6 },
          { id: '8', duration: 0.7, trackIndex: 0, startTime: 7.6, endTime: 8.3 },
        ],
        audioClips: [
          { id: 'a1', duration: 30, trackIndex: 0, startTime: 0, endTime: 30 },
        ],
        transitions: [
          { type: 'Hard Cut', duration: 0, position: 1.2 },
          { type: 'Zoom Cut', duration: 0.3, position: 3.5 },
          { type: 'Hard Cut', duration: 0, position: 5.5 },
          { type: 'Cross Dissolve', duration: 0.5, position: 7.1 },
          { type: 'Whip', duration: 0.2, position: 7.6 },
        ],
        effects: [],
        textLayers: [
          { text: '惊人效果！', startTime: 0.5, duration: 2 },
        ],
      },
    });

    expect(result.critic.passed).toBe(true);
    expect(result.critic.score).toBeGreaterThan(60);
    expect(result.critic.actionableFixes).toBeDefined();
  });

  it('fails when timeline data is missing', () => {
    const result = criticEditResult({
      goal: '做视频',
      scenario: 'natural_language',
    });

    expect(result.critic.passed).toBe(false);
    expect(result.critic.score).toBe(0);
    expect(result.critic.findings.length).toBeGreaterThan(0);
  });
});

describe('compareResultToBlueprint', () => {
  it('returns a high adherence score for a close match', () => {
    const result = compareResultToBlueprint(
      {
        totalDuration: 30,
        videoClips: Array.from({ length: 20 }, (_, index) => ({
          id: `c${index}`,
          duration: 1.2,
          trackIndex: 0,
          startTime: index * 1.5,
          endTime: index * 1.5 + 1.2,
        })),
        audioClips: [],
        transitions: [
          { type: 'hard_cut', duration: 0, position: 3 },
          { type: 'zoom_cut', duration: 0.3, position: 6 },
        ],
        effects: [],
        textLayers: [],
      },
      {
        hookStyle: 'question',
        averageShotDuration: 1.2,
        pacingCurve: 'fast',
        transitionPattern: ['hard_cut', 'zoom_cut'],
        textOverlayStyle: 'centered',
        musicBeatStrategy: 'cut-on-beat',
        ctaPattern: 'end-screen',
        avoidPatterns: ['cross dissolve'],
        referenceCount: 5,
        targetDurationRange: [25, 35],
      },
    );

    expect(result.comparison.adherenceScore).toBeGreaterThan(70);
    expect(result.comparison.deviations.length).toBeLessThanOrEqual(1);
  });

  it('returns a low adherence score for a poor match', () => {
    const result = compareResultToBlueprint(
      {
        totalDuration: 120,
        videoClips: [
          { id: 'c1', duration: 30, trackIndex: 0, startTime: 0, endTime: 30 },
          { id: 'c2', duration: 30, trackIndex: 0, startTime: 30, endTime: 60 },
        ],
        audioClips: [],
        transitions: [
          { type: 'Cross Dissolve', duration: 2, position: 30 },
        ],
        effects: [],
        textLayers: [],
      },
      {
        hookStyle: 'question',
        averageShotDuration: 1.2,
        pacingCurve: 'fast',
        transitionPattern: ['hard_cut', 'zoom_cut'],
        textOverlayStyle: 'centered',
        musicBeatStrategy: 'cut-on-beat',
        ctaPattern: 'end-screen',
        avoidPatterns: ['cross dissolve'],
        referenceCount: 5,
        targetDurationRange: [25, 35],
      },
    );

    expect(result.comparison.adherenceScore).toBeLessThan(50);
    expect(result.comparison.deviations.length).toBeGreaterThan(2);
  });
});
