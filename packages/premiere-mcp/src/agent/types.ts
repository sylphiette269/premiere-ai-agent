import type { VerificationResult } from '../bridge/types.js';
import type {
  EditingBlueprint,
  OnFailureStrategy,
  TaskScenario,
} from '../tools/catalog/agent-orchestration.types.js';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'skipped';

export interface ExecutionStep {
  id: string;
  title: string;
  tool: string;
  purpose: string;
  status: StepStatus;
  retryCount: number;
  maxRetries: number;
  retryableOnly: boolean;
  required: boolean;
  onFailure: OnFailureStrategy;
  dependsOn: string[];
  requiresVerification: boolean;
  phase: 'research' | 'planning' | 'execution' | 'verification' | 'review';
  result?: unknown;
  verificationResult?: VerificationResult;
  error?: {
    error_code: string;
    message: string;
    retryable: boolean;
  };
  startedAt?: number;
  finishedAt?: number;
}

export interface ExecutionState {
  goal: string;
  scenario: TaskScenario;
  researchGatePassed: boolean;
  steps: ExecutionStep[];
  currentStepIndex: number;
  aborted: boolean;
  abortReason?: string;
  completed: boolean;
  blueprint?: EditingBlueprint;
  successCriteria: string[];
  createdAt: number;
}

export interface StepExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: {
    error_code: string;
    message: string;
    retryable: boolean;
  };
  verification?: VerificationResult;
}
