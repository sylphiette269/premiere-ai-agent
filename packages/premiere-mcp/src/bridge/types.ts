export interface PremiereProject {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
  sequences: PremiereSequence[];
  projectItems: PremiereItem[];
}

export interface PremiereSequence {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  videoTracks: PremiereTrack[];
  audioTracks: PremiereTrack[];
}

export interface PremiereTrack {
  id: string;
  name: string;
  type: "video" | "audio";
  clips: PremiereClip[];
}

export interface PremiereClip {
  id: string;
  name: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  mediaPath?: string;
  trackType?: "video" | "audio";
  trackIndex?: number;
  clipIndex?: number;
  placedClips?: Array<{
    id: string;
    name: string;
    inPoint: number;
    outPoint: number;
    duration: number;
    mediaPath?: string;
    trackType?: "video" | "audio";
    trackIndex?: number;
    clipIndex?: number;
  }>;
}

export interface PremiereItem {
  id: string;
  name: string;
  type: "footage" | "sequence" | "bin";
  mediaPath?: string;
  duration?: number;
  frameRate?: number;
}

export interface PremiereSequenceSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
}

export interface PremiereSequenceCreateOptions {
  mediaPath?: string;
  avoidCreateNewSequence?: boolean;
}

export interface SessionContext {
  projectPath?: string;
}

export type VerificationLevel =
  | 'exists'
  | 'matched'
  | 'partial'
  | 'mismatch'
  | 'missing';

export interface VerificationResultFieldMismatch {
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface VerificationResult {
  confirmed: boolean;
  verificationLevel: VerificationLevel;
  readBackTool?: string;
  readBackResult?: unknown;
  expected?: Record<string, unknown>;
  mismatch?: string;
  mismatchFields?: VerificationResultFieldMismatch[];
  verificationDurationMs?: number;
}
