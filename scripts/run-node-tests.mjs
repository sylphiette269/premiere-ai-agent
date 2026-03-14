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

function runNodeTestFile(testFile) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--import', 'tsx', testFile],
    { stdio: 'inherit' },
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (process.env.CI === 'true') {
  for (const file of files) {
    const displayPath = path.relative(process.cwd(), file);
    console.error(`[run-node-tests] ${displayPath}`);

    const status = runNodeTestFile(file);
    if (status !== 0) {
      // Emit an explicit GitHub annotation so public check-run metadata shows the file.
      console.error(`::error title=Node test file failed::${displayPath}`);
      process.exit(status);
    }
  }

  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ['--test', '--import', 'tsx', ...files],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
