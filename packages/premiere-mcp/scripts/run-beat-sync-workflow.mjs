import { readFile, writeFile } from 'node:fs/promises';

import { runBeatSyncWorkflow } from '../src/beat-sync-workflow.ts';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`unknown argument: ${token}`);
    }

    const nextValue = argv[index + 1];
    if (typeof nextValue !== 'string' || nextValue.startsWith('--')) {
      throw new Error(`missing value for argument: ${token}`);
    }

    if (token === '--audio-input') {
      options.audioInput = nextValue;
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
    } else if (token === '--method') {
      options.method = nextValue;
    } else if (token === '--energy-threshold') {
      options.energyThreshold = Number(nextValue);
    } else if (token === '--timeout-ms') {
      options.timeoutMs = Number(nextValue);
    } else {
      throw new Error(`unknown argument: ${token}`);
    }

    index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/run-beat-sync-workflow.mjs --audio-input <audio> --clips-json <file> [options]

Options:
  --audio-input <path>         Input audio or video path
  --clips-json <file>          JSON clip list with clipId/durationSec
  --output <file>              Optional output JSON path
  --strategy <name>            every_beat | strong_beat | progressive
  --mode <name>                sequential | random | ping-pong
  --beats-per-bar <number>     Downbeat grouping for strong_beat
  --seed <number>              Seed for random mode
  --method <default|onset|plp> Beat detection method
  --energy-threshold <value>   Energy peak threshold
  --timeout-ms <value>         Process timeout in milliseconds
  --dry-run                    Skip timeline execution
  --help                       Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.audioInput || !options.clipsJson) {
    throw new Error('--audio-input and --clips-json are required');
  }

  const clips = JSON.parse(await readFile(options.clipsJson, 'utf8'));
  if (!Array.isArray(clips)) {
    throw new Error('--clips-json must contain a JSON array');
  }

  const result = await runBeatSyncWorkflow({
    audio: {
      inputPath: options.audioInput,
      method: options.method,
      energyThreshold: options.energyThreshold,
      timeoutMs: options.timeoutMs,
      pythonExecutable: process.env.PREMIERE_AUDIO_PYTHON,
      scriptPath: process.env.PREMIERE_AUDIO_ANALYZE_SCRIPT,
    },
    planning: {
      clips,
      strategy: options.strategy ?? 'every_beat',
      mode: options.mode ?? 'sequential',
      beatsPerBar: options.beatsPerBar,
      seed: options.seed,
    },
    dryRun: options.dryRun ?? true,
  });

  if (options.output) {
    await writeFile(options.output, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        tempo: result.analysis.tempo ?? null,
        beatCount: result.analysis.beat_count ?? 0,
        placementCount: result.plan.placements.length,
        cutPointCount: result.plan.cutPoints.length,
        warningCount: result.plan.warnings.length,
        executed: Boolean(result.execution),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    `run-beat-sync-workflow failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
