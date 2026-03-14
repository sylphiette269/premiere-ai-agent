import type {
  EditingBlueprint,
  TaskScenario,
} from './agent-orchestration.types.js';

export interface TimelineSnapshot {
  totalDuration: number;
  videoClips: Array<{
    id: string;
    duration: number;
    trackIndex: number;
    startTime: number;
    endTime: number;
  }>;
  audioClips: Array<{
    id: string;
    duration: number;
    trackIndex: number;
    startTime: number;
    endTime: number;
  }>;
  transitions: Array<{
    type: string;
    duration: number;
    position: number;
  }>;
  effects: Array<{
    name: string;
    clipId: string;
  }>;
  textLayers: Array<{
    text: string;
    startTime: number;
    duration: number;
  }>;
}

export interface CriticInput {
  goal: string;
  scenario: TaskScenario;
  sequenceId?: string;
  blueprint?: EditingBlueprint;
  editingBlueprintPath?: string;
  successCriteria?: string[];
  timelineData?: TimelineSnapshot;
}

export interface CriticResult {
  ok: true;
  critic: {
    passed: boolean;
    score: number;
    findings: string[];
    actionableFixes: string[];
    failedCriteria: string[];
    passedCriteria: string[];
    dimensions: {
      structure: number;
      pacing: number;
      transitions: number;
      styleFit: number;
      technicalQuality: number;
    };
  };
}
