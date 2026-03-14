import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createSequenceToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'create_sequence',
      description: 'Creates a new sequence in the project. A sequence is a timeline where you edit clips.',
      inputSchema: z.object({
        name: z.string().describe('The name for the new sequence'),
        presetPath: z.string().optional().describe('Optional path to a sequence preset file for custom settings'),
        mediaPath: z.string().optional().describe('Optional media path used to derive the sequence from an imported clip when host APIs support it'),
        avoidCreateNewSequence: z.boolean().optional().describe('Optional flag to skip the less reliable createNewSequence host API and prefer clip or preset based fallbacks'),
        width: z.number().optional().describe('Sequence width in pixels'),
        height: z.number().optional().describe('Sequence height in pixels'),
        frameRate: z.number().optional().describe('Frame rate (e.g., 24, 25, 30, 60)'),
        sampleRate: z.number().optional().describe('Audio sample rate (e.g., 48000)'),
      }),
    },
    {
      name: 'duplicate_sequence',
      description: 'Creates a copy of an existing sequence with a new name.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to duplicate'),
        newName: z.string().describe('The name for the new sequence copy'),
      }),
    },
    {
      name: 'delete_sequence',
      description: 'Deletes a sequence from the project.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to delete'),
      }),
    },
  ];
}
