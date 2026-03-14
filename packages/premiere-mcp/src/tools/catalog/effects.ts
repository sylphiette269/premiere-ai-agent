import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createEffectsToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'apply_effect',
      description: 'Applies a visual or audio effect to a specific clip on the timeline.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip to apply the effect to'),
        effectName: z.string().describe('The name of the effect to apply (e.g., "Gaussian Blur", "Lumetri Color")'),
        parameters: z.record(z.any()).optional().describe("Key-value pairs for the effect's parameters"),
      }),
    },
    {
      name: 'add_transition',
      description: 'Adds a transition (e.g., cross dissolve) between two adjacent clips on the timeline.',
      inputSchema: z.object({
        clipId1: z.string().describe('The ID of the first clip (outgoing)'),
        clipId2: z.string().describe('The ID of the second clip (incoming)'),
        transitionName: z.string().describe('The name of the transition to add (e.g., "Cross Dissolve")'),
        duration: z.number().describe('The duration of the transition in seconds'),
      }),
    },
    {
      name: 'add_transition_to_clip',
      description: 'Adds a transition to the beginning or end of a single clip.',
      inputSchema: z.object({
        clipId: z.string().describe('The ID of the clip'),
        transitionName: z.string().describe('The name of the transition'),
        position: z.enum(['start', 'end']).describe('Whether to add the transition at the start or end of the clip'),
        duration: z.number().describe('The duration of the transition in seconds'),
      }),
    },
    {
      name: 'inspect_transition_boundary',
      description: 'Diagnoses whether two clips can safely share a transition boundary before attempting a QE DOM transition insert.',
      inputSchema: z.object({
        clipId1: z.string().describe('The ID of the first clip to inspect'),
        clipId2: z.string().describe('The ID of the second clip to inspect'),
        duration: z.number().optional().describe('Optional transition duration in seconds to preview the computed frame count for the resolved sequence'),
      }),
    },
    {
      name: 'inspect_track_transition_boundaries',
      description: 'Inspects every adjacent clip boundary on a sequence track and reports which boundaries are safe for shared transitions.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to inspect'),
        trackIndex: z.number().describe('The zero-based track index to inspect'),
        trackType: z.enum(['video', 'audio']).optional().describe('Which track type to inspect (default: video)'),
        duration: z.number().optional().describe('Optional transition duration in seconds to preview computed frame counts'),
      }),
    },
    {
      name: 'safe_batch_add_transitions',
      description: 'Inspects a track first, then adds shared transitions only on safe adjacent boundaries while returning skipped and failed boundary details.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to process'),
        trackIndex: z.number().describe('The zero-based track index to process'),
        transitionName: z.string().describe('The name of the transition to add where boundaries are safe'),
        duration: z.number().describe('The duration of the transition in seconds'),
        trackType: z.enum(['video', 'audio']).optional().describe('Which track type to process (default: video)'),
      }),
    },
  ];
}
