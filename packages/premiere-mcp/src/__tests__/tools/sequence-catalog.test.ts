import { describe, expect, it } from '@jest/globals';

import { createSequenceToolCatalogSnapshot } from '../../tools/catalog/sequence.js';

describe('createSequenceToolCatalogSnapshot()', () => {
  it('returns only sequence management tool names', () => {
    const tools = createSequenceToolCatalogSnapshot();
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual([
      'create_sequence',
      'duplicate_sequence',
      'delete_sequence',
    ]);
  });

  it('keeps create_sequence schema aligned with preset, media, and geometry options', () => {
    const tools = createSequenceToolCatalogSnapshot();
    const createSequenceTool = tools.find((tool) => tool.name === 'create_sequence');

    expect(createSequenceTool).toBeDefined();
    expect(createSequenceTool?.inputSchema.safeParse({
      name: 'Demo Sequence',
      presetPath: 'E:/presets/demo.sqpreset',
      mediaPath: 'E:/media/demo-shot.mp4',
      avoidCreateNewSequence: true,
      width: 1920,
      height: 1080,
      frameRate: 25,
      sampleRate: 48000,
    }).success).toBe(true);
  });

  it('returns detached snapshots so later reads are not mutated', () => {
    const first = createSequenceToolCatalogSnapshot();
    first[0].name = 'mutated-sequence-tool';
    first.splice(1, 1);

    const second = createSequenceToolCatalogSnapshot();

    expect(second[0].name).toBe('create_sequence');
    expect(second).toHaveLength(3);
  });
});
