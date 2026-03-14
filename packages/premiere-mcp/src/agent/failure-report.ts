import type { ExecutionState } from './types.js';

export interface FailureReport {
  expected: string;
  actual: string;
  rootCause: string[];
  prevention: string[];
  failedSteps: Array<{
    id: string;
    tool: string;
    error: string;
  }>;
  timeline: Array<{
    stepId: string;
    status: string;
    timestamp?: number;
  }>;
}

export function generateFailureReport(state: ExecutionState): FailureReport {
  const failedSteps = state.steps
    .filter((step) => step.status === 'failed' || step.status === 'blocked')
    .map((step) => ({
      id: step.id,
      tool: step.tool,
      error: step.error?.message ?? 'unknown error',
    }));

  const rootCause: string[] = [];
  const prevention: string[] = [];

  if (state.scenario === 'viral_style' && !state.researchGatePassed) {
    rootCause.push('未完成研究阶段就尝试执行风格型任务');
    prevention.push(
      '先完成 collect_reference_videos + analyze_reference_patterns + extract_editing_blueprint',
    );
  }

  const verificationFailed = state.steps.filter(
    (step) => step.verificationResult && !step.verificationResult.confirmed,
  );
  if (verificationFailed.length > 0) {
    rootCause.push(`${verificationFailed.length} 个写操作的后验证失败`);
    prevention.push('关键写操作后必须检查 verification.confirmed，失败时不得继续');
    for (const step of verificationFailed) {
      rootCause.push(`  - ${step.tool}: ${step.verificationResult?.mismatch ?? 'unknown'}`);
    }
  }

  const criticStep = state.steps.find((step) => step.tool === 'critic_edit_result');
  if (criticStep && (criticStep.status === 'failed' || criticStep.status === 'blocked')) {
    rootCause.push('critic 审稿未通过');
    prevention.push('装配完成后必须通过 critic_edit_result，未通过不得交付');
  }

  for (const step of failedSteps) {
    if (step.error.includes('TOOL_DISABLED')) {
      rootCause.push(`使用了已禁用的工具: ${step.tool}`);
      prevention.push(`避免继续调用 ${step.tool}，改用 fallback 工具`);
    }
    if (step.error.includes('ASSEMBLY_BLOCKED')) {
      rootCause.push('装配被 blocked 状态阻断');
      prevention.push('先解决 review_edit_reasonability 或 critic 返回的阻断项');
    }
  }

  const exhaustedRetries = state.steps.filter(
    (step) => step.retryCount >= step.maxRetries && step.status === 'failed',
  );
  if (exhaustedRetries.length > 0) {
    rootCause.push(`${exhaustedRetries.length} 个步骤重试耗尽`);
    prevention.push('区分瞬时 bridge 问题和系统性失败后再决定重试策略');
  }

  const doneCount = state.steps.filter((step) => step.status === 'done').length;
  const actual = state.aborted
    ? `任务在 ${failedSteps[0]?.id ?? '?'} 中止: ${state.abortReason ?? 'unknown'}`
    : `完成了 ${doneCount}/${state.steps.length} 个步骤`;

  return {
    expected: state.goal,
    actual,
    rootCause,
    prevention,
    failedSteps,
    timeline: state.steps.map((step) => ({
      stepId: step.id,
      status: step.status,
      timestamp: step.finishedAt,
    })),
  };
}
