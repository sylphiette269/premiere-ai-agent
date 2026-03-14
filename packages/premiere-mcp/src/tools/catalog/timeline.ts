import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createTimelineToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'add_to_timeline',
      description: 'Adds a media clip from the project panel to a sequence timeline at a specific track and time.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence (timeline) to add the clip to'),
        projectItemId: z.string().describe('The ID of the project item (clip) to add'),
        trackIndex: z.number().describe('The index of the video or audio track (0-based)'),
        time: z.number().describe('The time in seconds where the clip should be placed on the timeline'),
        insertMode: z.enum(['overwrite', 'insert']).optional().describe('Whether to overwrite existing content or insert and shift'),
      }),
    },
    {
      name: 'remove_from_timeline',
      description: 'Removes a clip from the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip on the timeline to remove'),
        deleteMode: z.enum(['ripple', 'lift']).optional().describe('Whether to ripple delete (close gap) or lift (leave gap)'),
      }),
    },
    {
      name: 'move_clip',
      description: 'Moves a clip to a different position on the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to move'),
        newTime: z.number().describe('The new time position in seconds'),
        newTrackIndex: z.number().optional().describe('The new track index (if moving to different track)'),
      }),
    },
    {
      name: 'trim_clip',
      description: 'Adjusts the in and out points of a clip on the timeline, effectively shortening it.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip on the timeline to trim'),
        inPoint: z.number().optional().describe('The new in point in seconds from the start of the clip'),
        outPoint: z.number().optional().describe('The new out point in seconds from the start of the clip'),
        duration: z.number().optional().describe('Alternative: set the desired duration in seconds'),
      }),
    },
    {
      name: 'split_clip',
      description: 'Splits a clip at a specific time point, creating two separate clips.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to split'),
        splitTime: z.number().describe('The absolute sequence time in seconds where to split the clip'),
      }),
    },
  ];
}
