import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createBatchAssemblyToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'batch_add_transitions',
      description: 'Adds a transition to all clip boundaries on a track. Useful for quickly adding cross dissolves or other transitions between every clip.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackIndex: z.number().describe('The track index (0-based)'),
        trackType: z.enum(['video', 'audio']).optional().describe('Whether to add transitions on a video or audio track. Defaults to video.'),
        transitionName: z.string().describe('The name of the transition (e.g., "Cross Dissolve")'),
        duration: z.number().describe('The duration of each transition in seconds'),
      }),
    },
    {
      name: 'batch_apply_effect',
      description: 'Applies an effect to all clips on a track across one or more sequences.',
      inputSchema: z.object({
        sequenceIds: z.array(z.string()).describe('List of sequence IDs to process. Use ["*"] to apply to all sequences.'),
        trackIndex: z.number().describe('The video track index (0-based) to target.'),
        effectName: z.string().describe('The name of the effect to apply (e.g., "Lumetri Color", "Gaussian Blur").'),
        parameters: z.record(z.any()).optional().describe('Optional effect parameters to set.'),
      }),
    },
    {
      name: 'batch_export',
      description: 'Exports multiple sequences to files. Useful for rendering several cuts at once.',
      inputSchema: z.object({
        exports: z.array(z.object({
          sequenceId: z.string().describe('The sequence ID to export.'),
          outputPath: z.string().describe('The output file path.'),
          format: z.string().optional().describe('Export format (e.g., "H.264").'),
          presetPath: z.string().optional().describe('Path to an export preset file.'),
        })).describe('List of export jobs to run.'),
      }),
    },
    {
      name: 'batch_color_correct',
      description: 'Applies the same color correction adjustments to all clips on a track across one or more sequences.',
      inputSchema: z.object({
        sequenceIds: z.array(z.string()).describe('List of sequence IDs to process. Use ["*"] to apply to all sequences.'),
        trackIndex: z.number().describe('The video track index (0-based) to target.'),
        adjustments: z.object({
          brightness: z.number().optional(),
          contrast: z.number().optional(),
          saturation: z.number().optional(),
          hue: z.number().optional(),
          temperature: z.number().optional(),
        }).describe('Color correction adjustments to apply.'),
      }),
    },
    {
      name: 'find_project_item_by_name',
      description: 'Searches for project items by name. Useful for finding media files, sequences, or bins.',
      inputSchema: z.object({
        name: z.string().describe('The name to search for (case-insensitive partial match)'),
        type: z.enum(['footage', 'sequence', 'bin', 'any']).optional().describe('Filter by item type'),
      }),
    },
    {
      name: 'move_item_to_bin',
      description: 'Moves a project item into a different bin (folder).',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item to move'),
        targetBinId: z.string().describe('The ID of the destination bin'),
      }),
    },
    {
      name: 'set_active_sequence',
      description: 'Sets the active sequence in the project.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to activate'),
      }),
    },
    {
      name: 'get_active_sequence',
      description: 'Gets information about the currently active sequence.',
      inputSchema: z.object({}),
    },
    {
      name: 'get_clip_at_position',
      description: 'Gets the clip at a specific time position on a track.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackType: z.enum(['video', 'audio']).describe('The type of track'),
        trackIndex: z.number().describe('The track index (0-based)'),
        time: z.number().describe('The time position in seconds'),
      }),
    },
    {
      name: 'auto_reframe_sequence',
      description: 'Automatically reframes a sequence to a new aspect ratio using AI-powered motion tracking.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to reframe'),
        numerator: z.number().describe('Aspect ratio numerator (e.g., 9 for 9:16)'),
        denominator: z.number().describe('Aspect ratio denominator (e.g., 16 for 9:16)'),
        motionPreset: z.enum(['slower', 'default', 'faster']).optional().describe('Motion tracking speed preset'),
        newName: z.string().optional().describe('Name for the reframed sequence'),
      }),
    },
    {
      name: 'detect_scene_edits',
      description: 'Detects scene changes in selected clips and optionally adds cuts or markers.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        action: z.enum(['ApplyCuts', 'CreateMarkers']).optional().describe('Action to take at detected edit points'),
        applyCutsToLinkedAudio: z.boolean().optional().describe('Whether to apply cuts to linked audio'),
        sensitivity: z.string().optional().describe('Detection sensitivity (e.g., "Low", "Medium", "High")'),
      }),
    },
    {
      name: 'create_caption_track',
      description: 'Creates a caption track from a caption/subtitle file.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        projectItemId: z.string().describe('The ID of the caption file project item'),
        startTime: z.number().optional().describe('Start time in seconds for the captions'),
        captionFormat: z.string().optional().describe('Caption format (e.g., "Subtitle Default")'),
      }),
    },
    {
      name: 'generate_subtitles',
      description: 'Generates subtitles for an audio or video file using either a local faster-whisper backend or the OpenAI Whisper API, writes an SRT file, imports it into the project, and optionally creates a caption track on the timeline.',
      inputSchema: z.object({
        audioPath: z.string().describe('Absolute path to the audio or video file to transcribe.'),
        sequenceId: z.string().optional().describe('If provided, creates a caption track on this sequence after generating subtitles.'),
        language: z.string().optional().describe('Optional language code (e.g., "zh", "en", "ja"). Auto-detected if omitted.'),
        outputSrtPath: z.string().optional().describe('Optional path to save the SRT file. Defaults to a temp file.'),
        captionFormat: z.string().optional().describe('Caption format for Premiere (e.g., "Subtitle Default"). Defaults to "Subtitle Default".'),
        backend: z.enum(['auto', 'openai', 'faster-whisper']).optional().describe('Subtitle backend selection. Defaults to auto, which tries faster-whisper first and falls back to OpenAI when an API key is available.'),
        fasterWhisperModel: z.string().optional().describe('Optional faster-whisper model size or local model path for the local backend.'),
        apiKey: z.string().optional().describe('OpenAI API key for the OpenAI backend or auto fallback. Falls back to OPENAI_API_KEY environment variable.'),
      }),
    },
    {
      name: 'create_subclip',
      description: 'Creates a subclip from a project item with specified in/out points.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the source project item'),
        name: z.string().describe('Name for the subclip'),
        startTime: z.number().describe('In point in seconds'),
        endTime: z.number().describe('Out point in seconds'),
        hasHardBoundaries: z.boolean().optional().describe('Whether boundaries are hard (cannot be extended)'),
        takeAudio: z.boolean().optional().describe('Whether to include audio (default: true)'),
        takeVideo: z.boolean().optional().describe('Whether to include video (default: true)'),
      }),
    },
  ];
}
