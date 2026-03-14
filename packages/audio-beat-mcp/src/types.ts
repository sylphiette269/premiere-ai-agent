export type BeatMethod = 'default' | 'onset' | 'plp';

export type AnalysisSensitivity = 'low' | 'medium' | 'high';

export interface EnergyPeak {
  time: number;
  strength: number;
}

export interface MusicBeatAnalysis {
  sourceAudioPath: string;
  duration: number;
  tempo: number;
  bpm: number;
  beatTimes: number[];
  beatCount: number;
  onsetTimes: number[];
  onsetCount: number;
  energyPeaks: EnergyPeak[];
  method: BeatMethod;
  sensitivity: AnalysisSensitivity;
  minGapSec: number;
}

export type EditingStyle =
  | 'marker_only'
  | 'beat_markers_and_scale'
  | 'drum_punch'
  | 'cut_on_beat';

export type MarkerSource = 'beat' | 'onset' | 'downbeat' | 'cut';

export interface MarkerPlanItem {
  timeSec: number;
  name: string;
  color: 'green' | 'red' | 'blue';
  comment?: string;
  source: MarkerSource;
}

export interface AnimationKeyframeStep {
  offsetSec: number;
  value: number;
  interpolation: 'linear' | 'bezier' | 'hold';
}

export interface AnimationPlanItem {
  triggerTimeSec: number;
  property: 'Scale';
  label: 'scale_pulse';
  intensity: 'normal' | 'strong';
  steps: AnimationKeyframeStep[];
}

export interface PremiereEditPlan {
  style: EditingStyle;
  bpm: number;
  beatCount: number;
  onsetCount: number;
  cutPoints: number[];
  markerPlan: MarkerPlanItem[];
  animationPlan: AnimationPlanItem[];
  notes: string[];
}

export interface PremiereToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
}

export interface PremiereCommandBatch {
  sequenceId: string;
  clipId?: string;
  toolCalls: PremiereToolCall[];
  counts: {
    markers: number;
    keyframes: number;
    interpolations: number;
  };
  warnings: string[];
}
