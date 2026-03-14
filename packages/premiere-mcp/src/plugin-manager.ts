import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { validateFilePath } from './utils/security.js';

const ALLOWED_PLUGIN_EXTENSIONS = new Set(['.js', '.jsx', '.jsxbin']);

export function resolvePluginRegistryDir(
  env: NodeJS.ProcessEnv = process.env,
  fallbackDir?: string,
): string {
  const explicitDir = String(
    env.PREMIERE_PLUGIN_REGISTRY_DIR
    || env.PREMIERE_TEMP_DIR
    || '',
  ).trim();

  if (explicitDir) {
    return resolve(explicitDir);
  }

  const commandFile = String(env.PREMIERE_MCP_COMMAND_FILE || '').trim();
  if (commandFile) {
    return dirname(resolve(commandFile));
  }

  if (fallbackDir && fallbackDir.trim()) {
    return resolve(fallbackDir);
  }

  return resolve('C:/pr-mcp-cmd');
}

export function resolvePluginAllowedDirs(
  registryDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configuredDirs = String(env.PREMIERE_PLUGIN_ALLOWED_DIRS || '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(entry));

  return configuredDirs.length > 0 ? configuredDirs : [resolve(registryDir)];
}

export function validatePluginEntryPath(
  entry: string,
  registryDir: string,
  env: NodeJS.ProcessEnv = process.env,
): { valid: boolean; normalized?: string; error?: string } {
  if (!entry || typeof entry !== 'string') {
    return { valid: false, error: 'Plugin entry must be a non-empty string' };
  }

  const trimmedEntry = entry.trim();
  if (!trimmedEntry) {
    return { valid: false, error: 'Plugin entry must be a non-empty string' };
  }

  if (!isAbsolute(trimmedEntry)) {
    return { valid: false, error: 'Plugin entry must be an absolute path' };
  }

  const extension = extname(trimmedEntry).toLowerCase();
  if (!ALLOWED_PLUGIN_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      error: `Plugin entry must use one of: ${Array.from(ALLOWED_PLUGIN_EXTENSIONS).join(', ')}`,
    };
  }

  const pathValidation = validateFilePath(
    trimmedEntry,
    resolvePluginAllowedDirs(registryDir, env),
  );

  if (!pathValidation.valid) {
    return { valid: false, error: pathValidation.error };
  }

  return {
    valid: true,
    normalized: pathValidation.normalized || resolve(trimmedEntry),
  };
}

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string().default(''),
  entry: z.string().min(1),
  methods: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

const registrySchema = z.object({
  plugins: z.array(pluginManifestSchema).default([]),
});

export class PluginRegistry {
  private registryPath: string;

  constructor(bridgeDir: string) {
    this.registryPath = join(bridgeDir, 'plugins.json');
  }

  async load(): Promise<PluginManifest[]> {
    if (!existsSync(this.registryPath)) return [];
    const raw = await readFile(this.registryPath, 'utf-8');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse plugin registry: ${this.registryPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const parsed = registrySchema.safeParse(parsedJson);
    return parsed.success ? parsed.data.plugins : [];
  }

  async save(plugins: PluginManifest[]): Promise<void> {
    const dir = dirname(this.registryPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registryPath, JSON.stringify({ plugins }, null, 2), 'utf-8');
  }

  async register(manifest: unknown): Promise<PluginManifest> {
    const plugin = pluginManifestSchema.parse(manifest);
    const entryValidation = validatePluginEntryPath(plugin.entry, dirname(this.registryPath));
    if (!entryValidation.valid) {
      throw new Error(`Invalid plugin entry path: ${entryValidation.error}`);
    }
    const normalizedPlugin = {
      ...plugin,
      entry: entryValidation.normalized || plugin.entry,
    };
    const plugins = await this.load();
    const idx = plugins.findIndex((p) => p.id === normalizedPlugin.id);
    if (idx >= 0) {
      plugins[idx] = normalizedPlugin;
    } else {
      plugins.push(normalizedPlugin);
    }
    await this.save(plugins);
    return normalizedPlugin;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const plugins = await this.load();
    const plugin = plugins.find((p) => p.id === id);
    if (!plugin) throw new Error(`Plugin not found: ${id}`);
    await this.save(plugins.map((p) => p.id === id ? { ...p, enabled } : p));
  }
}
