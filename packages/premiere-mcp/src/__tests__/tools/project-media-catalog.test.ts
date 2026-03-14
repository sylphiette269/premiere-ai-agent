import { describe, expect, it } from '@jest/globals';

import { createProjectMediaToolCatalogSnapshot } from '../../tools/catalog/project-media.js';

describe('createProjectMediaToolCatalogSnapshot()', () => {
  it('returns project and media management tool names without timeline tools', () => {
    const tools = createProjectMediaToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
    });

    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('open_project');
    expect(toolNames).toContain('import_media');
    expect(toolNames).toContain('create_bin');
    expect(toolNames).not.toContain('add_to_timeline');
    expect(toolNames).not.toContain('trim_clip');
  });

  it('keeps import_media restricted to reference-only mode', () => {
    const tools = createProjectMediaToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
    });

    const importMediaTool = tools.find((tool) => tool.name === 'import_media');
    expect(importMediaTool).toBeDefined();

    expect(importMediaTool?.inputSchema.safeParse({
      filePath: 'E:/media/clip.mp4',
      importMode: 'reference-only',
    }).success).toBe(true);

    expect(importMediaTool?.inputSchema.safeParse({
      filePath: 'E:/media/clip.mp4',
      importMode: 'copy',
    }).success).toBe(false);
  });

  it('returns detached snapshots so external mutation does not leak into the next read', () => {
    const first = createProjectMediaToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
    });
    first[0].name = 'mutated-project-tool';
    first.pop();

    const second = createProjectMediaToolCatalogSnapshot({
      referenceOnlyMediaPolicy: 'reference-only',
    });

    expect(second[0].name).toBe('create_project');
    expect(second.some((tool) => tool.name === 'import_media')).toBe(true);
    expect(second.length).toBeGreaterThan(first.length);
  });
});
