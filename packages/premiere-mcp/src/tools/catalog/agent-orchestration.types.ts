export type TaskScenario =
  | 'natural_language'
  | 'docx_guided'
  | 'reference_video'
  | 'viral_style';

export type OnFailureStrategy =
  | 'abort'
  | 'retry_once'
  | 'retry_twice'
  | 'read_state_then_retry'
  | 'skip_if_optional'
  | 'report_and_stop';

export interface PlanStep {
  id: string;
  title: string;
  tool: string;
  purpose: string;
  argsHint?: Record<string, unknown>;
  required: boolean;
  onFailure: OnFailureStrategy;
  retryPolicy?: {
    maxAttempts: number;
    retryableOnly: boolean;
  };
  dependsOn?: string[];
  requiresVerification?: boolean;
  phase?: 'research' | 'planning' | 'execution' | 'verification' | 'review';
}

export interface EditingBlueprint {
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

export interface ReferenceSample {
  id: string;
  title: string;
  platform: string;
  hookStyle: string;
  pacingNote: string;
  transitionPattern: string[];
  subtitleStyle: string;
  ctaPattern: string;
  sourceType: 'user_provided' | 'synthetic';
  source?: string;
}

export interface ReferencePatternAnalysis {
  dominantHooks: string[];
  pacingPatterns: string[];
  transitionPatterns: string[];
  subtitlePatterns: string[];
  ctaPatterns: string[];
  avoidPatterns: string[];
  recommendedPlatform: string;
  sampleCount: number;
}

export interface BlueprintReviewResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
}

export interface AgentTaskResult {
  ok: boolean;
  plan: {
    scenario: TaskScenario;
    prerequisites: string[];
    successCriteria: string[];
    warnings: string[];
    suggestedTools: string[];
    discouragedTools: string[];
    steps: PlanStep[];
    researchRequired: boolean;
    blueprint?: EditingBlueprint;
  };
  cannotPlan?: {
    reason: string;
    missingInfo: string[];
  };
}
