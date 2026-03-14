import { describe, expect, it } from '@jest/globals';

import { createEffectsToolCatalogSnapshot } from '../../tools/catalog/effects.js';

describe('createEffectsToolCatalogSnapshot()', () => {
  it('returns only effects and transition tool names', () => {
    const tools = createEffectsToolCatalogSnapshot();

    expect(tools.map((tool) => tool.name)).toEqual([
      'apply_effect',
      'add_transition',
      'add_transition_to_clip',
      'inspect_transition_boundary',
      'inspect_track_transition_boundaries',
      'safe_batch_add_transitions',
    ]);
  });

  it('keeps apply_effect, add_transition_to_clip, and transition inspection schemas aligned with current parameters', () => {
    const tools = createEffectsToolCatalogSnapshot();
    const applyEffectTool = tools.find((tool) => tool.name === 'apply_effect');
    const addTransitionToClipTool = tools.find((tool) => tool.name === 'add_transition_to_clip');
    const inspectTransitionBoundaryTool = tools.find((tool) => tool.name === 'inspect_transition_boundary');
    const inspectTrackTransitionBoundariesTool = tools.find((tool) => tool.name === 'inspect_track_transition_boundaries');
    const safeBatchAddTransitionsTool = tools.find((tool) => tool.name === 'safe_batch_add_transitions');

    expect(applyEffectTool?.inputSchema.safeParse({
      clipId: 'clip-1',
      effectName: 'Gaussian Blur',
      parameters: { blurriness: 40 },
    }).success).toBe(true);

    expect(addTransitionToClipTool?.inputSchema.safeParse({
      clipId: 'clip-2',
      transitionName: 'Cross Dissolve',
      position: 'end',
      duration: 0.5,
    }).success).toBe(true);

    expect(inspectTransitionBoundaryTool?.inputSchema.safeParse({
      clipId1: 'clip-2',
      clipId2: 'clip-3',
      duration: 0.5,
    }).success).toBe(true);

    expect(inspectTrackTransitionBoundariesTool?.inputSchema.safeParse({
      sequenceId: 'sequence-1',
      trackIndex: 0,
      trackType: 'video',
      duration: 0.5,
    }).success).toBe(true);

    expect(safeBatchAddTransitionsTool?.inputSchema.safeParse({
      sequenceId: 'sequence-1',
      trackIndex: 0,
      transitionName: 'Cross Dissolve',
      trackType: 'video',
      duration: 0.5,
    }).success).toBe(true);
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createEffectsToolCatalogSnapshot();
    first[0].name = 'mutated-effects-tool';
    first.splice(1, 1);

    const second = createEffectsToolCatalogSnapshot();

    expect(second[0].name).toBe('apply_effect');
    expect(second).toHaveLength(6);
  });
});
