import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function runNodeScript(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
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

test('run-beat-sync-workflow CLI performs dry-run analysis and planning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-beat-workflow-'));
  const fakeAnalyzerPath = path.join(root, 'fake-analyzer.mjs');
  const inputPath = path.join(root, 'input.wav');
  const clipsPath = path.join(root, 'clips.json');
  const outputPath = path.join(root, 'workflow.json');

  await writeFile(inputPath, 'fake', 'utf8');
  await writeFile(
    clipsPath,
    JSON.stringify([
      { clipId: 'clip-a', durationSec: 0.6 },
      { clipId: 'clip-b', durationSec: 0.6 },
    ]),
    'utf8',
  );
  await writeFile(
    fakeAnalyzerPath,
    [
      "import { writeFile } from 'node:fs/promises';",
      'const args = process.argv.slice(2);',
      "const outputPath = args[args.indexOf('--output') + 1];",
      "await writeFile(outputPath, JSON.stringify({ tempo: 120, beats: [0, 0.5, 1], beat_count: 3, duration: 1.5, energy_peaks: [{ time: 0.5, strength: 0.93 }] }), 'utf8');",
    ].join('\n'),
    'utf8',
  );

  const result = await runNodeScript(
    [
      '--import',
      'tsx',
      'scripts/run-beat-sync-workflow.mjs',
      '--audio-input',
      inputPath,
      '--clips-json',
      clipsPath,
      '--output',
      outputPath,
      '--strategy',
      'every_beat',
      '--mode',
      'sequential',
      '--dry-run',
    ],
    path.resolve('e:/作业1/premiere-mcp'),
    {
      ...process.env,
      PREMIERE_AUDIO_PYTHON: process.execPath,
      PREMIERE_AUDIO_ANALYZE_SCRIPT: fakeAnalyzerPath,
    },
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const output = JSON.parse(await readFile(outputPath, 'utf8'));
  const summary = JSON.parse(result.stdout);

  assert.equal(output.analysis.tempo, 120);
  assert.equal(output.plan.placements.length, 3);
  assert.equal(output.execution, null);
  assert.equal(summary.executed, false);
  assert.equal(summary.placementCount, 3);
});

test('run-beat-sync-workflow CLI fails on missing required arguments', async () => {
  const result = await runNodeScript(
    ['--import', 'tsx', 'scripts/run-beat-sync-workflow.mjs', '--clips-json', 'missing.json'],
    path.resolve('e:/作业1/premiere-mcp'),
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--audio-input and --clips-json are required/);
});
