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

test('analyze-audio-track CLI writes analysis JSON through the Node wrapper', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-audio-script-'));
  const fakeAnalyzerPath = path.join(root, 'fake-analyzer.mjs');
  const inputPath = path.join(root, 'input.wav');
  const outputPath = path.join(root, 'analysis.json');

  await writeFile(inputPath, 'fake', 'utf8');
  await writeFile(
    fakeAnalyzerPath,
    [
      "import { writeFile } from 'node:fs/promises';",
      'const args = process.argv.slice(2);',
      "const outputPath = args[args.indexOf('--output') + 1];",
      "await writeFile(outputPath, JSON.stringify({ tempo: 98, beats: [0, 0.61], beat_count: 2, duration: 1.22 }), 'utf8');",
      "console.log('fake analyzer ok');",
    ].join('\n'),
    'utf8',
  );

  const result = await runNodeScript(
    [
      '--import',
      'tsx',
      'scripts/analyze-audio-track.mjs',
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--method',
      'onset',
      '--energy-threshold',
      '0.8',
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

  assert.equal(output.tempo, 98);
  assert.equal(summary.beatCount, 2);
  assert.equal(summary.tempo, 98);
});
