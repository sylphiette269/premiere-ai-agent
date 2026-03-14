import {
  checkCompletionStatus,
  createExecutionState,
  getNextStep,
  handleStepResult,
} from '../../agent/runtime.js';
import { generateExecutionReport } from '../../agent/execution-report.js';
import { generatePlan } from '../../tools/catalog/agent-orchestration.js';
import type { ExecutionState } from '../../agent/types.js';

function createMockState(): ExecutionState {
  const plan = generatePlan('natural_language', { goal: 'test' });
  return createExecutionState(plan.plan, 'test');
}

describe('agent runtime', () => {
  describe('createExecutionState', () => {
    it('starts viral_style with research gate closed', () => {
      const plan = generatePlan('viral_style', { goal: '做爆款视频' });
      const state = createExecutionState(plan.plan, '做爆款视频');
      expect(state.researchGatePassed).toBe(false);
      expect(state.steps.every((step) => step.status === 'pending')).toBe(true);
    });

    it('starts natural_language with research gate open', () => {
      const plan = generatePlan('natural_language', { goal: '剪片子' });
      const state = createExecutionState(plan.plan, '剪片子');
      expect(state.researchGatePassed).toBe(true);
    });
  });

  describe('getNextStep', () => {
    it('returns the first pending step and marks it running', () => {
      const state = createMockState();
      const nextStep = getNextStep(state);
      expect(nextStep?.id).toBe('step_01');
      expect(nextStep?.status).toBe('running');
    });

    it('blocks a step when its dependency failed', () => {
      const state = createMockState();
      state.steps[0].status = 'failed';
      state.steps[1].dependsOn = ['step_01'];
      getNextStep(state);
      expect(state.steps[1].status).toBe('blocked');
    });

    it('returns null when aborted', () => {
      const state = createMockState();
      state.aborted = true;
      expect(getNextStep(state)).toBeNull();
    });
  });

  describe('handleStepResult', () => {
    it('marks a successful step as done', () => {
      const state = createMockState();
      const current = getNextStep(state);
      const result = handleStepResult(state, current!.id, { ok: true, data: {} });
      expect(result.action).toBe('continue');
      expect(state.steps[0].status).toBe('done');
    });

    it('marks verification failure as VERIFICATION_FAILED', () => {
      const state = createMockState();
      state.steps[0].requiresVerification = true;
      const current = getNextStep(state);
      handleStepResult(state, current!.id, {
        ok: true,
        data: {},
        verification: {
          confirmed: false,
          verificationLevel: 'missing',
          mismatch: 'clip not found on track',
        },
      });
      expect(state.steps[0].status).toBe('blocked');
      expect(state.steps[0].error?.error_code).toBe('VERIFICATION_FAILED');
    });

    it('retries retryable failures when allowed', () => {
      const state = createMockState();
      state.steps[0].onFailure = 'retry_once';
      state.steps[0].maxRetries = 1;
      const current = getNextStep(state);
      const result = handleStepResult(state, current!.id, {
        ok: false,
        error: {
          error_code: 'BRIDGE_TIMEOUT',
          message: 'timeout',
          retryable: true,
        },
      });
      expect(result.action).toBe('retry');
      expect(state.steps[0].retryCount).toBe(1);
      expect(state.steps[0].status).toBe('pending');
    });

    it('aborts immediately on hard-stop errors', () => {
      const state = createMockState();
      const current = getNextStep(state);
      const result = handleStepResult(state, current!.id, {
        ok: false,
        error: {
          error_code: 'TOOL_DISABLED',
          message: 'disabled',
          retryable: false,
        },
      });
      expect(result.action).toBe('abort');
      expect(state.aborted).toBe(true);
    });
  });

  describe('checkCompletionStatus', () => {
    it('allows delivery when every step is done and critic passed', () => {
      const state = createMockState();
      state.steps.forEach((step) => {
        step.status = 'done';
      });
      const criticStep = state.steps.find((step) => step.tool === 'critic_edit_result');
      if (criticStep) {
        criticStep.result = { critic: { passed: true } };
      }
      const status = checkCompletionStatus(state);
      expect(status.canDeliver).toBe(true);
      expect(status.status).toBe('success');
    });

    it('blocks delivery when critic failed', () => {
      const state = createMockState();
      state.steps.forEach((step) => {
        step.status = 'done';
      });
      const criticStep = state.steps.find((step) => step.tool === 'critic_edit_result');
      if (criticStep) {
        criticStep.result = { critic: { passed: false } };
      }
      expect(checkCompletionStatus(state).canDeliver).toBe(false);
    });
  });

  describe('generateExecutionReport', () => {
    it('builds a full execution report', () => {
      const state = createMockState();
      state.steps.forEach((step) => {
        step.status = 'done';
        step.startedAt = 10;
        step.finishedAt = 20;
      });
      state.completed = true;
      const criticStep = state.steps.find((step) => step.tool === 'critic_edit_result');
      if (criticStep) {
        criticStep.result = { critic: { passed: true } };
      }

      const report = generateExecutionReport(state);
      expect(report.stepsSummary.length).toBe(state.steps.length);
      expect(report.finalOutcome).toBe('success');
    });
  });
});
