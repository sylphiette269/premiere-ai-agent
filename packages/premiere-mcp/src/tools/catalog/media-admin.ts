import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createMediaAdminToolCatalogSnapshot(options: {
  pluginManifestSchema: z.ZodSchema<any>;
}): ToolCatalogEntry[] {
  const { pluginManifestSchema } = options;

  return [
    {
      name: 'relink_media',
      description: 'Relinks an offline or moved media file to a new file path.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item to relink'),
        newFilePath: z.string().describe('The new absolute file path to relink to'),
      }),
    },
    {
      name: 'delete_project_item',
      description: 'Deletes a project item from the project, routing bins, sequences, and footage through the safest available host API.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item to delete'),
        allowReferenced: z.boolean().optional().describe('Allow deleting a project item even if clips in the project still reference it'),
      }),
    },
    {
      name: 'set_color_label',
      description: 'Sets the color label on a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
        colorIndex: z.number().describe('Color label index 0-15 (0=Violet, 1=Iris, 2=Caribbean, 3=Lavender, 4=Cerulean, 5=Forest, 6=Rose, 7=Mango, 8=Purple, 9=Blue, 10=Teal, 11=Magenta, 12=Tan, 13=Green, 14=Brown, 15=Yellow)'),
      }),
    },
    {
      name: 'get_color_label',
      description: 'Gets the color label index of a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
      }),
    },
    {
      name: 'get_metadata',
      description: 'Gets project metadata and XMP metadata for a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
      }),
    },
    {
      name: 'set_metadata',
      description: 'Sets a project metadata value on a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
        key: z.string().describe('The metadata key/field name'),
        value: z.string().describe('The metadata value to set'),
      }),
    },
    {
      name: 'get_footage_interpretation',
      description: 'Gets the footage interpretation settings (frame rate, pixel aspect ratio, field type, etc.) for a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
      }),
    },
    {
      name: 'set_footage_interpretation',
      description: 'Sets footage interpretation settings (frame rate, pixel aspect ratio) for a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
        frameRate: z.number().optional().describe('Override frame rate'),
        pixelAspectRatio: z.number().optional().describe('Override pixel aspect ratio'),
      }),
    },
    {
      name: 'check_offline_media',
      description: 'Checks all project items and returns a list of any that are offline (missing media).',
      inputSchema: z.object({}),
    },
    {
      name: 'export_as_fcp_xml',
      description: 'Exports a sequence as Final Cut Pro XML.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to export'),
        outputPath: z.string().describe('The absolute file path for the exported XML file'),
      }),
    },
    {
      name: 'undo',
      description: 'Performs an undo operation in Premiere Pro.',
      inputSchema: z.object({}),
    },
    {
      name: 'set_sequence_in_out_points',
      description: 'Sets the in and/or out points on a sequence timeline.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        inPoint: z.number().optional().describe('The in point in seconds'),
        outPoint: z.number().optional().describe('The out point in seconds'),
      }),
    },
    {
      name: 'get_sequence_in_out_points',
      description: 'Gets the in and out points of a sequence timeline.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
      }),
    },
    {
      name: 'export_aaf',
      description: 'Exports a sequence as an AAF file for interchange with other editing/audio applications.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence to export'),
        outputPath: z.string().describe('The absolute file path for the exported AAF file'),
        mixDownVideo: z.boolean().optional().describe('Whether to mix down video (default: true)'),
        explodeToMono: z.boolean().optional().describe('Whether to explode audio to mono (default: false)'),
        sampleRate: z.number().optional().describe('Audio sample rate (default: 48000)'),
        bitsPerSample: z.number().optional().describe('Audio bits per sample (default: 16)'),
      }),
    },
    {
      name: 'consolidate_duplicates',
      description: 'Consolidates duplicate media items in the project.',
      inputSchema: z.object({}),
    },
    {
      name: 'refresh_media',
      description: 'Refreshes the media for a project item, reloading it from disk.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item to refresh'),
      }),
    },
    {
      name: 'import_sequences_from_project',
      description: 'Imports sequences from another Premiere Pro project file.',
      inputSchema: z.object({
        projectPath: z.string().describe('The absolute path to the source .prproj file'),
        sequenceIds: z.array(z.string()).describe('Array of sequence IDs to import from the source project'),
      }),
    },
    {
      name: 'create_subsequence',
      description: 'Creates a subsequence from the in/out points of a sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the source sequence'),
        ignoreTrackTargeting: z.boolean().optional().describe('Whether to ignore track targeting (default: false)'),
      }),
    },
    {
      name: 'import_mogrt',
      description: 'Imports a Motion Graphics Template (.mogrt) file into a sequence.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        mogrtPath: z.string().describe('The absolute path to the .mogrt file'),
        time: z.number().describe('The time in seconds where the MOGRT should be placed'),
        videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
        audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)'),
      }),
    },
    {
      name: 'import_mogrt_from_library',
      description: 'Imports a Motion Graphics Template from a Creative Cloud Library.',
      inputSchema: z.object({
        sequenceId: z.string().describe('The ID of the sequence'),
        libraryName: z.string().describe('The name of the Creative Cloud Library'),
        mogrtName: z.string().describe('The name of the MOGRT in the library'),
        time: z.number().describe('The time in seconds where the MOGRT should be placed'),
        videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
        audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)'),
      }),
    },
    {
      name: 'plugin_list',
      description: 'Lists all registered third-party plugins and their enabled status.',
      inputSchema: z.object({}),
    },
    {
      name: 'plugin_register',
      description: 'Registers or updates a third-party plugin manifest.',
      inputSchema: pluginManifestSchema,
    },
    {
      name: 'plugin_set_enabled',
      description: 'Enables or disables a registered third-party plugin by id.',
      inputSchema: z.object({
        id: z.string().min(1).describe('The plugin id to update'),
        enabled: z.boolean().describe('Whether the plugin should be enabled'),
      }),
    },
    {
      name: 'plugin_call',
      description: 'Calls a registered plugin method through the Premiere bridge.',
      inputSchema: z.object({
        pluginId: z.string().min(1).describe('The registered plugin id'),
        method: z.string().min(1).describe('The plugin method to invoke'),
        params: z.record(z.unknown()).optional().describe('Optional method parameters'),
      }),
    },
    {
      name: 'manage_proxies',
      description: 'Checks proxy status, attaches a proxy file, or gets the proxy path for a project item.',
      inputSchema: z.object({
        projectItemId: z.string().describe('The ID of the project item'),
        action: z.enum(['check', 'attach', 'get_path']).describe('The proxy action: check status, attach a proxy, or get proxy path'),
        proxyPath: z.string().optional().describe('The absolute path to the proxy file (required for attach action)'),
      }),
    },
  ];
}
