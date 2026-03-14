export type ResearchPlatform = 'bilibili' | 'douyin';

export type SearchPlatform = ResearchPlatform | 'all';

export interface ReferenceCandidate {
  id: string;
  platform: ResearchPlatform;
  title: string;
  url: string;
  snippet?: string;
  author?: string;
  searchQuery?: string;
  searchRank?: number;
  durationSeconds?: number;
  engagement?: {
    views?: number;
    likes?: number;
    comments?: number;
  };
}

export interface RankedReferenceCandidate extends ReferenceCandidate {
  score: number;
  reasons: string[];
}

export interface ReferenceSet {
  taskId: string;
  goal: string;
  query?: string;
  selected: ReferenceCandidate[];
  confirmedAt: string;
}

export interface IngestAssetInput {
  candidateId: string;
  localPath: string;
  captionPath?: string;
}

export interface ManagedReferenceAsset {
  candidateId: string;
  platform: ResearchPlatform;
  title: string;
  sourceUrl: string;
  originalPath: string;
  managedPath: string;
  captionPath?: string;
  copiedAt: string;
  cleanupPolicy: 'delete_managed_copy_after_extract';
  status: 'ready' | 'analyzed';
  managedPathDeleted?: boolean;
}

export interface MediaProbeResult {
  durationSeconds: number;
  width?: number;
  height?: number;
  frameRate?: number;
  sceneCount?: number;
}

export interface CaptionCue {
  startSeconds?: number;
  endSeconds?: number;
  text: string;
}

export interface CaptionAnalysis {
  path?: string;
  text: string;
  cues: CaptionCue[];
}

export interface ReferenceSignal {
  candidateId: string;
  platform: ResearchPlatform;
  title: string;
  sourceUrl: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  sceneCount?: number;
  averageShotDuration: number;
  pacing: 'fast' | 'medium' | 'slow';
  hookStyle: 'direct_hook' | 'visual_hook';
  subtitleStyle: 'caption_heavy' | 'caption_light' | 'unknown';
  subtitleDensityPerMinute: number;
  transitionStyle: 'hard_cut' | 'mixed' | 'slow_mix';
  ctaPattern: 'end_screen' | 'spoken_prompt' | 'none';
  signalSources: string[];
}

export interface AggregatedBlueprint {
  hookStyle: string;
  averageShotDuration: number;
  pacingCurve: string;
  transitionPattern: string[];
  textOverlayStyle: string;
  musicBeatStrategy: string;
  ctaPattern: string;
  avoidPatterns: string[];
  referenceCount: number;
  targetPlatform?: string;
  targetDurationRange?: [number, number];
}

export interface SearchBingHtmlResultsInput {
  html: string;
  platform: SearchPlatform;
  query: string;
  limit: number;
}

export interface ResearchServiceOptions {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  probeMedia?: (filePath: string) => Promise<MediaProbeResult>;
}
