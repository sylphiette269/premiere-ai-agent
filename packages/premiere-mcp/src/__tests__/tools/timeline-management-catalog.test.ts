import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { createTimelineManagementToolCatalogSnapshot } from '../../tools/catalog/timeline-management.js';

const keyframeValueSchema = z.union([
  z.number(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
]);

function getSchemaShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  if ('shape' in schema && typeof schema.shape === 'object') {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }

  const effectSchema = (schema as { _def?: { schema?: z.ZodTypeAny } })._def?.schema;
  if (effectSchema && 'shape' in effectSchema && typeof effectSchema.shape === 'object') {
    return effectSchema.shape as Record<string, z.ZodTypeAny>;
  }

  throw new Error('Expected a schema with an object shape');
}

describe('createTimelineManagementToolCatalogSnapshot()', () => {
  it('returns timeline management tool names in stable order', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'add_marker',
      'delete_marker',
      'update_marker',
      'list_markers',
      'add_track',
      'delete_track',
      'lock_track',
      'toggle_track_visibility',
      'link_audio_video',
      'apply_audio_effect',
      'duplicate_clip',
      'reverse_clip',
      'enable_disable_clip',
      'replace_clip',
      'get_sequence_settings',
      'set_sequence_settings',
      'get_clip_properties',
      'get_clip_effects',
      'inspect_clip_components',
      'set_clip_properties',
      'add_to_render_queue',
      'get_render_queue_status',
      'stabilize_clip',
      'speed_change',
      'get_playhead_position',
      'set_playhead_position',
      'get_selected_clips',
      'list_available_effects',
      'list_available_transitions',
      'list_available_audio_effects',
      'list_available_audio_transitions',
      'add_keyframe',
      'set_keyframe_interpolation',
      'remove_keyframe',
      'get_keyframes',
      'set_work_area',
      'get_work_area',
      'build_timeline_from_xml',
    ]);
  });

  it('keeps representative schemas aligned with the current parameters', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });
    const setClipPropertiesTool = tools.find(
      (tool) => tool.name === 'set_clip_properties',
    );
    const addKeyframeTool = tools.find((tool) => tool.name === 'add_keyframe');
    const inspectClipComponentsTool = tools.find(
      (tool) => tool.name === 'inspect_clip_components',
    );
    const buildTimelineFromXmlTool = tools.find(
      (tool) => tool.name === 'build_timeline_from_xml',
    );

    expect(
      setClipPropertiesTool?.inputSchema.safeParse({
        clipId: 'clip-1',
        properties: {
          opacity: 80,
          position: { x: 960, y: 540 },
        },
      }).success,
    ).toBe(true);

    expect(
      addKeyframeTool?.inputSchema.safeParse({
        clipId: 'clip-2',
        componentName: 'Motion',
        paramName: 'Position',
        time: 1.2,
        value: [960, 540],
      }).success,
    ).toBe(true);

    expect(
      inspectClipComponentsTool?.inputSchema.safeParse({
        trackIndex: 0,
        clipIndex: 0,
        trackType: 'video',
      }).success,
    ).toBe(true);

    expect(
      buildTimelineFromXmlTool?.inputSchema.safeParse({
        sequenceName: 'XML测试序列',
        clips: [
          {
            projectItemId: 'item-1',
            durationSec: 5,
            zoomFrom: 100,
            zoomTo: 115,
          },
        ],
        transitionDurationSec: 0.5,
        audioProjectItemId: 'audio-1',
        frameRate: 30,
        frameWidth: 1080,
        frameHeight: 1920,
      }).success,
    ).toBe(true);
  });

  it('retains optional interpolation on the add_keyframe schema', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });
    const addKeyframeTool = tools.find((tool) => tool.name === 'add_keyframe');

    const parsed = addKeyframeTool?.inputSchema.parse({
      clipId: 'clip-2',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 1.2,
      value: 110,
      interpolation: 'continuous_bezier',
    }) as Record<string, unknown>;

    expect(parsed.interpolation).toBe('continuous_bezier');
  });

  it('accepts propertyName aliases while still requiring one keyframe parameter field', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });

    const scenarios = [
      {
        toolName: 'add_keyframe',
        validArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          propertyName: 'Scale',
          time: 1.2,
          value: 110,
        },
        invalidArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          time: 1.2,
          value: 110,
        },
      },
      {
        toolName: 'set_keyframe_interpolation',
        validArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          propertyName: 'Scale',
          time: 1.2,
          interpolation: 'time',
        },
        invalidArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          time: 1.2,
          interpolation: 'time',
        },
      },
      {
        toolName: 'remove_keyframe',
        validArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          propertyName: 'Scale',
          time: 1.2,
        },
        invalidArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          time: 1.2,
        },
      },
      {
        toolName: 'get_keyframes',
        validArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
          propertyName: 'Scale',
        },
        invalidArgs: {
          clipId: 'clip-2',
          componentName: 'Motion',
        },
      },
    ] as const;

    for (const scenario of scenarios) {
      const tool = tools.find((entry) => entry.name === scenario.toolName);

      expect(tool?.inputSchema.safeParse(scenario.validArgs).success).toBe(true);
      expect(tool?.inputSchema.safeParse(scenario.invalidArgs).success).toBe(false);
    }
  });

  it('documents clip-relative time and scalar versus vector keyframe values', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });
    const addKeyframeTool = tools.find((tool) => tool.name === 'add_keyframe');
    const addKeyframeShape = getSchemaShape(addKeyframeTool?.inputSchema as z.ZodTypeAny);

    expect(addKeyframeShape.time.description).toContain('relative to the clip start');
    expect(addKeyframeShape.time.description).toContain('Do not pass sequence time');
    expect(addKeyframeShape.value.description).toContain('single number');
    expect(addKeyframeShape.value.description).toContain('[x, y]');
  });

  it('accepts interpolation-only updates for existing keyframes', () => {
    const tools = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });
    const setKeyframeInterpolationTool = tools.find(
      (tool) => tool.name === 'set_keyframe_interpolation',
    );

    const parsed = setKeyframeInterpolationTool?.inputSchema.parse({
      clipId: 'clip-2',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 1.2,
      interpolation: 'time',
    }) as Record<string, unknown>;

    expect(parsed.interpolation).toBe('time');
  });

  it('returns detached snapshots so later reads cannot be mutated by callers', () => {
    const first = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });
    first[0].name = 'mutated-management-tool';
    first.splice(1, 3);

    const second = createTimelineManagementToolCatalogSnapshot({
      keyframeValueSchema,
    });

    expect(second[0].name).toBe('add_marker');
    expect(second).toHaveLength(38);
  });
});
