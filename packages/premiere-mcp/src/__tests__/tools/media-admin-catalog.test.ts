import { describe, expect, it } from '@jest/globals';

import { pluginManifestSchema } from '../../plugin-manager.js';
import { createMediaAdminToolCatalogSnapshot } from '../../tools/catalog/media-admin.js';

describe('createMediaAdminToolCatalogSnapshot()', () => {
  it('returns media administration tool names in stable order', () => {
    const tools = createMediaAdminToolCatalogSnapshot({
      pluginManifestSchema,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'relink_media',
      'delete_project_item',
      'set_color_label',
      'get_color_label',
      'get_metadata',
      'set_metadata',
      'get_footage_interpretation',
      'set_footage_interpretation',
      'check_offline_media',
      'export_as_fcp_xml',
      'undo',
      'set_sequence_in_out_points',
      'get_sequence_in_out_points',
      'export_aaf',
      'consolidate_duplicates',
      'refresh_media',
      'import_sequences_from_project',
      'create_subsequence',
      'import_mogrt',
      'import_mogrt_from_library',
      'plugin_list',
      'plugin_register',
      'plugin_set_enabled',
      'plugin_call',
      'manage_proxies',
    ]);
  });

  it('keeps representative schemas aligned with the current parameters', () => {
    const tools = createMediaAdminToolCatalogSnapshot({
      pluginManifestSchema,
    });
    const exportAafTool = tools.find((tool) => tool.name === 'export_aaf');
    const pluginCallTool = tools.find((tool) => tool.name === 'plugin_call');

    expect(
      exportAafTool?.inputSchema.safeParse({
        sequenceId: 'seq-1',
        outputPath: 'E:/exports/demo.aaf',
        sampleRate: 48000,
      }).success,
    ).toBe(true);

    expect(
      pluginCallTool?.inputSchema.safeParse({
        pluginId: 'demo-plugin',
        method: 'render',
        params: { fps: 25 },
      }).success,
    ).toBe(true);
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createMediaAdminToolCatalogSnapshot({
      pluginManifestSchema,
    });
    first[0].name = 'mutated-media-tool';
    first.splice(1, 5);

    const second = createMediaAdminToolCatalogSnapshot({
      pluginManifestSchema,
    });

    expect(second[0].name).toBe('relink_media');
    expect(second).toHaveLength(25);
  });
});
