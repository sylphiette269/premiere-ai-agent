import { buildBeatSyncPlan } from '../../beat-sync-engine.js';

describe('buildBeatSyncPlan', () => {
  it('creates an every-beat sequential placement plan', () => {
    const plan = buildBeatSyncPlan({
      clips: [{ clipId: 'clip-a' }, { clipId: 'clip-b' }, { clipId: 'clip-c' }],
      beats: [0, 0.5, 1.0, 1.5],
      strategy: 'every_beat',
      mode: 'sequential',
    });

    expect(plan.cutPoints).toEqual([0, 0.5, 1, 1.5]);
    expect(plan.placements.map((placement) => placement.clipId)).toEqual([
      'clip-a',
      'clip-b',
      'clip-c',
      'clip-a',
    ]);
    expect(plan.placements.map((placement) => placement.durationSec)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(plan.accentEvents).toHaveLength(4);
  });

  it('cuts only on downbeats for strong_beat strategy', () => {
    const plan = buildBeatSyncPlan({
      clips: [{ clipId: 'clip-a' }, { clipId: 'clip-b' }],
      beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      strategy: 'strong_beat',
      mode: 'sequential',
      beatsPerBar: 4,
    });

    expect(plan.cutPoints).toEqual([0, 2]);
    expect(plan.placements).toHaveLength(2);
    expect(plan.placements[0]).toMatchObject({
      clipId: 'clip-a',
      startSec: 0,
      endSec: 2,
    });
    expect(plan.placements[1]).toMatchObject({
      clipId: 'clip-b',
      startSec: 2,
      endSec: 2.5,
    });
  });

  it('uses progressively denser cuts toward the end of the beat range', () => {
    const plan = buildBeatSyncPlan({
      clips: [{ clipId: 'clip-a' }, { clipId: 'clip-b' }, { clipId: 'clip-c' }],
      beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5],
      strategy: 'progressive',
      mode: 'ping-pong',
    });

    expect(plan.cutPoints).toEqual([0, 2, 3, 4, 4.5, 5, 5.5]);
    expect(plan.placements[0]?.durationSec).toBe(2);
    expect(plan.placements[1]?.durationSec).toBe(1);
    expect(plan.placements.at(-1)?.durationSec).toBe(0.5);
    expect(plan.placements.map((placement) => placement.clipId)).toEqual([
      'clip-a',
      'clip-b',
      'clip-c',
      'clip-b',
      'clip-a',
      'clip-b',
      'clip-c',
    ]);
  });

  it('marks energy peaks as strong accents and warns on short clips', () => {
    const plan = buildBeatSyncPlan({
      clips: [
        { clipId: 'clip-a', durationSec: 0.3 },
        { clipId: 'clip-b', durationSec: 0.6 },
      ],
      beats: [0, 0.5, 1],
      strategy: 'every_beat',
      mode: 'random',
      seed: 7,
      energyPeaks: [{ time: 0.48, strength: 0.95 }],
    });

    expect(plan.accentEvents.find((event) => event.timeSec === 0.5)?.intensity).toBe('strong');
    expect(plan.warnings.some((warning) => warning.includes('clip-a'))).toBe(true);
  });
});
