import { compareToBlueprint } from '../../video-reference-qa.js';
import type { VideoBlueprint } from '../../video-reference-analyzer.js';

function createBlueprint(): VideoBlueprint {
  return {
    sourcePath: 'E:/reference/demo.mp4',
    totalDuration: 12,
    estimatedFrameRate: 25,
    shots: [
      {
        index: 0,
        startSec: 0,
        endSec: 4,
        durationSec: 4,
        transitionIn: null,
        transitionOut: 'Cube Spin',
        dominantColor: 'neutral',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'wide',
      },
      {
        index: 1,
        startSec: 4,
        endSec: 8,
        durationSec: 4,
        transitionIn: 'Cube Spin',
        transitionOut: 'Cube Spin',
        dominantColor: 'neutral',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'medium',
      },
      {
        index: 2,
        startSec: 8,
        endSec: 12,
        durationSec: 4,
        transitionIn: 'Cube Spin',
        transitionOut: null,
        dominantColor: 'neutral',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'close',
      },
    ],
    pacing: {
      avgShotDurationSec: 4,
      minShotDurationSec: 4,
      maxShotDurationSec: 4,
      cutRate: 3,
      rhythmPattern: 'uniform',
    },
    dominantTransitions: ['Cube Spin'],
    colorProfile: {
      warmth: 'neutral',
      saturation: 'medium',
      brightness: 'medium',
    },
    motionStyle: 'mixed',
    audioProfile: {
      hasMusic: false,
      hasVoiceover: false,
      hasNaturalSound: true,
    },
    textOverlays: [],
  };
}

describe('compareToBlueprint', () => {
  it('fails when the assembled duration drifts by more than five seconds', () => {
    const report = compareToBlueprint(createBlueprint(), {
      summary: {
        realizedClipCount: 3,
      },
      tracks: {
        success: true,
        videoTracks: [
          {
            index: 0,
            clipCount: 3,
            clips: [
              { name: 'shot-1', startTime: 0, endTime: 6, duration: 6 },
              { name: 'shot-2', startTime: 6, endTime: 12, duration: 6 },
              { name: 'shot-3', startTime: 12, endTime: 18, duration: 6 },
            ],
          },
        ],
        audioTracks: [],
      },
      requestedTransitionName: 'Cube Spin',
    });

    expect(report.status).toBe('fail');
    expect(report.durationDeltaSec).toBe(6);
  });

  it('fails when the assembled shot count does not match the reference blueprint', () => {
    const report = compareToBlueprint(createBlueprint(), {
      summary: {
        realizedClipCount: 2,
      },
      tracks: {
        success: true,
        videoTracks: [
          {
            index: 0,
            clipCount: 2,
            clips: [
              { name: 'shot-1', startTime: 0, endTime: 4, duration: 4 },
              { name: 'shot-2', startTime: 4, endTime: 8, duration: 4 },
            ],
          },
        ],
        audioTracks: [],
      },
      requestedTransitionName: 'Cube Spin',
    });

    expect(report.status).toBe('fail');
    expect(report.shotCountMatch).toBe(false);
    expect(report.blockers).toContain('The assembled shot count does not match the reference blueprint.');
  });

  it('returns needs-review when only the transition mapping drifts', () => {
    const report = compareToBlueprint(createBlueprint(), {
      summary: {
        realizedClipCount: 3,
      },
      tracks: {
        success: true,
        videoTracks: [
          {
            index: 0,
            clipCount: 3,
            clips: [
              { name: 'shot-1', startTime: 0, endTime: 4, duration: 4 },
              { name: 'shot-2', startTime: 4, endTime: 8, duration: 4 },
              { name: 'shot-3', startTime: 8, endTime: 12, duration: 4 },
            ],
          },
        ],
        audioTracks: [],
      },
      requestedTransitionName: 'Cross Dissolve',
    });

    expect(report.status).toBe('needs-review');
    expect(report.transitionMismatches).toHaveLength(2);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toContain('The assembled transition strategy does not fully match the reference blueprint.');
  });

  it('passes when duration, shot count, pacing, and transition strategy all match', () => {
    const report = compareToBlueprint(createBlueprint(), {
      summary: {
        realizedClipCount: 3,
      },
      tracks: {
        success: true,
        videoTracks: [
          {
            index: 0,
            clipCount: 3,
            clips: [
              { name: 'shot-1', startTime: 0, endTime: 4, duration: 4 },
              { name: 'shot-2', startTime: 4, endTime: 8, duration: 4 },
              { name: 'shot-3', startTime: 8, endTime: 12, duration: 4 },
            ],
          },
        ],
        audioTracks: [],
      },
      requestedTransitionName: 'Cube Spin',
    });

    expect(report.status).toBe('pass');
    expect(report.durationDeltaSec).toBe(0);
    expect(report.pacingDeltaPercent).toBe(0);
    expect(report.transitionMismatches).toHaveLength(0);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });
});
