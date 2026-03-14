import { describe, expect, it } from '@jest/globals';

import { createBatchAssemblyToolCatalogSnapshot } from '../../tools/catalog/batch-assembly.js';

describe('createBatchAssemblyToolCatalogSnapshot()', () => {
  it('returns batch and assembly support tool names in stable order', () => {
    const tools = createBatchAssemblyToolCatalogSnapshot();

    expect(tools.map((tool) => tool.name)).toEqual([
      'batch_add_transitions',
      'batch_apply_effect',
      'batch_export',
      'batch_color_correct',
      'find_project_item_by_name',
      'move_item_to_bin',
      'set_active_sequence',
      'get_active_sequence',
      'get_clip_at_position',
      'auto_reframe_sequence',
      'detect_scene_edits',
      'create_caption_track',
      'generate_subtitles',
      'create_subclip',
    ]);
  });

  it('keeps representative schemas aligned with the current parameters', () => {
    const tools = createBatchAssemblyToolCatalogSnapshot();
    const batchApplyEffectTool = tools.find(
      (tool) => tool.name === 'batch_apply_effect',
    );
    const createSubclipTool = tools.find(
      (tool) => tool.name === 'create_subclip',
    );
    const generateSubtitlesTool = tools.find(
      (tool) => tool.name === 'generate_subtitles',
    );

    expect(
      batchApplyEffectTool?.inputSchema.safeParse({
        sequenceIds: ['seq-a', 'seq-b'],
        trackIndex: 0,
        effectName: 'Lumetri Color',
        parameters: { Exposure: 1.5 },
      }).success,
    ).toBe(true);

    expect(
      createSubclipTool?.inputSchema.safeParse({
        projectItemId: 'item-1',
        name: 'Teaser shot',
        startTime: 1.0,
        endTime: 3.5,
        takeAudio: true,
      }).success,
    ).toBe(true);

    expect(
      generateSubtitlesTool?.inputSchema.safeParse({
        audioPath: 'E:/media/voiceover.wav',
        backend: 'auto',
        fasterWhisperModel: 'small',
        language: 'zh',
      }).success,
    ).toBe(true);
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createBatchAssemblyToolCatalogSnapshot();
    first[0].name = 'mutated-batch-tool';
    first.splice(1, 4);

    const second = createBatchAssemblyToolCatalogSnapshot();

    expect(second[0].name).toBe('batch_add_transitions');
    expect(second).toHaveLength(14);
  });
});
