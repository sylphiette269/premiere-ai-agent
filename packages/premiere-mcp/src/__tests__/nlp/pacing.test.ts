import { computePacingPlan } from '../../pacing-planner.js';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe('computePacingPlan', () => {
  it('uses equal shot durations for the uniform rhythm', () => {
    const plan = computePacingPlan(24, 4, 'uniform', 0.5);
    const uniqueDurations = new Set(plan.shotDurations.map((value) => Number(value.toFixed(4))));

    expect(plan.shotDurations).toHaveLength(4);
    expect(uniqueDurations.size).toBe(1);
    expect(Math.abs(sum(plan.shotDurations) + plan.transitionOverlapSec - 24)).toBeLessThan(0.1);
  });

  it('front-loads longer shots for the building rhythm', () => {
    const plan = computePacingPlan(24, 4, 'building', 0.5);

    expect(plan.shotDurations[0]).toBeGreaterThan(plan.shotDurations[plan.shotDurations.length - 1] ?? 0);
    expect(Math.abs(sum(plan.shotDurations) + plan.transitionOverlapSec - 24)).toBeLessThan(0.1);
  });

  it('keeps irregular timing deterministic for identical input', () => {
    const first = computePacingPlan(24, 6, 'irregular', 0.25);
    const second = computePacingPlan(24, 6, 'irregular', 0.25);

    expect(first.shotDurations).toEqual(second.shotDurations);
    expect(Math.abs(sum(first.shotDurations) + first.transitionOverlapSec - 24)).toBeLessThan(0.1);
    expect(Math.abs(sum(second.shotDurations) + second.transitionOverlapSec - 24)).toBeLessThan(0.1);
  });
});
