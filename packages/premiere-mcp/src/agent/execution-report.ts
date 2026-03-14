import { checkCompletionStatus } from './runtime.js';
import type { ExecutionState } from './types.js';

export interface ExecutionReport {
  goal: string;
  scenario: string;
  finalOutcome: 'success' | 'partial' | 'failed' | 'aborted';
  canDeliver: boolean;
  stepsSummary: Array<{
    id: string;
    title: string;
    tool: string;
    status: string;
    retryCount: number;
    durationMs?: number;
    error?: string;
  }>;
  unmetCriteria: string[];
  blueprintUsed: boolean;
  nextAction?: string;
  totalDurationMs: number;
}

export function generateExecutionReport(state: ExecutionState): ExecutionReport {
  const stepsSummary = state.steps.map((step) => ({
    id: step.id,
    title: step.title,
    tool: step.tool,
    status: step.status,
    retryCount: step.retryCount,
    durationMs:
      step.startedAt !== undefined && step.finishedAt !== undefined
        ? step.finishedAt - step.startedAt
        : undefined,
    error: step.error?.message,
  }));
  const { canDeliver, unmetCriteria, status } = checkCompletionStatus(state);

  let finalOutcome: ExecutionReport['finalOutcome'];
  if (state.aborted) {
    finalOutcome = 'aborted';
  } else if (status === 'success') {
    finalOutcome = 'success';
  } else if (status === 'failed') {
    finalOutcome = 'failed';
  } else {
    finalOutcome = 'partial';
  }

  let nextAction: string | undefined;
  if (state.aborted) {
    nextAction = `任务已中止: ${state.abortReason}`;
  } else if (!canDeliver) {
    nextAction = `任务未满足交付条件: ${unmetCriteria.join('; ')}`;
  }

  return {
    goal: state.goal,
    scenario: state.scenario,
    finalOutcome,
    canDeliver,
    stepsSummary,
    unmetCriteria,
    blueprintUsed: Boolean(state.blueprint),
    nextAction,
    totalDurationMs: Date.now() - state.createdAt,
  };
}
