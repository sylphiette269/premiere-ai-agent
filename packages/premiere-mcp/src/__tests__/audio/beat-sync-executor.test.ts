import { executeBeatSyncPlan } from '../../beat-sync-executor.js';

describe('executeBeatSyncPlan', () => {
  it('places clips sequentially and applies scale pulse keyframes', async () => {
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, id: 'timeline-clip-a' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, id: 'timeline-clip-b' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });

    const result = await executeBeatSyncPlan({
      sequenceId: 'seq-1',
      plan: {
        strategy: 'every_beat',
        mode: 'sequential',
        cutPoints: [0, 0.5],
        medianBeatIntervalSec: 0.5,
        warnings: [],
        placements: [
          {
            clipId: 'item-a',
            order: 0,
            beatIndex: 0,
            startSec: 0,
            endSec: 0.5,
            durationSec: 0.5,
            accentIntensity: 'strong',
          },
          {
            clipId: 'item-b',
            order: 1,
            beatIndex: 1,
            startSec: 0.5,
            endSec: 1.0,
            durationSec: 0.5,
            accentIntensity: 'normal',
          },
        ],
        accentEvents: [
          { timeSec: 0, beatIndex: 0, type: 'scale_pulse', intensity: 'strong' },
          { timeSec: 0.5, beatIndex: 1, type: 'scale_pulse', intensity: 'normal' },
        ],
      },
      executeTool,
      pulseDurationSec: 0.2,
      baseScale: 100,
      strongPulseScale: 112,
      normalPulseScale: 106,
    });

    expect(result.success).toBe(true);
    expect(result.timelinePlacements).toHaveLength(2);
    expect(executeTool).toHaveBeenNthCalledWith(1, 'add_to_timeline', {
      sequenceId: 'seq-1',
      projectItemId: 'item-a',
      trackIndex: 0,
      time: 0,
      insertMode: 'overwrite',
    });
    expect(executeTool).toHaveBeenNthCalledWith(2, 'add_keyframe', {
      clipId: 'timeline-clip-a',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 0,
      value: 100,
      interpolation: 'linear',
    });
    expect(executeTool).toHaveBeenNthCalledWith(3, 'add_keyframe', {
      clipId: 'timeline-clip-a',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 0.1,
      value: 112,
      interpolation: 'bezier',
    });
    expect(executeTool).toHaveBeenNthCalledWith(4, 'add_keyframe', {
      clipId: 'timeline-clip-a',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 0.2,
      value: 100,
      interpolation: 'bezier',
    });
    expect(result.accentApplications).toHaveLength(2);
  });

  it('caps pulse timing to the clip segment duration', async () => {
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, id: 'timeline-clip-a' })
      .mockResolvedValue({ success: true });

    await executeBeatSyncPlan({
      sequenceId: 'seq-1',
      plan: {
        strategy: 'every_beat',
        mode: 'sequential',
        cutPoints: [0],
        medianBeatIntervalSec: 0.5,
        warnings: [],
        placements: [
          {
            clipId: 'item-a',
            order: 0,
            beatIndex: 0,
            startSec: 0,
            endSec: 0.08,
            durationSec: 0.08,
            accentIntensity: 'strong',
          },
        ],
        accentEvents: [{ timeSec: 0, beatIndex: 0, type: 'scale_pulse', intensity: 'strong' }],
      },
      executeTool,
      pulseDurationSec: 0.2,
    });

    expect(executeTool).toHaveBeenNthCalledWith(
      2,
      'add_keyframe',
      expect.objectContaining({
        time: 0,
      }),
    );
    expect(executeTool).toHaveBeenNthCalledWith(
      3,
      'add_keyframe',
      expect.objectContaining({
        time: 0.04,
      }),
    );
    expect(executeTool).toHaveBeenNthCalledWith(
      4,
      'add_keyframe',
      expect.objectContaining({
        time: 0.08,
      }),
    );
  });

  it('stops immediately when placement fails', async () => {
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'track not found' });

    const result = await executeBeatSyncPlan({
      sequenceId: 'seq-1',
      plan: {
        strategy: 'every_beat',
        mode: 'sequential',
        cutPoints: [0],
        medianBeatIntervalSec: 0.5,
        warnings: [],
        placements: [
          {
            clipId: 'item-a',
            order: 0,
            beatIndex: 0,
            startSec: 0,
            endSec: 0.5,
            durationSec: 0.5,
            accentIntensity: 'normal',
          },
        ],
        accentEvents: [],
      },
      executeTool,
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.error).toContain('track not found');
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});
