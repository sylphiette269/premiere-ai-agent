import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { reviewEditReasonabilityFromFiles } from "../src/edit-reasonability-review.ts";

function printHelp() {
  console.log(`Usage:
  npm run review:edit -- --docx <guide.docx> --media-json <manifest.json> --output <review.md> [options]

Required:
  --docx <path>             Source DOCX guide
  --media-json <path>       Media manifest JSON from scan:media
  --output <path>           Output markdown report path

Optional:
  --asset <path>            Candidate asset path to review (repeatable)
  --transition-name <name>  Candidate clip transition
  --transition-policy <v>   Candidate transition policy
  --clip-duration <n>       Candidate default clip duration in seconds
  --motion-style <name>     Candidate motion style
  --media-policy <name>     Candidate media policy
  --help                    Show this help message
`);
}

function parseArgs(argv) {
  const assets = [];
  const parsed = {
    docxPath: null,
    mediaJsonPath: null,
    outputPath: null,
    assets,
    transitionName: null,
    transitionPolicy: null,
    clipDuration: null,
    motionStyle: null,
    mediaPolicy: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--docx":
        parsed.docxPath = argv[++index] ?? null;
        break;
      case "--media-json":
        parsed.mediaJsonPath = argv[++index] ?? null;
        break;
      case "--output":
        parsed.outputPath = argv[++index] ?? null;
        break;
      case "--asset":
        assets.push(argv[++index] ?? "");
        break;
      case "--transition-name":
        parsed.transitionName = argv[++index] ?? null;
        break;
      case "--transition-policy":
        parsed.transitionPolicy = argv[++index] ?? null;
        break;
      case "--clip-duration": {
        const rawValue = argv[++index] ?? "";
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Invalid --clip-duration value: ${rawValue}`);
        }
        parsed.clipDuration = numericValue;
        break;
      }
      case "--motion-style":
        parsed.motionStyle = argv[++index] ?? null;
        break;
      case "--media-policy":
        parsed.mediaPolicy = argv[++index] ?? null;
        break;
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.docxPath || !args.mediaJsonPath || !args.outputPath) {
    printHelp();
    throw new Error("Missing required arguments: --docx, --media-json, and --output are required.");
  }

  const result = await reviewEditReasonabilityFromFiles({
    docxPath: path.resolve(args.docxPath),
    mediaManifestPath: path.resolve(args.mediaJsonPath),
    assetPaths: args.assets,
    transitionName: args.transitionName,
    transitionPolicy: args.transitionPolicy,
    clipDuration: args.clipDuration,
    motionStyle: args.motionStyle,
    mediaPolicy: args.mediaPolicy,
  });
  const outputPath = path.resolve(args.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.markdownReport, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        status: result.review.status,
        blockerCount: result.review.summary.blockerCount,
        warningCount: result.review.summary.warningCount,
        selectedAssetCount: result.review.summary.selectedAssetCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
