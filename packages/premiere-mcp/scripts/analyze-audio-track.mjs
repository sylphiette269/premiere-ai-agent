import { writeFile } from 'node:fs/promises';

import { analyzeAudioTrack } from '../src/audio-analysis.ts';

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

    if (token === '--input') {
      options.inputPath = nextValue;
    } else if (token === '--output') {
      options.outputPath = nextValue;
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
  node --import tsx scripts/analyze-audio-track.mjs --input <audio> [options]

Options:
  --input <path>               Input audio or video path
  --output <path>              Optional output JSON path
  --method <default|onset|plp> Beat detection method
  --energy-threshold <value>   Energy peak threshold (default: 0.6)
  --timeout-ms <value>         Process timeout in milliseconds
  --help                       Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.inputPath) {
    throw new Error('--input is required');
  }

  const result = await analyzeAudioTrack({
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    method: options.method,
    energyThreshold: options.energyThreshold,
    timeoutMs: options.timeoutMs,
    pythonExecutable: process.env.PREMIERE_AUDIO_PYTHON,
    scriptPath: process.env.PREMIERE_AUDIO_ANALYZE_SCRIPT,
  });

  if (options.outputPath) {
    await writeFile(options.outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        tempo: result.tempo,
        beatCount: result.beat_count,
        duration: result.duration,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    `analyze-audio-track failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
