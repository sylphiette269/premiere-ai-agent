import { describe, expect, it } from '@jest/globals';

import { createTimelineToolCatalogSnapshot } from '../../tools/catalog/timeline.js';

describe('createTimelineToolCatalogSnapshot()', () => {
  it('returns only timeline operation tool names', () => {
    const tools = createTimelineToolCatalogSnapshot();

    expect(tools.map((tool) => tool.name)).toEqual([
      'add_to_timeline',
      'remove_from_timeline',
      'move_clip',
      'trim_clip',
      'split_clip',
    ]);
  });

  it('keeps add_to_timeline and split_clip schemas aligned with current parameters', () => {
    const tools = createTimelineToolCatalogSnapshot();
    const addToTimelineTool = tools.find((tool) => tool.name === 'add_to_timeline');
    const splitClipTool = tools.find((tool) => tool.name === 'split_clip');

    expect(addToTimelineTool?.inputSchema.safeParse({
      sequenceId: 'seq-1',
      projectItemId: 'item-1',
      trackIndex: 0,
      time: 12.5,
      insertMode: 'overwrite',
    }).success).toBe(true);

    expect(splitClipTool?.inputSchema.safeParse({
      clipId: 'clip-1',
      splitTime: 7.25,
    }).success).toBe(true);
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createTimelineToolCatalogSnapshot();
    first[0].name = 'mutated-timeline-tool';
    first.splice(1, 2);

    const second = createTimelineToolCatalogSnapshot();

    expect(second[0].name).toBe('add_to_timeline');
    expect(second).toHaveLength(5);
  });
});
