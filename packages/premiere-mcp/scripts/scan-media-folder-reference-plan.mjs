import path from "node:path";
import process from "node:process";

import { writeMediaFolderPlan } from "../src/media-folder-manifest.ts";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`unknown argument: ${token}`);
    }

    const nextValue = argv[index + 1];
    if (typeof nextValue !== "string" || nextValue.startsWith("--")) {
      throw new Error(`missing value for argument: ${token}`);
    }

    if (token === "--input") {
      options.inputDir = nextValue;
    } else if (token === "--output") {
      options.markdownPath = nextValue;
    } else if (token === "--json") {
      options.jsonPath = nextValue;
    } else {
      throw new Error(`unknown argument: ${token}`);
    }

    index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run scan:media -- --input <folder> --output <markdown> [--json <json>]

Options:
  --input <folder>      Source media folder
  --output <markdown>   Target markdown manifest
  --json <json>         Optional JSON manifest
  --help                Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.inputDir || !options.markdownPath) {
    throw new Error("--input and --output are required");
  }

  const result = await writeMediaFolderPlan({
    inputDir: path.resolve(options.inputDir),
    markdownPath: path.resolve(options.markdownPath),
    jsonPath: options.jsonPath ? path.resolve(options.jsonPath) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    `Media folder manifest failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
