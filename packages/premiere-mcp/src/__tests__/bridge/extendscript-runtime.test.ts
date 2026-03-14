import { EXTENDSCRIPT_RUNTIME_SOURCE } from '../../bridge/extendscript-runtime.js';

describe('EXTENDSCRIPT_RUNTIME_SOURCE', () => {
  it('searches every project sequence when resolving clips by nodeId', () => {
    expect(EXTENDSCRIPT_RUNTIME_SOURCE).toContain(
      'for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {',
    );
  });
});
