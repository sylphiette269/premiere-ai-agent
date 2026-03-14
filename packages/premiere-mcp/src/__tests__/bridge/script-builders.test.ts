import {
  buildAddToTimelineScript,
  buildRenderSequenceScript,
} from '../../bridge/script-builders.js';
import vm from 'node:vm';

describe('buildAddToTimelineScript', () => {
  it('uses a sequence-derived tolerance instead of a fixed 0.1 second window', () => {
    const script = buildAddToTimelineScript(
      'seq-1',
      'item-1',
      0,
      0.0333333333,
      JSON.stringify,
    );

    expect(script).toContain('var frameTolerance = 0.001;');
    expect(script).toContain('sequence.timebase');
    expect(script).not.toContain('< 0.1');
    expect(script).not.toContain('track.clips[track.clips.numItems - 1]');
  });

  it('collects audio-track placements instead of hard-failing when the inserted item lands in audio tracks', () => {
    const script = buildAddToTimelineScript(
      'seq-1',
      'audio-item-1',
      0,
      0,
      JSON.stringify,
    );

    expect(script).toContain('for (var audioTrackIndex = 0; audioTrackIndex < sequence.audioTracks.numTracks; audioTrackIndex++)');
    expect(script).toContain("collectPlacedClip(audioTrack.clips[audioClipIndex], 'audio', audioTrackIndex, audioClipIndex);");
    expect(script).toContain('placedClips.sort(function(a, b)');
    expect(script).toContain('placedClips: serializedPlacedClips');
    expect(script).toContain('trackType: primaryMatch.trackType');
  });

  it('returns the inserted audio clip when Premiere routes an audio-only item to an audio track', () => {
    const script = buildAddToTimelineScript(
      'seq-audio',
      'item-audio',
      0,
      0,
      JSON.stringify,
    );

    const videoTrackClips = {
      numItems: 0,
    } as Record<number, any> & { numItems: number };
    const audioTrackClips = {
      numItems: 0,
    } as Record<number, any> & { numItems: number };
    const projectItem = {
      nodeId: 'item-audio',
      getMediaPath() {
        return 'E:/audio/demo.wav';
      },
    };
    const insertedAudioClip = {
      nodeId: 'clip-audio-1',
      name: 'demo.wav',
      projectItem,
      start: { seconds: 0 },
      end: { seconds: 25 },
      duration: { seconds: 25 },
    };
    const sequence = {
      timebase: String(254016000000 / 25),
      videoTracks: {
        0: {
          clips: videoTrackClips,
          overwriteClip() {
            audioTrackClips[0] = insertedAudioClip;
            audioTrackClips.numItems = 1;
          },
        },
      },
      audioTracks: {
        numTracks: 1,
        0: {
          clips: audioTrackClips,
        },
      },
    };

    const rawResult = vm.runInNewContext(`(function(){${script}\n})()`, {
      JSON,
      Math,
      Number,
      String,
      bridgeLookupSequence() {
        return sequence;
      },
      bridgeLookupProjectItem() {
        return projectItem;
      },
    });

    expect(JSON.parse(String(rawResult))).toMatchObject({
      success: true,
      id: 'clip-audio-1',
      mediaPath: 'E:/audio/demo.wav',
      trackType: 'audio',
      trackIndex: 0,
      placedClips: [
        expect.objectContaining({
          id: 'clip-audio-1',
          trackType: 'audio',
          trackIndex: 0,
        }),
      ],
    });
  });
});

describe('buildRenderSequenceScript', () => {
  it('checks that the requested sequence exists before calling the encoder', () => {
    const script = buildRenderSequenceScript(
      'seq-1',
      'C:\\Exports\\demo.mp4',
      'C:\\Presets\\demo.epr',
      JSON.stringify,
    );

    expect(script).toContain("if (!sequence) return JSON.stringify({ success: false, error: 'sequence_not_found' });");
  });
});
