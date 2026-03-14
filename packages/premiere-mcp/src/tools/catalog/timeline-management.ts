import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

function createKeyframeParameterSchema(
  shape: Record<string, z.ZodTypeAny>,
): z.ZodSchema<any> {
  return z.object({
    ...shape,
    paramName: z.string().optional().describe('The display name of the parameter'),
    propertyName: z.string().optional().describe('Alias for paramName. The display name of the parameter.'),
  }).refine(
    (value) => typeof value.paramName === 'string' || typeof value.propertyName === 'string',
    {
      message: 'paramName or propertyName is required',
      path: ['paramName'],
    },
  );
}

export function createTimelineManagementToolCatalogSnapshot(options: {
  keyframeValueSchema: z.ZodSchema<any>;
}): ToolCatalogEntry[] {
  const { keyframeValueSchema } = options;

  return [
    {
      name: 'add_marker',
      description: 'Adds a marker to the timeline for navigation or notes.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to add the marker to'),
        time: z.number().describe('The time in seconds where the marker should be placed'),
        name: z.string().describe('The name/label for the marker'),
        comment: z.string().optional().describe('Optional comment or description for the marker'),
        color: z.string().optional().describe('Marker color (e.g., "red", "green", "blue")'),
        duration: z.number().optional().describe('Duration in seconds for a span marker (0 for point marker)'),
      }),
    },
    {
      name: 'delete_marker',
      description: 'Deletes a marker from the timeline.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        markerId: z.string().describe('The ID of the marker to delete'),
      }),
    },
    {
      name: 'update_marker',
      description: "Updates an existing marker's properties.",
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        markerId: z.string().describe('The ID of the marker to update'),
        name: z.string().optional().describe('New name for the marker'),
        comment: z.string().optional().describe('New comment'),
        color: z.string().optional().describe('New color'),
      }),
    },
    {
      name: 'list_markers',
      description: 'Lists all markers in a sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'add_track',
      description: 'Adds a new video or audio track to the sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackType: z.enum(['video', 'audio']).describe('Type of track to add'),
        position: z.enum(['above', 'below']).optional().describe('Where to add the track relative to existing tracks'),
      }),
    },
    {
      name: 'delete_track',
      description: 'Deletes a track from the sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackType: z.enum(['video', 'audio']).describe('Type of track'),
        trackIndex: z.number().describe('The index of the track to delete'),
      }),
    },
    {
      name: 'lock_track',
      description: 'Locks or unlocks a track to prevent/allow editing.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackType: z.enum(['video', 'audio']).describe('Type of track'),
        trackIndex: z.number().describe('The index of the track'),
        locked: z.boolean().describe('Whether to lock (true) or unlock (false)'),
      }),
    },
    {
      name: 'toggle_track_visibility',
      description: 'Shows or hides a video track.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackIndex: z.number().describe('The index of the video track'),
        visible: z.boolean().describe('Whether to show (true) or hide (false)'),
      }),
    },
    {
      name: 'link_audio_video',
      description: 'Links or unlinks audio and video components of a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        linked: z.boolean().describe('Whether to link (true) or unlink (false)'),
      }),
    },
    {
      name: 'apply_audio_effect',
      description: 'Applies an audio effect to a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the audio clip'),
        effectName: z.string().describe('Name of the audio effect (e.g., "Compressor", "EQ", "Reverb")'),
        parameters: z.record(z.any()).optional().describe('Effect parameters'),
      }),
    },
    {
      name: 'duplicate_clip',
      description: 'Duplicates a clip on the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to duplicate'),
        offset: z.number().optional().describe('Time offset in seconds for the duplicate (default: places immediately after original)'),
      }),
    },
    {
      name: 'reverse_clip',
      description: 'Reverses the playback of a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to reverse'),
        maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch (default: true)'),
      }),
    },
    {
      name: 'enable_disable_clip',
      description: 'Enables or disables a clip on the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        enabled: z.boolean().describe('Whether to enable (true) or disable (false)'),
      }),
    },
    {
      name: 'replace_clip',
      description: 'Replaces a clip on the timeline with another media item.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to replace'),
        newProjectItemId: z.string().describe('The ID of the new project item to use'),
        preserveEffects: z.boolean().optional().describe('Whether to keep effects and settings (default: true)'),
      }),
    },
    {
      name: 'get_sequence_settings',
      description: 'Gets the settings for a sequence (resolution, framerate, etc.).',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'set_sequence_settings',
      description: 'Updates sequence settings.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        settings: z.object({
          width: z.number().optional().describe('Frame width'),
          height: z.number().optional().describe('Frame height'),
          frameRate: z.number().optional().describe('Frame rate'),
          pixelAspectRatio: z.number().optional().describe('Pixel aspect ratio'),
        }).describe('Settings to update'),
      }),
    },
    {
      name: 'get_clip_properties',
      description: 'Gets detailed properties of a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
      }),
    },
    {
      name: 'get_clip_effects',
      description: 'Lists the effect and intrinsic component stack applied to a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
      }),
    },
    {
      name: 'inspect_clip_components',
      description: 'Inspects the component and property stack for a clip by track and clip index on the active sequence.',
      inputSchema: z.object({
        trackIndex: z.number().describe('The zero-based track index on the active sequence'),
        clipIndex: z.number().describe('The zero-based clip index on the specified track'),
        trackType: z.enum(['video', 'audio']).optional().describe('Which track type to inspect (default: video)'),
      }),
    },
    {
      name: 'set_clip_properties',
      description: 'Sets properties of a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        properties: z.object({
          opacity: z.number().optional().describe('Opacity 0-100'),
          scale: z.number().optional().describe('Scale percentage'),
          rotation: z.number().optional().describe('Rotation in degrees'),
          position: z.object({
            x: z.number().optional(),
            y: z.number().optional(),
          }).optional().describe('Position coordinates'),
        }).describe('Properties to set'),
      }),
    },
    {
      name: 'add_to_render_queue',
      description: 'Adds a sequence to the Adobe Media Encoder render queue.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to render'),
        outputPath: z.string().describe('Output file path'),
        presetPath: z.string().optional().describe('Export preset file path'),
        startImmediately: z.boolean().optional().describe('Whether to start rendering immediately (default: false)'),
      }),
    },
    {
      name: 'get_render_queue_status',
      description: 'Reports whether render queue monitoring is available. This currently returns guidance for Adobe Media Encoder rather than live queue telemetry.',
      inputSchema: z.object({}),
    },
    {
      name: 'stabilize_clip',
      description: 'Applies Warp Stabilizer to a clip to reduce camera shake.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to stabilize'),
        smoothness: z.number().optional().describe('Stabilization smoothness (0-100)'),
      }),
    },
    {
      name: 'speed_change',
      description: 'Changes the playback speed of a clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        speed: z.number().describe('Speed multiplier (0.1 = 10% speed, 2.0 = 200% speed)'),
        maintainAudio: z.boolean().optional().describe('Whether to maintain audio pitch when changing speed'),
      }),
    },
    {
      name: 'get_playhead_position',
      description: 'Gets the current playhead (CTI) position in the specified sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'set_playhead_position',
      description: 'Sets the playhead (CTI) position in the specified sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        time: z.number().describe('The time in seconds to move the playhead to'),
      }),
    },
    {
      name: 'get_selected_clips',
      description: 'Gets all currently selected clips in the specified sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'list_available_effects',
      description: 'Lists all available video effects in Premiere Pro.',
      inputSchema: z.object({}),
    },
    {
      name: 'list_available_transitions',
      description: 'Lists all available video transitions in Premiere Pro.',
      inputSchema: z.object({}),
    },
    {
      name: 'list_available_audio_effects',
      description: 'Lists all available audio effects in Premiere Pro.',
      inputSchema: z.object({}),
    },
    {
      name: 'list_available_audio_transitions',
      description: 'Lists all available audio transitions in Premiere Pro.',
      inputSchema: z.object({}),
    },
    {
      name: 'add_keyframe',
      description: 'Adds a keyframe to a clip component parameter at a clip-relative time.',
      inputSchema: createKeyframeParameterSchema({
        clipId: z.string().describe('The ID of the clip'),
        componentName: z.string().describe('The display name of the component (e.g., "Motion", "Opacity")'),
        time: z.number().describe('Time in seconds, relative to the clip start (0 = first frame of the clip). Do not pass sequence time.'),
        value: keyframeValueSchema.describe('Keyframe value. Use a single number for Scale/Opacity/Rotation and [x, y] for Position/Anchor Point. Effect parameters may also accept host-supported numeric vectors.'),
        interpolation: z.enum(['linear', 'bezier', 'hold', 'time', 'continuous_bezier']).optional().describe('Optional host interpolation mode to apply at this keyframe. continuous_bezier falls back to host bezier mode because ExtendScript does not expose separate handle controls.'),
      }),
    },
    {
      name: 'set_keyframe_interpolation',
      description: 'Updates the interpolation mode for an existing keyframe without changing its value.',
      inputSchema: createKeyframeParameterSchema({
        clipId: z.string().describe('The ID of the clip'),
        componentName: z.string().describe('The display name of the component'),
        time: z.number().describe('Time in seconds, relative to the clip start (0 = first frame of the clip). Do not pass sequence time.'),
        interpolation: z.enum(['linear', 'bezier', 'hold', 'time', 'continuous_bezier']).describe('Requested interpolation mode. continuous_bezier falls back to host bezier mode because ExtendScript does not expose separate handle controls.'),
      }),
    },
    {
      name: 'remove_keyframe',
      description: 'Removes a keyframe from a clip component parameter at a specific time.',
      inputSchema: createKeyframeParameterSchema({
        clipId: z.string().describe('The ID of the clip'),
        componentName: z.string().describe('The display name of the component'),
        time: z.number().describe('Time in seconds, relative to the clip start (0 = first frame of the clip). Do not pass sequence time.'),
      }),
    },
    {
      name: 'get_keyframes',
      description: 'Gets all keyframes for a clip component parameter.',
      inputSchema: createKeyframeParameterSchema({
        clipId: z.string().describe('The ID of the clip'),
        componentName: z.string().describe('The display name of the component'),
      }),
    },
    {
      name: 'set_work_area',
      description: 'Sets the work area in/out points for a sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        inPoint: z.number().describe('The in point in seconds'),
        outPoint: z.number().describe('The out point in seconds'),
      }),
    },
    {
      name: 'get_work_area',
      description: 'Gets the work area in/out points for a sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'build_timeline_from_xml',
      description: 'Builds a timeline with transitions and zoom animations by generating FCP XML and importing it into Premiere Pro. More reliable than direct API calls on PP2025+.',
      inputSchema: z.object({
        sequenceName: z.string().describe('Name for the new sequence'),
        clips: z.array(z.object({
          projectItemId: z.string().describe('Project item ID from list_project_items'),
          durationSec: z.number().optional().describe('Duration in seconds (default 5)'),
          zoomFrom: z.number().optional().describe('Start scale %, relative to fit-to-frame size (default 100 when paired with zoomTo)'),
          zoomTo: z.number().optional().describe('End scale %, relative to fit-to-frame size (default 115 for zoom in, 100 for zoom out)'),
          centerFrom: z.tuple([z.number(), z.number()]).optional().describe('Optional start center position [x, y] in sequence pixels'),
          centerTo: z.tuple([z.number(), z.number()]).optional().describe('Optional end center position [x, y] in sequence pixels'),
          rotationFrom: z.number().optional().describe('Optional start rotation in degrees'),
          rotationTo: z.number().optional().describe('Optional end rotation in degrees'),
        })).min(1).describe('Ordered list of clips to add'),
        transitionDurationSec: z.number().optional().describe('Transition duration in seconds (default 0.5)'),
        audioProjectItemId: z.string().optional().describe('Project item ID for background audio'),
        frameRate: z.number().optional().describe('Frame rate (default 30)'),
        frameWidth: z.number().optional().describe('Target sequence frame width in pixels (defaults to active sequence width, then 1920)'),
        frameHeight: z.number().optional().describe('Target sequence frame height in pixels (defaults to active sequence height, then 1080)'),
        allowExperimentalMotion: z.boolean().optional().describe('Allows experimental center/rotation XML motion. Disabled by default because Premiere Pro may hang during XML import on PP2025+.'),
      }),
    },
  ];
}
