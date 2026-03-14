import type { VerificationResult } from '../bridge/types.js';
import {
  checkResearchGate,
} from '../tools/catalog/agent-orchestration.js';
import type { AgentTaskResult, EditingBlueprint } from '../tools/catalog/agent-orchestration.types.js';
import type {
  ExecutionState,
  ExecutionStep,
  StepExecutionResult,
  StepStatus,
} from './types.js';

export function createExecutionState(
  plan: AgentTaskResult['plan'],
  goal: string,
): ExecutionState {
  return {
    goal,
    scenario: plan.scenario,
    researchGatePassed: !plan.researchRequired,
    steps: plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      tool: step.tool,
      purpose: step.purpose,
      status: 'pending' as StepStatus,
      retryCount: 0,
      maxRetries: step.retryPolicy?.maxAttempts ?? 1,
      retryableOnly: step.retryPolicy?.retryableOnly ?? true,
      required: step.required,
      onFailure: step.onFailure,
      dependsOn: step.dependsOn ?? [],
      requiresVerification: step.requiresVerification ?? false,
      phase: step.phase ?? 'execution',
    })),
    currentStepIndex: 0,
    aborted: false,
    completed: false,
    successCriteria: plan.successCriteria,
    createdAt: Date.now(),
  };
}

export function getNextStep(state: ExecutionState): ExecutionStep | null {
  if (state.aborted || state.completed) {
    return null;
  }

  for (let index = state.currentStepIndex; index < state.steps.length; index += 1) {
    const step = state.steps[index];
    if (step.status !== 'pending') {
      continue;
    }

    const dependencies = step.dependsOn.map((depId) =>
      state.steps.find((candidate) => candidate.id === depId),
    );
    const dependencyFailed = dependencies.some(
      (dependency) =>
        dependency && (dependency.status === 'failed' || dependency.status === 'blocked'),
    );
    if (dependencyFailed) {
      step.status = 'blocked';
      step.error = {
        error_code: 'DEPENDENCY_FAILED',
        message: `前置步骤未成功: ${step.dependsOn.join(', ')}`,
        retryable: false,
      };
      continue;
    }
    const dependenciesSatisfied = dependencies.every(
      (dependency) =>
        dependency && (dependency.status === 'done' || dependency.status === 'skipped'),
    );
    if (!dependenciesSatisfied && step.dependsOn.length > 0) {
      continue;
    }

    if (step.phase === 'execution' && !state.researchGatePassed) {
      const gateResult = checkResearchGate({
        scenario: state.scenario,
        completedSteps: state.steps
          .filter((candidate) => candidate.status === 'done')
          .map((candidate) => candidate.tool),
        blueprint: state.blueprint,
      });
      if (!gateResult.passed) {
        return null;
      }
      state.researchGatePassed = true;
    }

    step.status = 'running';
    step.startedAt ??= Date.now();
    state.currentStepIndex = index;
    return step;
  }

  const allDone = state.steps.every(
    (step) => step.status === 'done' || step.status === 'skipped',
  );
  if (allDone) {
    state.completed = true;
  }

  return null;
}

function completeStep(
  state: ExecutionState,
  step: ExecutionStep,
  result: StepExecutionResult,
): { action: 'continue' | 'retry' | 'abort' | 'report_and_stop'; reason?: string } {
  step.status = 'done';
  step.result = result.data;
  step.finishedAt = Date.now();

  if (step.requiresVerification && result.verification) {
    step.verificationResult = result.verification;
    if (!result.verification.confirmed) {
      step.status = 'failed';
      step.error = {
        error_code: 'VERIFICATION_FAILED',
        message: result.verification.mismatch ?? '写后验证不通过',
        retryable: false,
      };
      return handleStepFailure(state, step);
    }
  }

  if (
    (step.tool === 'extract_editing_blueprint' || step.tool === 'load_editing_blueprint') &&
    result.data
  ) {
    state.blueprint = (result.data as { blueprint?: EditingBlueprint }).blueprint
      ?? (result.data as EditingBlueprint);
  }

  if (step.tool === 'critic_edit_result') {
    const criticResult = result.data as
      | { critic?: { passed?: boolean } }
      | undefined;
    if (criticResult?.critic?.passed === false) {
      step.status = 'failed';
      step.error = {
        error_code: 'CRITIC_FAILED',
        message: 'critic 审稿未通过',
        retryable: false,
      };
      return handleStepFailure(state, step);
    }
  }

  return { action: 'continue' };
}

