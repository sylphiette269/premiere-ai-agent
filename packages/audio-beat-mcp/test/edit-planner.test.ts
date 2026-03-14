import assert from 'node:assert/strict';
import test from 'node:test';

import { planPremiereEditing } from '../src/edit-planner.ts';
import type { MusicBeatAnalysis } from '../src/types.ts';

const beatData: MusicBeatAnalysis = {
  sourceAudioPath: 'E:/audio/test.wav',
  duration: 4,
  tempo: 120,
  bpm: 120,
  beatTimes: [0, 0.5, 1, 1.5],
  beatCount: 4,
  onsetTimes: [0.5, 1.5],
  onsetCount: 2,
  energyPeaks: [
    { time: 0.5, strength: 0.9 },
    { time: 1.5, strength: 0.95 },
  ],
  method: 'default',
  sensitivity: 'medium',
  minGapSec: 0.12,
};

test('planPremiereEditing builds marker and pulse plans for beat_markers_and_scale', () => {
  const result = planPremiereEditing({
    beatData,
    editingStyle: 'beat_markers_and_scale',
    beatsPerBar: 4,
  });

  assert.equal(result.style, 'beat_markers_and_scale');
  assert.deepEqual(result.cutPoints, [0, 0.5, 1, 1.5]);
  assert.equal(result.animationPlan.length, 4);
  assert.ok(result.markerPlan.some((marker) => marker.name === 'Drum Hit'));
  assert.ok(result.markerPlan.some((marker) => marker.name === 'Downbeat'));
});

test('planPremiereEditing focuses on cut points for cut_on_beat', () => {
  const result = planPremiereEditing({
    beatData,
    editingStyle: 'cut_on_beat',
    beatsPerBar: 4,
  });

  assert.deepEqual(result.cutPoints, [0, 1]);
  assert.equal(result.animationPlan.length, 0);
  assert.ok(result.markerPlan.some((marker) => marker.name === 'Cut Point'));
});
