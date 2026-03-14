import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TEST_SUFFIXES = ['.test.ts', '.test.js', '.test.mjs', '.test.cjs'];

function collectTestFiles(targetDir, output) {
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    const resolvedPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(resolvedPath, output);
      continue;
    }

    if (TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      output.push(resolvedPath);
    }
  }
}

const roots = process.argv.slice(2);
const requestedRoots = roots.length > 0 ? roots : ['test'];
const files = [];

for (const root of requestedRoots) {
  const resolvedRoot = path.resolve(process.cwd(), root);
  if (!existsSync(resolvedRoot)) {
    continue;
  }
  collectTestFiles(resolvedRoot, files);
}

files.sort();

if (files.length === 0) {
  console.error(`No test files found under: ${requestedRoots.join(', ')}`);
  process.exit(1);
}

const nodeTestArgs = ['--test', '--import', 'tsx'];

// GitHub Actions runners are slower and these suites use short-lived temp files
// and polling windows, so keep file-level execution serial in CI to avoid flake.
if (process.env.CI === 'true') {
  nodeTestArgs.push('--test-concurrency=1');
}

const result = spawnSync(
  process.execPath,
  [...nodeTestArgs, ...files],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
