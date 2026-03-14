import path from "node:path";
import process from "node:process";

import { convertDocxToMarkdown } from "../src/docx-visual-guide.ts";

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
      options.docxPath = nextValue;
    } else if (token === "--output") {
      options.markdownPath = nextValue;
    } else if (token === "--assets-dir") {
      options.assetsDir = nextValue;
    } else {
      throw new Error(`unknown argument: ${token}`);
    }

    index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run convert:docx -- --input <docx> --output <markdown> [--assets-dir <dir>]

Options:
  --input <docx>       Source .docx file
  --output <markdown>  Target markdown file
  --assets-dir <dir>   Optional extracted image directory
  --help               Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.docxPath || !options.markdownPath) {
    throw new Error("--input and --output are required");
  }

  const result = await convertDocxToMarkdown({
    docxPath: path.resolve(options.docxPath),
    markdownPath: path.resolve(options.markdownPath),
    assetsDir: options.assetsDir ? path.resolve(options.assetsDir) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    `DOCX conversion failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
