import { describe, expect, it } from '@jest/globals';

import { createHighLevelToolCatalogSnapshot } from '../../tools/catalog/high-level.js';

describe('createHighLevelToolCatalogSnapshot()', () => {
  it('returns the planning and reference-video tool names without mixing in project management tools', () => {
    const tools = createHighLevelToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
      animationPresetNames: ['fade_in', 'zoom_in'],
    });

    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toContain('plan_edit_assembly');
    expect(toolNames).toContain('review_edit_reasonability');
    expect(toolNames).toContain('apply_animation_preset');
    expect(toolNames).not.toContain('create_project');
    expect(toolNames).not.toContain('import_media');
  });

  it('returns detached snapshots so callers cannot mutate the next catalog read', () => {
    const first = createHighLevelToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
      animationPresetNames: ['fade_in', 'zoom_in'],
    });
    first[0].name = 'mutated-tool-name';
    first.splice(1, 2);

    const second = createHighLevelToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
      animationPresetNames: ['fade_in', 'zoom_in'],
    });

    expect(second[0].name).toBe('list_project_items');
    expect(second.some((tool) => tool.name === 'plan_edit_assembly')).toBe(true);
    expect(second.length).toBeGreaterThan(first.length);
  });
});
