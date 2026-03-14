import { z } from "zod";

import type { BridgeResult } from "./bridge-client.js";

export type CommandExecutor = {
  sendCommand(
    action: string,
    params: Record<string, unknown>,
  ): Promise<BridgeResult>;
};

type PremiereToolDefinition<TSchema extends z.ZodTypeAny> = {
  name: string;
  title: string;
  description: string;
  action: string;
  inputSchema: TSchema;
};

const getProjectInfoSchema = z.object({});
const openProjectSchema = z.object({
  path: z.string().trim().min(1),
});
const importMediaSchema = z.object({
  paths: z.array(z.string().min(1)).min(1),
  importMode: z.enum(["reference-only"]).default("reference-only"),
});
const createSequenceSchema = z.object({
  name: z.string().trim().min(1),
  presetPath: z.string().trim().min(1).optional(),
  mediaPath: z.string().trim().min(1).optional(),
});
const addClipToTimelineSchema = z.object({
  mediaPath: z.string().trim().min(1),
  trackIndex: z.number().int().min(0),
  startTime: z.number().min(0),
});
const exportSequenceSchema = z.object({
  outputPath: z.string().trim().min(1),
});

export const premiereToolDefinitions = [
  {
    name: "premiere_get_project_info",
    title: "Get Premiere Project Info",
    description: "Return the active Premiere project and sequence summary.",
    action: "get_project_info",
    inputSchema: getProjectInfoSchema,
  },
  {
    name: "premiere_open_project",
    title: "Open Premiere Project",
    description: "Open a Premiere project document from a given path.",
    action: "open_project",
    inputSchema: openProjectSchema,
  },
  {
    name: "premiere_import_media",
    title: "Import Media into Premiere",
    description: "Import one or more media files into the active Premiere project.",
    action: "import_media",
    inputSchema: importMediaSchema,
  },
  {
    name: "premiere_create_sequence",
    title: "Create Premiere Sequence",
    description:
      "Create a new sequence in the active Premiere project, optionally deriving settings from an imported media item.",
    action: "create_sequence",
    inputSchema: createSequenceSchema,
  },
  {
    name: "premiere_add_clip_to_timeline",
    title: "Add Clip to Premiere Timeline",
    description:
      "Insert an imported media item into the active Premiere sequence timeline.",
    action: "add_clip_to_timeline",
    inputSchema: addClipToTimelineSchema,
  },
  {
    name: "premiere_export_sequence",
    title: "Export Premiere Sequence",
    description: "Send the active Premiere sequence to Adobe Media Encoder.",
    action: "export_sequence",
    inputSchema: exportSequenceSchema,
  },
] as const satisfies readonly PremiereToolDefinition<z.ZodTypeAny>[];

export async function executePremiereTool(
  name: string,
  args: unknown,
  executor: CommandExecutor,
): Promise<BridgeResult> {
  const tool = premiereToolDefinitions.find((candidate) => candidate.name === name);

  if (!tool) {
    throw new Error(`Unknown Premiere tool: ${name}`);
  }

  const parsedArgs = tool.inputSchema.parse(args ?? {});
  return executor.sendCommand(tool.action, parsedArgs);
}
