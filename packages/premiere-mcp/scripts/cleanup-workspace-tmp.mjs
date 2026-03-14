import os from "node:os";
import path from "node:path";
import { readdir, rm } from "node:fs/promises";

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    dryRun: false,
    tempRoot: os.tmpdir(),
    bridgeDir: process.env.PREMIERE_TEMP_DIR
      ? path.resolve(process.env.PREMIERE_TEMP_DIR)
      : path.resolve("C:/pr-mcp-cmd"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root" && argv[index + 1]) {
      args.root = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--temp-root" && argv[index + 1]) {
      args.tempRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--bridge-dir" && argv[index + 1]) {
      args.bridgeDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function safeReadDir(targetPath) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function collectWorkspaceEntries(entries, root) {
  const matches = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith("tmp_")) {
      matches.push({
        category: "workspace-tmp",
        path: path.join(root, entry.name),
      });
      continue;
    }

    if (entry.isDirectory() && entry.name === "_premiere_out") {
      matches.push({
        category: "workspace-fade-check",
        path: path.join(root, "_premiere_out", "fade_check"),
      });
    }
  }

  return matches;
}

function collectTempEntries(entries, tempRoot) {
  return entries
    .filter((entry) => entry.isDirectory() && /^premiere-fade-verify-/i.test(entry.name))
    .map((entry) => ({
      category: "premiere-fade-verify",
      path: path.join(tempRoot, entry.name),
    }));
}

function collectBridgeEntries(entries, bridgeDir) {
  return entries
    .filter((entry) => entry.isDirectory() && /^fade_check$/i.test(entry.name))
    .map((entry) => ({
      category: "bridge-fade-check",
      path: path.join(bridgeDir, entry.name),
    }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceEntries = await safeReadDir(args.root);
  const tempEntries = await safeReadDir(args.tempRoot);
  const bridgeEntries = await safeReadDir(args.bridgeDir);

  const matches = [
    ...collectWorkspaceEntries(workspaceEntries, args.root),
    ...collectTempEntries(tempEntries, args.tempRoot),
    ...collectBridgeEntries(bridgeEntries, args.bridgeDir),
  ];

  const uniqueMatches = Array.from(
    new Map(matches.map((entry) => [entry.path, entry])).values(),
  );

  if (!args.dryRun) {
    for (const entry of uniqueMatches) {
      await rm(entry.path, { recursive: true, force: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        root: args.root,
        tempRoot: args.tempRoot,
        bridgeDir: args.bridgeDir,
        dryRun: args.dryRun,
        deletedCount: uniqueMatches.length,
        deleted: uniqueMatches,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
