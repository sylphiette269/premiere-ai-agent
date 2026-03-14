import { z } from 'zod';

export const platformSchema = z.enum(['bilibili', 'douyin']);

export const candidateSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional(),
  author: z.string().optional(),
  searchQuery: z.string().optional(),
  searchRank: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});

export const searchReferenceCandidatesInputSchema = z.object({
  query: z.string().min(1),
  platforms: z.array(platformSchema).min(1).default(['bilibili']),
  limit: z.number().int().positive().max(10).default(5),
});

export const rankReferenceCandidatesInputSchema = z.object({
  goal: z.string().min(1),
  candidates: z.array(candidateSchema).min(1),
  preferredPlatforms: z.array(platformSchema).optional(),
});

export const confirmReferenceSetInputSchema = z.object({
  goal: z.string().min(1),
  query: z.string().optional(),
  selectedCandidates: z.array(candidateSchema).min(1).max(5),
});

export const ingestReferenceAssetsInputSchema = z.object({
  taskId: z.string().min(1),
  assets: z.array(z.object({
    candidateId: z.string().min(1),
    localPath: z.string().min(1),
    captionPath: z.string().min(1).optional(),
  })).min(1).max(5),
});

export const extractReferenceSignalsInputSchema = z.object({
  taskId: z.string().min(1),
  cleanupManagedRawCopies: z.boolean().default(true),
});

export const aggregateStyleBlueprintInputSchema = z.object({
  taskId: z.string().min(1),
  targetPlatform: z.string().optional(),
  targetDurationSeconds: z.number().int().positive().optional(),
});
