import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function runNodeScript(
  args: string[],
  cwd: string,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

test('plan-beat-sync CLI writes a beat placement plan from analysis and clip lists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-beat-plan-'));
  const analysisPath = path.join(root, 'analysis.json');
  const clipsPath = path.join(root, 'clips.json');
  const outputPath = path.join(root, 'plan.json');

  await writeFile(
    analysisPath,
    JSON.stringify({
      tempo: 120,
      beats: [0, 0.5, 1, 1.5],
      beat_count: 4,
      duration: 2,
      energy_peaks: [{ time: 1.0, strength: 0.92 }],
    }),
    'utf8',
  );
  await writeFile(
    clipsPath,
    JSON.stringify([
      { clipId: 'clip-a', durationSec: 0.6 },
      { clipId: 'clip-b', durationSec: 0.6 },
    ]),
    'utf8',
  );

  const result = await runNodeScript(
    [
      '--import',
      'tsx',
      'scripts/plan-beat-sync.mjs',
      '--analysis-json',
      analysisPath,
      '--clips-json',
      clipsPath,
      '--output',
      outputPath,
      '--strategy',
      'every_beat',
      '--mode',
      'sequential',
    ],
    path.resolve('e:/作业1/premiere-mcp'),
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const output = JSON.parse(await readFile(outputPath, 'utf8'));
  const summary = JSON.parse(result.stdout);

  assert.deepEqual(output.cutPoints, [0, 0.5, 1, 1.5]);
  assert.equal(output.placements.length, 4);
  assert.equal(summary.placementCount, 4);
  assert.equal(summary.tempo, 120);
});
