import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createPostProductionToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'adjust_audio_levels',
      description: 'Adjusts the volume (gain) of an audio clip on the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the audio clip to adjust'),
        level: z.number().describe('The new audio level in decibels (dB). Can be positive or negative.'),
      }),
    },
    {
      name: 'add_audio_keyframes',
      description: 'Adds keyframes to audio levels for dynamic volume changes.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the audio clip'),
        keyframes: z.array(z.object({
          time: z.number().describe('Time in seconds'),
          level: z.number().describe('Audio level in dB'),
        })).describe('Array of keyframe data'),
      }),
    },
    {
      name: 'mute_track',
      description: 'Mutes or unmutes an entire audio track.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        trackIndex: z.number().describe('The index of the audio track'),
        muted: z.boolean().describe('Whether to mute (true) or unmute (false) the track'),
      }),
    },
    {
      name: 'add_text_overlay',
      description: 'Adds a text layer (title) over the video timeline. Requires a MOGRT (.mogrt) template file path for text graphics.',
      inputSchema: z.object({
        text: z.string().describe('The text content to display'),
        sequenceId: z.string().describe('The sequence to add the text to'),
        trackIndex: z.number().describe('The video track to place the text on'),
        startTime: z.number().describe('The time in seconds when the text should appear'),
        duration: z.number().describe('How long the text should remain on screen in seconds'),
        mogrtPath: z.string().optional().describe('Absolute path to a .mogrt template file (required for text overlays)'),
      }),
    },
    {
      name: 'color_correct',
      description: 'Applies basic color correction adjustments to a video clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to color correct'),
        brightness: z.number().optional().describe('Brightness adjustment (-100 to 100)'),
        contrast: z.number().optional().describe('Contrast adjustment (-100 to 100)'),
        saturation: z.number().optional().describe('Saturation adjustment (-100 to 100)'),
        hue: z.number().optional().describe('Hue adjustment in degrees (-180 to 180)'),
        highlights: z.number().optional().describe('Adjustment for the brightest parts of the image (-100 to 100)'),
        shadows: z.number().optional().describe('Adjustment for the darkest parts of the image (-100 to 100)'),
        temperature: z.number().optional().describe('Color temperature adjustment (-100 to 100)'),
        tint: z.number().optional().describe('Tint adjustment (-100 to 100)'),
      }),
    },
    {
      name: 'apply_lut',
      description: 'Applies a Look-Up Table (LUT) to a clip for color grading.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        lutPath: z.string().describe('The absolute path to the .cube or .3dl LUT file'),
        intensity: z.number().optional().describe('LUT intensity (0-100)'),
      }),
    },
    {
      name: 'export_sequence',
      description: 'Renders and exports a sequence to a video file. This is for creating the final video.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to export'),
        outputPath: z.string().describe('The absolute path where the final video file will be saved'),
        presetPath: z.string().optional().describe('Optional path to an export preset file (.epr) for specific settings'),
        format: z.enum(['mp4', 'mov', 'avi', 'h264', 'prores']).optional().describe('The export format or codec'),
        quality: z.enum(['low', 'medium', 'high', 'maximum']).optional().describe('Export quality setting'),
        resolution: z.string().optional().describe('Export resolution (e.g., "1920x1080", "3840x2160")'),
      }),
    },
    {
      name: 'export_frame',
      description: 'Exports a single frame from a sequence as an image file.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        time: z.number().describe('The time in seconds to export the frame from'),
        outputPath: z.string().describe('The absolute path where the image file will be saved'),
        format: z.enum(['png', 'jpg', 'tiff']).optional().describe('The image format'),
      }),
    },
  ];
}
