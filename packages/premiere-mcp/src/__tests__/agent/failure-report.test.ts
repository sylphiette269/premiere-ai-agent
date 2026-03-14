import { generateFailureReport } from '../../agent/failure-report.js';
import { createExecutionState } from '../../agent/runtime.js';
import { generatePlan } from '../../tools/catalog/agent-orchestration.js';

describe('generateFailureReport', () => {
  it('records skipped research for viral_style tasks', () => {
    const plan = generatePlan('viral_style', { goal: '做一个抖音爆款短视频' });
    const state = createExecutionState(plan.plan, '做一个抖音爆款短视频');

    state.researchGatePassed = false;
    state.aborted = true;
    state.abortReason = 'Research gate not passed';
    state.steps[4].status = 'blocked';
    state.steps[4].error = {
      error_code: 'RESEARCH_GATE_FAILED',
      message: 'Research gate not passed',
      retryable: false,
    };

    const report = generateFailureReport(state);

    expect(
      report.rootCause.some((entry) => entry.includes('研究阶段')),
    ).toBe(true);
    expect(
      report.prevention.some((entry) => entry.includes('collect_reference_videos')),
    ).toBe(true);
  });

  it('records verification failures in root causes', () => {
    const plan = generatePlan('natural_language', { goal: '剪一个产品片' });
    const state = createExecutionState(plan.plan, '剪一个产品片');

    state.steps[3].status = 'failed';
    state.steps[3].verificationResult = {
      confirmed: false,
      verificationLevel: 'missing',
      mismatch: 'Clip not found on timeline',
    };
    state.steps[3].error = {
      error_code: 'VERIFICATION_FAILED',
      message: 'Clip not found on timeline',
      retryable: false,
    };

    const report = generateFailureReport(state);

    expect(
      report.rootCause.some((entry) => entry.includes('后验证失败')),
    ).toBe(true);
    expect(
      report.rootCause.some((entry) => entry.includes('Clip not found on timeline')),
    ).toBe(true);
  });

  it('includes failed step details and timeline entries', () => {
    const plan = generatePlan('natural_language', { goal: '剪一个产品片' });
    const state = createExecutionState(plan.plan, '剪一个产品片');

    state.steps[1].status = 'failed';
    state.steps[1].finishedAt = 123;
    state.steps[1].error = {
      error_code: 'PREMIERE_SCRIPT_ERR',
      message: 'Script error in add_to_timeline',
      retryable: false,
    };

    const report = generateFailureReport(state);

    expect(report.failedSteps).toEqual([
      {
        id: state.steps[1].id,
        tool: state.steps[1].tool,
        error: 'Script error in add_to_timeline',
      },
    ]);
    expect(report.timeline).toContainEqual({
      stepId: state.steps[1].id,
      status: 'failed',
      timestamp: 123,
    });
  });
});
