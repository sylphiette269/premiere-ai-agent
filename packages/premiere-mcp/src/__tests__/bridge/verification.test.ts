import { verifyWriteOperation } from '../../bridge/verification.js';

function mockReadBack(responses: Record<string, unknown>) {
  return async (toolName: string, _args: Record<string, unknown>) =>
    responses[toolName] ?? null;
}

describe('verifyWriteOperation', () => {
  describe('add_to_timeline', () => {
    it('returns matched when clip exists at expected location', async () => {
      const result = await verifyWriteOperation(
        'add_to_timeline',
        { sequenceId: 'seq1', trackIndex: 0, time: 5 },
        { success: true, id: 'clip_42', sequenceId: 'seq1' },
        mockReadBack({
          list_sequence_tracks: {
            videoTracks: [
              {
                clips: [{ id: 'clip_42', trackIndex: 0, startTime: 5 }],
              },
            ],
            audioTracks: [],
          },
        }),
      );

      expect(result.confirmed).toBe(true);
      expect(result.verificationLevel).toBe('matched');
    });

    it('returns matched when an audio-only insert is confirmed on an audio track', async () => {
      const result = await verifyWriteOperation(
        'add_to_timeline',
        { sequenceId: 'seq1', trackIndex: 0, time: 0 },
        { success: true, id: 'clip_audio_1', sequenceId: 'seq1', trackType: 'audio' },
        mockReadBack({
          list_sequence_tracks: {
            videoTracks: [],
            audioTracks: [
              {
                clips: [{ id: 'clip_audio_1', trackIndex: 0, startTime: 0 }],
              },
            ],
          },
        }),
      );

      expect(result.confirmed).toBe(true);
      expect(result.verificationLevel).toBe('matched');
    });

    it('returns missing when clip is absent after write', async () => {
      const result = await verifyWriteOperation(
        'add_to_timeline',
        { sequenceId: 'seq1' },
        { success: true, id: 'clip_42', sequenceId: 'seq1' },
        mockReadBack({
          list_sequence_tracks: {
            videoTracks: [],
            audioTracks: [],
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('missing');
    });

    it('returns partial when track does not match', async () => {
      const result = await verifyWriteOperation(
        'add_to_timeline',
        { sequenceId: 'seq1', trackIndex: 0 },
        { success: true, id: 'clip_42', sequenceId: 'seq1' },
        mockReadBack({
          list_sequence_tracks: {
            videoTracks: [
              {
                clips: [{ id: 'clip_42', trackIndex: 2, startTime: 5 }],
              },
            ],
            audioTracks: [],
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('partial');
      expect(result.mismatchFields).toEqual([
        {
          field: 'trackIndex',
          expected: 0,
          actual: 2,
        },
      ]);
    });
  });

  describe('apply_effect', () => {
    it('detects missing effect', async () => {
      const result = await verifyWriteOperation(
        'apply_effect',
        { clipId: 'clip1', effectName: 'Lumetri Color' },
        { success: true },
        mockReadBack({
          get_clip_effects: {
            effects: [],
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('missing');
    });
  });

  describe('add_keyframe', () => {
    it('detects missing keyframe', async () => {
      const result = await verifyWriteOperation(
        'add_keyframe',
        {
          clipId: 'clip1',
          componentName: 'Motion',
          paramName: 'Scale',
          time: 1,
          value: 120,
        },
        { success: true },
        mockReadBack({
          get_keyframes: {
            keyframes: [],
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('missing');
    });

    it('detects mismatched keyframe value', async () => {
      const result = await verifyWriteOperation(
        'add_keyframe',
        {
          clipId: 'clip1',
          componentName: 'Motion',
          paramName: 'Scale',
          time: 1,
          value: 120,
        },
        { success: true },
        mockReadBack({
          get_keyframes: {
            keyframes: [{ time: 1, value: 100 }],
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('partial');
      expect(result.mismatchFields?.[0]).toEqual({
        field: 'value',
        expected: 120,
        actual: 100,
      });
    });

    it('accepts hostValue matches for Motion.Position read-back conversion', async () => {
      const result = await verifyWriteOperation(
        'add_keyframe',
        {
          clipId: 'clip1',
          componentName: 'Motion',
          paramName: 'Position',
          time: 1,
          value: [0.5, 0.5],
        },
        { success: true },
        mockReadBack({
          get_keyframes: {
            keyframes: [{ time: 1, value: [960, 540], hostValue: [0.5, 0.5] }],
          },
        }),
      );

      expect(result.confirmed).toBe(true);
      expect(result.verificationLevel).toBe('matched');
    });
  });

  describe('set_clip_properties', () => {
    it('detects property mismatches', async () => {
      const result = await verifyWriteOperation(
        'set_clip_properties',
        {
          clipId: 'clip1',
          properties: {
            Scale: 120,
            Opacity: 90,
          },
        },
        { success: true },
        mockReadBack({
          get_clip_properties: {
            properties: {
              Scale: 100,
              Opacity: 90,
            },
          },
        }),
      );

      expect(result.confirmed).toBe(false);
      expect(result.verificationLevel).toBe('partial');
      expect(result.mismatchFields).toEqual([
        {
          field: 'Scale',
          expected: 120,
          actual: 100,
        },
      ]);
    });
  });

  it('falls back to exists for tools without a comparator', async () => {
    const result = await verifyWriteOperation(
      'some_unknown_tool',
      {},
      { success: true },
      mockReadBack({}),
    );

    expect(result.confirmed).toBe(true);
    expect(result.verificationLevel).toBe('exists');
  });

  it('returns missing when read-back throws', async () => {
    const result = await verifyWriteOperation(
      'add_to_timeline',
      { sequenceId: 'seq1' },
      { success: true, id: 'clip1', sequenceId: 'seq1' },
      async () => {
        throw new Error('Bridge timeout');
      },
    );

    expect(result.confirmed).toBe(false);
    expect(result.verificationLevel).toBe('missing');
    expect(result.mismatch).toContain('Bridge timeout');
  });
});
