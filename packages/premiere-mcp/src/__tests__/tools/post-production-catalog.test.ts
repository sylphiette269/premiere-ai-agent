import { describe, expect, it } from '@jest/globals';

import { createPostProductionToolCatalogSnapshot } from '../../tools/catalog/post-production.js';

describe('createPostProductionToolCatalogSnapshot()', () => {
  it('returns the post-production tool names in stable order', () => {
    const tools = createPostProductionToolCatalogSnapshot();

    expect(tools.map((tool) => tool.name)).toEqual([
      'adjust_audio_levels',
      'add_audio_keyframes',
      'mute_track',
      'add_text_overlay',
      'color_correct',
      'apply_lut',
      'export_sequence',
      'export_frame',
    ]);
  });

  it('keeps representative schemas aligned with the current parameters', () => {
    const tools = createPostProductionToolCatalogSnapshot();
    const addAudioKeyframesTool = tools.find(
      (tool) => tool.name === 'add_audio_keyframes',
    );
    const exportSequenceTool = tools.find(
      (tool) => tool.name === 'export_sequence',
    );

    expect(
      addAudioKeyframesTool?.inputSchema.safeParse({
        clipId: 'clip-1',
        keyframes: [
          { time: 0.5, level: -6 },
          { time: 1.25, level: -3 },
        ],
      }).success,
    ).toBe(true);

    expect(
      exportSequenceTool?.inputSchema.safeParse({
        sequenceId: 'seq-1',
        outputPath: 'E:/exports/demo.mp4',
        format: 'mp4',
        quality: 'high',
      }).success,
    ).toBe(true);
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createPostProductionToolCatalogSnapshot();
    first[0].name = 'mutated-post-tool';
    first.splice(1, 2);

    const second = createPostProductionToolCatalogSnapshot();

    expect(second[0].name).toBe('adjust_audio_levels');
    expect(second).toHaveLength(8);
  });
});
