import { readFile, writeFile } from 'node:fs/promises';

import { buildBeatSyncPlan } from '../src/beat-sync-engine.ts';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`unknown argument: ${token}`);
    }

    const nextValue = argv[index + 1];
    if (typeof nextValue !== 'string' || nextValue.startsWith('--')) {
      throw new Error(`missing value for argument: ${token}`);
    }

    if (token === '--analysis-json') {
      options.analysisJson = nextValue;
    } else if (token === '--clips-json') {
      options.clipsJson = nextValue;
    } else if (token === '--output') {
      options.output = nextValue;
    } else if (token === '--strategy') {
      options.strategy = nextValue;
    } else if (token === '--mode') {
      options.mode = nextValue;
    } else if (token === '--beats-per-bar') {
      options.beatsPerBar = Number(nextValue);
    } else if (token === '--seed') {
      options.seed = Number(nextValue);
    } else {
      throw new Error(`unknown argument: ${token}`);
    }

    index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/plan-beat-sync.mjs --analysis-json <file> --clips-json <file> [options]

Options:
  --analysis-json <file>       JSON from python/analyze.py
  --clips-json <file>          JSON clip list with clipId/durationSec
  --output <file>              Optional output JSON path
  --strategy <name>            every_beat | strong_beat | progressive
  --mode <name>                sequential | random | ping-pong
  --beats-per-bar <number>     Downbeat grouping for strong_beat
  --seed <number>              Seed for random mode
  --help                       Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.analysisJson || !options.clipsJson) {
    throw new Error('--analysis-json and --clips-json are required');
  }

  const analysis = JSON.parse(await readFile(options.analysisJson, 'utf8'));
  const clips = JSON.parse(await readFile(options.clipsJson, 'utf8'));
  const plan = buildBeatSyncPlan({
    clips,
    beats: analysis.beats ?? [],
    strategy: options.strategy ?? 'every_beat',
    mode: options.mode ?? 'sequential',
    beatsPerBar: options.beatsPerBar,
    seed: options.seed,
    tempo: analysis.tempo,
    energyPeaks: analysis.energy_peaks ?? [],
  });

  if (options.output) {
    await writeFile(options.output, JSON.stringify(plan, null, 2), 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        tempo: analysis.tempo ?? null,
        placementCount: plan.placements.length,
        cutPointCount: plan.cutPoints.length,
        warningCount: plan.warnings.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`plan-beat-sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
