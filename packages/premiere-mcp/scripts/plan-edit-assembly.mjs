import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { planEditAssemblyFromFiles } from "../src/edit-assembly-plan.ts";

function printHelp() {
  console.log(`Usage:
  npm run plan:edit -- --docx <guide.docx> --media-json <manifest.json> --output <plan.md> [options]

Required:
  --docx <path>             Source DOCX guide
  --media-json <path>       Media manifest JSON from scan:media
  --output <path>           Output markdown plan path

Optional:
  --sequence-name <name>    Override planned sequence name
  --max-assets <n>          Limit the number of planned visual assets
  --transition-name <name>  Override planned transition name
  --transition-policy <v>   Override planned transition policy
  --clip-duration <n>       Override default clip duration in seconds
  --motion-style <name>     Override motion style
  --help                    Show this help message
`);
}

function parseArgs(argv) {
  const parsed = {
    docxPath: null,
    mediaJsonPath: null,
    outputPath: null,
    sequenceName: null,
    maxAssets: null,
    transitionName: null,
    transitionPolicy: null,
    clipDuration: null,
    motionStyle: null,
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
      case "--sequence-name":
        parsed.sequenceName = argv[++index] ?? null;
        break;
      case "--max-assets": {
        const rawValue = argv[++index] ?? "";
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Invalid --max-assets value: ${rawValue}`);
        }
        parsed.maxAssets = numericValue;
        break;
      }
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

  const result = await planEditAssemblyFromFiles({
    docxPath: path.resolve(args.docxPath),
    mediaManifestPath: path.resolve(args.mediaJsonPath),
    sequenceName: args.sequenceName,
    maxAssets: args.maxAssets,
    transitionName: args.transitionName,
    transitionPolicy: args.transitionPolicy,
    clipDuration: args.clipDuration,
    motionStyle: args.motionStyle,
  });
  const outputPath = path.resolve(args.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.markdownPlan, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        status: result.plan.review.status,
        selectedAssetCount: result.plan.selectedAssets.length,
        skippedAssetCount: result.plan.skippedAssets.length,
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
