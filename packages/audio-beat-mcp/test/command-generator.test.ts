import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePremiereCommands } from '../src/command-generator.ts';
import type { PremiereEditPlan } from '../src/types.ts';

const plan: PremiereEditPlan = {
  style: 'drum_punch',
  bpm: 128,
  beatCount: 4,
  onsetCount: 2,
  cutPoints: [0.5, 1.5],
  markerPlan: [
    {
      timeSec: 0.5,
      name: 'Drum Hit',
      color: 'red',
      source: 'onset',
      comment: 'Detected onset / transient',
    },
  ],
  animationPlan: [
    {
      triggerTimeSec: 0.5,
      property: 'Scale',
      label: 'scale_pulse',
      intensity: 'strong',
      steps: [
        { offsetSec: 0, value: 100, interpolation: 'linear' },
        { offsetSec: 0.1, value: 112, interpolation: 'bezier' },
        { offsetSec: 0.2, value: 100, interpolation: 'bezier' },
      ],
    },
  ],
  notes: [],
};

test('generatePremiereCommands emits marker and keyframe tool calls', () => {
  const result = generatePremiereCommands({
    sequenceId: 'seq-1',
    clipId: 'clip-1',
    clipStartSec: 0.25,
    editingPlan: plan,
    separateInterpolationWrites: true,
  });

  assert.equal(result.counts.markers, 1);
  assert.equal(result.counts.keyframes, 3);
  assert.equal(result.counts.interpolations, 3);
  assert.equal(result.toolCalls[0]?.toolName, 'add_marker');
  assert.ok(result.toolCalls.some((call) => call.toolName === 'add_keyframe'));
  assert.ok(result.toolCalls.some((call) => call.toolName === 'set_keyframe_interpolation'));
});

test('generatePremiereCommands degrades to markers only when clip context is missing', () => {
  const result = generatePremiereCommands({
    sequenceId: 'seq-1',
    editingPlan: plan,
  });

  assert.equal(result.counts.keyframes, 0);
  assert.ok(result.warnings.length > 0);
});
