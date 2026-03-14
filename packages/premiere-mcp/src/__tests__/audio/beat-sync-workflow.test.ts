import type { AudioAnalysisResult } from '../../audio-analysis.js';
import type { BeatSyncPlan } from '../../beat-sync-engine.js';
import type { ExecuteBeatSyncPlanResult } from '../../beat-sync-executor.js';
import { runBeatSyncWorkflow } from '../../beat-sync-workflow.js';

describe('runBeatSyncWorkflow', () => {
  const analysis: AudioAnalysisResult = {
    tempo: 128,
    beats: [0, 0.5, 1],
    beat_count: 3,
    duration: 1.5,
    energy_peaks: [{ time: 0.5, strength: 0.92 }, { invalid: true }],
  };

  const plan: BeatSyncPlan = {
    strategy: 'every_beat',
    mode: 'sequential',
    tempo: 128,
    cutPoints: [0, 0.5, 1],
    medianBeatIntervalSec: 0.5,
    warnings: [],
    placements: [
      {
        clipId: 'clip-a',
        order: 0,
        beatIndex: 0,
        startSec: 0,
        endSec: 0.5,
        durationSec: 0.5,
        accentIntensity: 'normal',
      },
    ],
    accentEvents: [
      {
        timeSec: 0,
        beatIndex: 0,
        type: 'scale_pulse',
        intensity: 'normal',
      },
    ],
  };

  const executionResult: ExecuteBeatSyncPlanResult = {
    success: true,
    blocked: false,
    timelinePlacements: [],
    accentApplications: [],
  };

  it('runs analysis and planning only during dry run', async () => {
    const analyzeAudioTrackFn = jest.fn().mockResolvedValue(analysis);
    const buildBeatSyncPlanFn = jest.fn().mockReturnValue(plan);
    const executeBeatSyncPlanFn = jest.fn();

    const result = await runBeatSyncWorkflow(
      {
        audio: {
          inputPath: 'E:/audio/demo.wav',
          method: 'onset',
        },
        planning: {
          clips: [{ clipId: 'clip-a' }],
          strategy: 'every_beat',
          mode: 'sequential',
          beatsPerBar: 4,
          seed: 7,
        },
        dryRun: true,
      },
      {
        analyzeAudioTrackFn,
        buildBeatSyncPlanFn,
        executeBeatSyncPlanFn,
      },
    );

    expect(result.analysis).toBe(analysis);
    expect(result.plan).toBe(plan);
    expect(result.execution).toBeNull();
    expect(analyzeAudioTrackFn).toHaveBeenCalledWith({
      inputPath: 'E:/audio/demo.wav',
      method: 'onset',
    });
    expect(buildBeatSyncPlanFn).toHaveBeenCalledWith({
      clips: [{ clipId: 'clip-a' }],
      strategy: 'every_beat',
      mode: 'sequential',
      beatsPerBar: 4,
      seed: 7,
      beats: [0, 0.5, 1],
      tempo: 128,
      energyPeaks: [{ time: 0.5, strength: 0.92 }],
    });
    expect(executeBeatSyncPlanFn).not.toHaveBeenCalled();
  });

  it('runs the full analysis, planning, and execution workflow', async () => {
    const analyzeAudioTrackFn = jest.fn().mockResolvedValue(analysis);
    const buildBeatSyncPlanFn = jest.fn().mockReturnValue(plan);
    const executeBeatSyncPlanFn = jest.fn().mockResolvedValue(executionResult);
    const executeTool = jest.fn();

    const result = await runBeatSyncWorkflow(
      {
        audio: {
          inputPath: 'E:/audio/demo.wav',
        },
        planning: {
          clips: [{ clipId: 'clip-a', durationSec: 0.6 }],
          strategy: 'every_beat',
          mode: 'random',
          seed: 3,
        },
        execution: {
          sequenceId: 'seq-1',
          executeTool,
          trackIndex: 1,
          pulseDurationSec: 0.18,
        },
      },
      {
        analyzeAudioTrackFn,
        buildBeatSyncPlanFn,
        executeBeatSyncPlanFn,
      },
    );

    expect(result.execution).toBe(executionResult);
    expect(executeBeatSyncPlanFn).toHaveBeenCalledWith({
      sequenceId: 'seq-1',
      plan,
      executeTool,
      trackIndex: 1,
      insertMode: undefined,
      applyAccentScalePulse: undefined,
      pulseDurationSec: 0.18,
      baseScale: undefined,
      normalPulseScale: undefined,
      strongPulseScale: undefined,
    });
  });

  it('returns analysis and plan when execution config is omitted', async () => {
    const analyzeAudioTrackFn = jest.fn().mockResolvedValue(analysis);
    const buildBeatSyncPlanFn = jest.fn().mockReturnValue(plan);
    const executeBeatSyncPlanFn = jest.fn();

    const result = await runBeatSyncWorkflow(
      {
        audio: {
          inputPath: 'E:/audio/demo.wav',
        },
        planning: {
          clips: [{ clipId: 'clip-a' }],
          strategy: 'strong_beat',
        },
      },
      {
        analyzeAudioTrackFn,
        buildBeatSyncPlanFn,
        executeBeatSyncPlanFn,
      },
    );

    expect(result.execution).toBeNull();
    expect(executeBeatSyncPlanFn).not.toHaveBeenCalled();
  });

  it('throws when execution is requested without executeTool', async () => {
    const analyzeAudioTrackFn = jest.fn().mockResolvedValue(analysis);
    const buildBeatSyncPlanFn = jest.fn().mockReturnValue(plan);

    await expect(
      runBeatSyncWorkflow(
        {
          audio: {
            inputPath: 'E:/audio/demo.wav',
          },
          planning: {
            clips: [{ clipId: 'clip-a' }],
            strategy: 'every_beat',
          },
          execution: {
            sequenceId: 'seq-1',
          },
        },
        {
          analyzeAudioTrackFn,
          buildBeatSyncPlanFn,
        },
      ),
    ).rejects.toThrow('execution.executeTool is required');
  });
});
