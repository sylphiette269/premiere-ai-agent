import { describe, expect, it, jest } from '@jest/globals';

import {
  createEditingExecutionGroup,
  createMediaAdminExecutionGroup,
  createPlanningExecutionGroup,
  type ToolExecutionFactoryContext,
} from '../../tools/execution-groups.js';

describe('tool execution groups', () => {
  it('builds the planning execution group and delegates representative handlers', async () => {
    const ctx = {
      listProjectItems: jest.fn(async (...args: unknown[]) => args),
      assembleProductSpot: jest.fn(async (...args: unknown[]) => args),
    } as unknown as ToolExecutionFactoryContext;

    const group = createPlanningExecutionGroup(ctx);

    expect(group).toHaveProperty('list_project_items');
    expect(group).toHaveProperty('assemble_product_spot');
    expect(group).toHaveProperty('build_brand_spot_from_mogrt_and_assets');

    await expect(
      group.list_project_items({ includeBins: true, includeMetadata: false }),
    ).resolves.toEqual([true, false]);

    await expect(
      group.assemble_product_spot({ sequenceName: 'Demo', clipDuration: 4 }),
    ).resolves.toEqual([{ sequenceName: 'Demo', clipDuration: 4 }]);
  });

  it('builds the editing execution group and delegates representative handlers', async () => {
    const ctx = {
      createProject: jest.fn(async (...args: unknown[]) => args),
      addMarker: jest.fn(async (...args: unknown[]) => args),
      addKeyframe: jest.fn(async () => ({ success: true })),
      safeBatchAddTransitions: jest.fn(async (...args: unknown[]) => args),
      setKeyframeInterpolation: jest.fn(async (...args: unknown[]) => args),
      removeKeyframe: jest.fn(async (...args: unknown[]) => args),
      getKeyframes: jest.fn(async (...args: unknown[]) => args),
      getClipEffects: jest.fn(async (...args: unknown[]) => args),
      inspectClipComponents: jest.fn(async (...args: unknown[]) => args),
      batchExport: jest.fn(async (...args: unknown[]) => args),
      generateSubtitlesTool: jest.fn(async (...args: unknown[]) => args),
      buildTimelineFromXml: jest.fn(async (...args: unknown[]) => args),
    } as unknown as ToolExecutionFactoryContext;

    const group = createEditingExecutionGroup(ctx);

    expect(group).toHaveProperty('create_project');
    expect(group).toHaveProperty('add_marker');
    expect(group).toHaveProperty('safe_batch_add_transitions');
    expect(group).toHaveProperty('get_clip_effects');
    expect(group).toHaveProperty('inspect_clip_components');
    expect(group).toHaveProperty('set_keyframe_interpolation');
    expect(group).toHaveProperty('batch_export');
    expect(group).toHaveProperty('generate_subtitles');
    expect(group).toHaveProperty('build_timeline_from_xml');

    await expect(
      group.create_project({ name: 'Demo', location: 'E:/projects' }),
    ).resolves.toEqual(['Demo', 'E:/projects']);

    await expect(
      group.safe_batch_add_transitions({
        sequenceId: 'seq-1',
        trackIndex: 0,
        transitionName: 'Cross Dissolve',
        duration: 0.5,
        trackType: 'video',
      }),
    ).resolves.toEqual(['seq-1', 0, 'Cross Dissolve', 0.5, 'video']);

    await expect(
      group.get_clip_effects({
        clipId: 'clip-1',
      }),
    ).resolves.toEqual(['clip-1']);

    await expect(
      group.inspect_clip_components({
        trackIndex: 0,
        clipIndex: 0,
        trackType: 'video',
      }),
    ).resolves.toEqual([0, 0, 'video']);

    await expect(
      group.set_keyframe_interpolation({
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25,
        interpolation: 'time',
      }),
    ).resolves.toEqual(['clip-1', 'Motion', 'Scale', 1.25, 'time']);

    await expect(
      group.remove_keyframe({
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25,
      }),
    ).resolves.toEqual(['clip-1', 'Motion', 'Scale', 1.25]);

    await expect(
      group.get_keyframes({
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
      }),
    ).resolves.toEqual(['clip-1', 'Motion', 'Scale']);

    await expect(
      group.batch_export({
        exports: [{ sequenceId: 'seq-1', outputPath: 'E:/exports/demo.mp4' }],
      }),
    ).resolves.toEqual([
      [{ sequenceId: 'seq-1', outputPath: 'E:/exports/demo.mp4' }],
    ]);

    await expect(
      group.build_timeline_from_xml({
        sequenceName: 'XML Sequence',
        clips: [{ projectItemId: 'item-1', durationSec: 5 }],
        transitionDurationSec: 0.5,
        audioProjectItemId: 'audio-1',
        frameRate: 30,
        frameWidth: 1080,
        frameHeight: 1920,
      }),
    ).resolves.toEqual([
      'XML Sequence',
      [{ projectItemId: 'item-1', durationSec: 5 }],
      0.5,
      'audio-1',
      30,
      1080,
      1920,
    ]);
  });

  it('normalizes propertyName aliases before delegating low-level keyframe handlers', async () => {
    const ctx = {
      addKeyframe: jest.fn(async () => ({
        success: true,
        message: 'Keyframe added',
      })),
      getKeyframes: jest.fn(async () => ({
        success: true,
        keyframes: [{ time: 1.25, value: 80 }],
        count: 1,
      })),
      setKeyframeInterpolation: jest.fn(async (...args: unknown[]) => args),
      removeKeyframe: jest.fn(async (...args: unknown[]) => args),
    } as unknown as ToolExecutionFactoryContext;

    const group = createEditingExecutionGroup(ctx);

    await expect(
      group.add_keyframe({
        clipId: 'clip-1',
        componentName: 'Motion',
        propertyName: 'Scale',
        time: 1.25,
        value: 80,
      }),
    ).resolves.toMatchObject({
      success: true,
      verification: { confirmed: true },
    });
    expect(ctx.addKeyframe).toHaveBeenCalledWith(
      'clip-1',
      'Motion',
      'Scale',
      1.25,
      80,
      undefined,
    );
    expect(ctx.getKeyframes).toHaveBeenCalledWith('clip-1', 'Motion', 'Scale');

    await expect(
      group.set_keyframe_interpolation({
        clipId: 'clip-1',
        componentName: 'Motion',
        propertyName: 'Scale',
        time: 1.25,
        interpolation: 'time',
      }),
    ).resolves.toEqual(['clip-1', 'Motion', 'Scale', 1.25, 'time']);

    await expect(
      group.remove_keyframe({
        clipId: 'clip-1',
        componentName: 'Motion',
        propertyName: 'Scale',
        time: 1.25,
      }),
    ).resolves.toEqual(['clip-1', 'Motion', 'Scale', 1.25]);

    await expect(
      group.get_keyframes({
        clipId: 'clip-1',
        componentName: 'Motion',
        propertyName: 'Scale',
      }),
    ).resolves.toMatchObject({
      success: true,
      count: 1,
    });
    expect(ctx.getKeyframes).toHaveBeenLastCalledWith('clip-1', 'Motion', 'Scale');
  });

  it('builds the media admin execution group and delegates representative handlers', async () => {
    const ctx = {
      relinkMedia: jest.fn(async (...args: unknown[]) => args),
      deleteProjectItem: jest.fn(async (...args: unknown[]) => args),
      callPlugin: jest.fn(async (...args: unknown[]) => args),
      manageProxies: jest.fn(async (...args: unknown[]) => args),
    } as unknown as ToolExecutionFactoryContext;

    const group = createMediaAdminExecutionGroup(ctx);

    expect(group).toHaveProperty('relink_media');
    expect(group).toHaveProperty('delete_project_item');
    expect(group).toHaveProperty('plugin_call');
    expect(group).toHaveProperty('manage_proxies');

    await expect(
      group.delete_project_item({
        projectItemId: 'item-1',
        allowReferenced: true,
      }),
    ).resolves.toEqual(['item-1', true]);

    await expect(
      group.plugin_call({
        pluginId: 'demo-plugin',
        method: 'render',
        params: { fps: 25 },
      }),
    ).resolves.toEqual(['demo-plugin', 'render', { fps: 25 }]);

    await expect(
      group.manage_proxies({
        projectItemId: 'item-1',
        action: 'check',
      }),
    ).resolves.toEqual(['item-1', 'check', undefined]);
  });
});
