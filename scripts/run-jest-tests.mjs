import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function collectTestFiles(targetDir, output) {
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    const resolvedPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(resolvedPath, output);
      continue;
    }

    if (entry.name.endsWith('.test.ts')) {
      output.push(resolvedPath);
    }
  }
}

function resolveJestBin() {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/.bin/jest.cmd'),
    path.resolve(process.cwd(), '../../node_modules/.bin/jest.cmd'),
    path.resolve(process.cwd(), 'node_modules/.bin/jest'),
    path.resolve(process.cwd(), '../../node_modules/.bin/jest'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve Jest binary from workspace');
}

function runJestSuite(jestBin, suitePath) {
  const args = ['--runInBand', '--config', 'jest.config.js'];
  if (suitePath) {
    args.push('--runTestsByPath', suitePath);
  }

  const result = spawnSync(jestBin, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

const jestBin = resolveJestBin();

if (process.env.CI === 'true') {
  const testsRoot = path.resolve(process.cwd(), 'src/__tests__');
  const files = [];
  collectTestFiles(testsRoot, files);
  files.sort();

  for (const file of files) {
    const displayPath = path.relative(process.cwd(), file);
    console.error(`[run-jest-tests] ${displayPath}`);

    const status = runJestSuite(jestBin, file);
    if (status !== 0) {
      console.error(`::error title=Jest suite failed::${displayPath}`);
      process.exit(status);
    }
  }

  process.exit(0);
}

process.exit(runJestSuite(jestBin));