export function handleStepResult(
  state: ExecutionState,
  stepId: string,
  result: StepExecutionResult,
): { action: 'continue' | 'retry' | 'abort' | 'report_and_stop'; reason?: string } {
  const step = state.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return { action: 'abort', reason: `步骤 ${stepId} 不存在` };
  }

  if (result.ok) {
    return completeStep(state, step, result);
  }

  step.finishedAt = Date.now();
  step.error = result.error ?? {
    error_code: 'UNKNOWN',
    message: 'Unknown error',
    retryable: false,
  };
  step.status = 'failed';

  return handleStepFailure(state, step);
}

function handleStepFailure(
  state: ExecutionState,
  step: ExecutionStep,
): { action: 'continue' | 'retry' | 'abort' | 'report_and_stop'; reason?: string } {
  const error = step.error!;
  const hardStopCodes = [
    'ASSEMBLY_BLOCKED',
    'TOOL_DISABLED',
    'CRITIC_FAILED',
    'STYLE_MISMATCH',
    'VERIFICATION_FAILED',
  ];

  if (hardStopCodes.includes(error.error_code)) {
    step.status = 'blocked';
    state.aborted = true;
    state.abortReason = `Hard stop: ${error.error_code} - ${error.message}`;
    return { action: 'abort', reason: state.abortReason };
  }

  switch (step.onFailure) {
    case 'abort':
      step.status = 'failed';
      state.aborted = true;
      state.abortReason = `步骤 ${step.id} 失败且策略为 abort: ${error.message}`;
      return { action: 'abort', reason: state.abortReason };
    case 'retry_once':
    case 'retry_twice':
    case 'read_state_then_retry': {
      const canRetry =
        step.retryCount < step.maxRetries &&
        (!step.retryableOnly || error.retryable);

      if (canRetry) {
        step.retryCount += 1;
        step.status = 'pending';
        step.error = undefined;
        return { action: 'retry', reason: `重试第 ${step.retryCount} 次` };
      }

      step.status = 'failed';
      if (step.required) {
        state.aborted = true;
        state.abortReason = `步骤 ${step.id} 重试 ${step.retryCount} 次后仍失败: ${error.message}`;
        return { action: 'abort', reason: state.abortReason };
      }
      return { action: 'continue' };
    }
    case 'skip_if_optional':
      if (!step.required) {
        step.status = 'skipped';
        return { action: 'continue' };
      }
      state.aborted = true;
      state.abortReason = `必要步骤 ${step.id} 失败: ${error.message}`;
      return { action: 'abort', reason: state.abortReason };
    case 'report_and_stop':
      step.status = 'failed';
      return {
        action: 'report_and_stop',
        reason: `步骤 ${step.id} 失败，需要用户介入: ${error.message}`,
      };
    default:
      state.aborted = true;
      state.abortReason = `步骤 ${step.id} 失败，未知策略: ${step.onFailure}`;
      return { action: 'abort', reason: state.abortReason };
  }
}

export function checkCompletionStatus(state: ExecutionState): {
  canDeliver: boolean;
  unmetCriteria: string[];
  status: 'success' | 'partial' | 'failed' | 'in_progress';
} {
  if (state.aborted) {
    return {
      canDeliver: false,
      unmetCriteria: [state.abortReason ?? 'Execution aborted'],
      status: 'failed',
    };
  }

  const allDone = state.steps.every(
    (step) => step.status === 'done' || step.status === 'skipped',
  );
  if (!allDone) {
    const pending = state.steps.filter(
      (step) => step.status === 'pending' || step.status === 'running',
    );
    return {
      canDeliver: false,
      unmetCriteria: pending.map(
        (step) => `步骤 ${step.id} (${step.title}) 尚未完成`,
      ),
      status: 'in_progress',
    };
  }

  const criticStep = state.steps.find((step) => step.tool === 'critic_edit_result');
  if (criticStep) {
    const criticResult = criticStep.result as
      | { critic?: { passed?: boolean } }
      | undefined;
    if (criticStep.status !== 'done' || criticResult?.critic?.passed === false) {
      return {
        canDeliver: false,
        unmetCriteria: ['critic_edit_result 未完成或未通过'],
        status: 'partial',
      };
    }
  }

  const verificationFailures = state.steps.filter(
    (step) => step.verificationResult && !step.verificationResult.confirmed,
  );
  if (verificationFailures.length > 0) {
    return {
      canDeliver: false,
      unmetCriteria: verificationFailures.map(
        (step) =>
          `步骤 ${step.id} 写后验证失败: ${step.verificationResult?.mismatch ?? 'unknown'}`,
      ),
      status: 'partial',
    };
  }

  return {
    canDeliver: true,
    unmetCriteria: [],
    status: 'success',
  };
}
