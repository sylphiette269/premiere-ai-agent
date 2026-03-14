import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeMusicBeats } from '../src/audio-analysis.ts';

test('analyzeMusicBeats wraps the analyzer and normalizes beat/onset output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'audio-beat-analysis-'));
  const inputPath = path.join(root, 'input.wav');
  const fakeAnalyzerPath = path.join(root, 'fake-analyzer.mjs');

  await writeFile(inputPath, 'fake', 'utf8');
  await writeFile(
    fakeAnalyzerPath,
    [
      "import { writeFile } from 'node:fs/promises';",
      'const args = process.argv.slice(2);',
      "const outputPath = args[args.indexOf('--output') + 1];",
      "const payload = {",
      "  tempo: 128.4,",
      "  beats: [0, 0.04, 0.5, 1.0],",
      "  duration: 2.5,",
      "  energy_peaks: [",
      "    { time: 0.02, strength: 0.4 },",
      "    { time: 0.5, strength: 0.91 },",
      "    { time: 0.56, strength: 0.88 },",
      "    { time: 1.02, strength: 0.95 }",
      "  ]",
      "};",
      "await writeFile(outputPath, JSON.stringify(payload), 'utf8');",
    ].join('\n'),
    'utf8',
  );

  const result = await analyzeMusicBeats({
    audioPath: inputPath,
    sensitivity: 'medium',
    pythonExecutable: process.execPath,
    scriptPath: fakeAnalyzerPath,
    projectRoot: root,
  });

  assert.equal(result.bpm, 128.4);
  assert.deepEqual(result.beatTimes, [0, 0.5, 1]);
  assert.deepEqual(result.onsetTimes, [0.5, 1.02]);
  assert.equal(result.beatCount, 3);
  assert.equal(result.onsetCount, 2);
});
