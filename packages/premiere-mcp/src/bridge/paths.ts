import { existsSync } from 'fs';
import { dirname, join } from 'path';

const TRAILING_SEPARATOR_PATTERN = /[\\/]+$/;

export function trimTrailingSeparators(value: string): string {
  return value.trim().replace(TRAILING_SEPARATOR_PATTERN, '');
}

export function resolveConfiguredBridgeDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const explicitDir = trimTrailingSeparators(env.PREMIERE_TEMP_DIR || '');
  if (explicitDir) {
    return explicitDir;
  }

  const legacyCommandFile = (env.PREMIERE_MCP_COMMAND_FILE || '').trim();
  if (!legacyCommandFile) {
    return '';
  }

  return trimTrailingSeparators(dirname(legacyCommandFile));
}

export function resolveRecoveryScriptPath(
  runtimeEntry: string = process.argv[1] || process.cwd(),
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') {
    return null;
  }

  const candidate = join(dirname(runtimeEntry), '..', 'scripts', 'recover-windows-cep-bridge.ps1');
  return existsSync(candidate) ? candidate : null;
}
