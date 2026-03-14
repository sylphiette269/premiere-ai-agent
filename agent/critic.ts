import type { AgentCriticReview } from './types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

export class AgentCritic {
  review(raw: unknown): AgentCriticReview {
    const record = asRecord(raw);
    const critic = asRecord(record.critic);
    const passed = critic.passed !== false;
    const findings = Array.isArray(critic.findings)
      ? critic.findings.map((item) => String(item))
      : [];
    const actionableFixes = Array.isArray(critic.actionableFixes)
      ? critic.actionableFixes.map((item) => String(item))
      : [];

    return {
      needsRevision: !passed,
      summary: passed
        ? 'critic_edit_result 通过，当前链路可以交付。'
        : 'critic_edit_result 未通过，需要继续修订。',
      findings,
      actionableFixes,
      raw: record,
    };
  }
}
