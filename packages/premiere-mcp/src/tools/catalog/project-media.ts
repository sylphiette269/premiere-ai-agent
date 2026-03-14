import { z } from 'zod';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export function createProjectMediaToolCatalogSnapshot(options: {
  referenceOnlyMediaPolicy: string;
}): ToolCatalogEntry[] {
  const { referenceOnlyMediaPolicy } = options;

  return [
    {
      name: 'create_project',
      description: 'Creates a new Adobe Premiere Pro project. Use this when the user wants to start a new video editing project from scratch.',
      inputSchema: z.object({
        name: z.string().describe('The name for the new project, e.g., "My Summer Vacation"'),
        location: z.string().describe('The absolute directory path where the project file should be saved, e.g., "/Users/user/Documents/Videos"'),
      }),
    },
    {
      name: 'open_project',
      description: 'Opens an existing Adobe Premiere Pro project from a specified file path.',
      inputSchema: z.object({
        path: z.string().describe('The absolute path to the .prproj file to open'),
      }),
    },
    {
      name: 'save_project',
      description: 'Saves the currently active Adobe Premiere Pro project.',
      inputSchema: z.object({}),
    },
    {
      name: 'save_project_as',
      description: 'Saves the current project with a new name and location.',
      inputSchema: z.object({
        name: z.string().describe('The new name for the project'),
        location: z.string().describe('The absolute directory path where the project should be saved'),
      }),
    },
    {
      name: 'import_media',
      description: 'Imports a media file (video, audio, image) into the current Premiere Pro project by reference without copying the source file.',
      inputSchema: z.object({
        filePath: z.string().describe('The absolute path to the media file to import'),
        binName: z.string().optional().describe('The name of the bin to import the media into. If not provided, it will be imported into the root.'),
        importMode: z.enum([referenceOnlyMediaPolicy]).optional().describe('Import mode. Defaults to reference-only and must not duplicate source media.'),
      }),
    },
    {
      name: 'import_folder',
      description: 'Imports all media files from a folder into the current Premiere Pro project.',
      inputSchema: z.object({
        folderPath: z.string().describe('The absolute path to the folder containing media files'),
        binName: z.string().optional().describe('The name of the bin to import the media into'),
        recursive: z.boolean().optional().describe('Whether to import from subfolders recursively'),
      }),
    },
    {
      name: 'create_bin',
      description: 'Creates a new bin (folder) in the project panel to organize media.',
      inputSchema: z.object({
        name: z.string().describe('The name for the new bin'),
        parentBinName: z.string().optional().describe('The name of the parent bin to create this bin inside'),
      }),
    },
  ];
}
