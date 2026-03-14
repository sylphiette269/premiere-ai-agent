import { exec as runShellCommand } from "child_process";
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";
import { join } from "path";

import { Logger } from "../utils/logger.js";
import { getGeneratedVerificationArtifactImportError } from "../utils/generated-media-guards.js";
import { createSecureTempDir, validateFilePath, validateNumber } from "../utils/security.js";
import {
  createBridgeActionEnvelope,
  createBridgeCommandEnvelope,
  createBridgeExchangePaths,
  RECOVERY_WAIT_MS,
  RESPONSE_TIMEOUT_MS,
  SESSION_CONTEXT_FILE_NAME,
} from "./exchange.js";
import { wrapBridgeScript } from "./extendscript-runtime.js";
import { resolveConfiguredBridgeDirectory, resolveRecoveryScriptPath } from "./paths.js";
import {
  buildAddToTimelineScript,
  buildCreateProjectScript,
  buildCreateSequenceScript,
  buildImportMediaScript,
  buildListProjectItemsScript,
  buildOpenProjectScript,
  buildRenderSequenceScript,
  buildSaveProjectScript,
} from "./script-builders.js";
import {
  buildRecoveryCommand as composeRecoveryCommand,
  escapePowerShellArgument,
  extractSessionContext,
  parseSessionContext,
  resolveRecoveryWaitMs,
} from "./recovery.js";
import type {
  PremiereClip,
  PremiereItem,
  PremiereProject,
  PremiereSequence,
  PremiereSequenceCreateOptions,
  PremiereSequenceSettings,
  SessionContext,
} from "./types.js";

export type {
  PremiereClip,
  PremiereItem,
  PremiereProject,
  PremiereSequence,
  PremiereSequenceCreateOptions,
  PremiereSequenceSettings,
  PremiereTrack,
} from "./types.js";

export class PremiereBridge {
  private readonly log: Logger;
  private dir: string;
  private readonly externalDir: boolean;
  private ready = false;
  private readonly sid: string;

  constructor() {
    this.log = new Logger("PremiereBridge");
    this.sid = randomUUID();

    const configuredDir = resolveConfiguredBridgeDirectory();
    this.externalDir = Boolean(configuredDir);
    this.dir = configuredDir || createSecureTempDir(this.sid);
  }

  getBridgeDirectory(): string {
    return this.dir;
  }

  private quote(value: string): string {
    return JSON.stringify(value);
  }

  async initialize(): Promise<void> {
    try {
      await fsp.mkdir(this.dir, { recursive: true, mode: 0o700 });
      this.ready = true;
      this.log.info("PremiereBridge ready, dir=" + this.dir);
    } catch (error) {
      this.log.error("PremiereBridge init failed:", error);
      throw error;
    }
  }

  async run(script: string): Promise<unknown> {
    return this.runWithRecovery(script, true);
  }

  async executeScript(script: string): Promise<unknown> {
    return this.run(script);
  }

  private async runAction(action: string, params: Record<string, unknown>): Promise<unknown> {
    return this.runActionWithRecovery(action, params, true);
  }

  private async removeExchangeFiles(paths: { commandPath: string; responsePath: string }): Promise<void> {
    await fsp.unlink(paths.commandPath).catch(() => {});
    await fsp.unlink(paths.responsePath).catch(() => {});
  }

  private async runWithRecovery(script: string, canRecover: boolean): Promise<unknown> {
    if (!this.ready) {
      throw new Error("PremiereBridge not initialized.");
    }

    const requestId = randomUUID();
    const exchangePaths = createBridgeExchangePaths(this.dir, requestId);
    const wrappedScript = wrapBridgeScript(script);

    try {
      await fsp.writeFile(
        exchangePaths.commandPath,
        JSON.stringify(createBridgeCommandEnvelope(requestId, wrappedScript)),
      );

      const result = await this.waitForResponse(exchangePaths.responsePath);
      await this.saveContext(result);
      await this.removeExchangeFiles(exchangePaths);
      return result;
    } catch (error) {
      await this.removeExchangeFiles(exchangePaths);

      if (canRecover && this.isTimeoutError(error)) {
        const recovered = await this.attemptRecovery();
        if (recovered) {
          this.log.warn("Retrying after bridge recovery");
          return this.runWithRecovery(script, false);
        }
      }

      this.log.error("Script execution failed:", error);
      throw error;
    }
  }

  private async runActionWithRecovery(
    action: string,
    params: Record<string, unknown>,
    canRecover: boolean,
  ): Promise<unknown> {
    if (!this.ready) {
      throw new Error("PremiereBridge not initialized.");
    }

    const requestId = randomUUID();
    const exchangePaths = createBridgeExchangePaths(this.dir, requestId);

    try {
      await fsp.writeFile(
        exchangePaths.commandPath,
        JSON.stringify(createBridgeActionEnvelope(requestId, action, params)),
      );

      const result = await this.waitForResponse(exchangePaths.responsePath);
      await this.saveContext(result);
      await this.removeExchangeFiles(exchangePaths);
      return result;
    } catch (error) {
      await this.removeExchangeFiles(exchangePaths);

      if (canRecover && this.isTimeoutError(error)) {
        const recovered = await this.attemptRecovery();
        if (recovered) {
          this.log.warn("Retrying after bridge recovery");
          return this.runActionWithRecovery(action, params, false);
        }
      }

      this.log.error("Action execution failed:", error);
      throw error;
    }
  }

  private async waitForResponse(responsePath: string, timeoutMs: number = RESPONSE_TIMEOUT_MS): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const raw = await fsp.readFile(responsePath, "utf8");
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch (error) {
          if (error instanceof SyntaxError && this.isRetryableResponseParseError(raw, error)) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            continue;
          }

          throw new Error(`Invalid Premiere bridge response JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        return parsed.result !== undefined ? parsed.result : parsed;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `PremiereBridge timeout. Ensure Premiere Pro is open, CEP panel is running, and bridge directory is: ${this.dir}`,
    );
  }

  private isTimeoutError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("PremiereBridge timeout");
  }

  private isRetryableResponseParseError(raw: string, error: SyntaxError): boolean {
    const trimmed = raw.trim();
    if (!trimmed) {
      return true;
    }

    const normalizedMessage = error.message.toLowerCase();
    return normalizedMessage.includes("unexpected end of json input")
      || normalizedMessage.includes("unterminated string")
      || (
        (trimmed.startsWith("{") || trimmed.startsWith("["))
        && !(trimmed.endsWith("}") || trimmed.endsWith("]"))
      );
  }

  private normalizeSequenceSettings(settings?: PremiereSequenceSettings): PremiereSequenceSettings | undefined {
    if (!settings) {
      return undefined;
    }

    const normalized: PremiereSequenceSettings = {};
    const validations: Array<[keyof PremiereSequenceSettings, string, number]> = [
      ["width", "sequence width", 1],
      ["height", "sequence height", 1],
      ["frameRate", "frame rate", 0.000001],
      ["sampleRate", "sample rate", 1],
    ];

    for (const [key, label, min] of validations) {
      const value = settings[key];
      if (value === undefined) {
        continue;
      }

      const validation = validateNumber(value, min);
      if (!validation.valid) {
        throw new Error(`Invalid ${label}: ${validation.error}`);
      }

      normalized[key] = validation.value as number;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private contextFile(): string {
    return join(this.dir, SESSION_CONTEXT_FILE_NAME);
  }

  private async saveContext(result: unknown): Promise<void> {
    const context = extractSessionContext(result);
    if (!context) {
      return;
    }

    try {
      await fsp.writeFile(this.contextFile(), JSON.stringify(context));
    } catch (error) {
      this.log.warn("Failed to save session context:", error);
    }
  }

  private async loadContext(): Promise<SessionContext | null> {
    try {
      const raw = await fsp.readFile(this.contextFile(), "utf8");
      return parseSessionContext(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") {
        this.log.warn("Failed to load context:", error);
      }
      return null;
    }
  }

  private recoveryScriptPath(): string | null {
    return resolveRecoveryScriptPath(process.argv[1] || process.cwd(), process.platform);
  }

  private async buildRecoveryCommand(): Promise<string> {
    const configuredCommand = String(process.env.PREMIERE_BRIDGE_RECOVERY_COMMAND || "").trim();
    if (configuredCommand) {
      return configuredCommand;
    }

    const scriptPath = this.recoveryScriptPath();
    if (!scriptPath) {
      return "";
    }

    const context = await this.loadContext();
    return composeRecoveryCommand(
      scriptPath,
      this.dir,
      context?.projectPath,
      escapePowerShellArgument,
    );
  }

  private recoveryWaitMs(): number {
    return resolveRecoveryWaitMs(process.env, RECOVERY_WAIT_MS);
  }

  private async attemptRecovery(): Promise<boolean> {
    const command = await this.buildRecoveryCommand();
    if (!command) {
      return false;
    }

    this.log.warn("Running recovery command:", command);

    try {
      await new Promise<void>((resolve, reject) => {
        runShellCommand(command, (error, stdout, stderr) => {
          if (stdout?.trim()) {
            this.log.info("Recovery stdout:", stdout.trim());
          }
          if (stderr?.trim()) {
            this.log.warn("Recovery stderr:", stderr.trim());
          }
          error ? reject(error) : resolve();
        });
      });
    } catch (error) {
      this.log.error("Recovery failed:", error);
      return false;
    }

    const waitMs = this.recoveryWaitMs();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    return true;
  }

  async createProject(name: string, location: string): Promise<PremiereProject> {
    return this.run(buildCreateProjectScript(name, location, this.quote.bind(this))) as Promise<PremiereProject>;
  }

  async openProject(filePath: string): Promise<PremiereProject> {
    return this.run(buildOpenProjectScript(filePath, this.quote.bind(this))) as Promise<PremiereProject>;
  }

  async saveProject(): Promise<void> {
    await this.run(buildSaveProjectScript());
  }

  async importMedia(filePath: string): Promise<PremiereItem> {
    const artifactError = getGeneratedVerificationArtifactImportError(filePath);
    if (artifactError) {
      throw new Error(artifactError);
    }

    const validation = validateFilePath(filePath);
    if (!validation.valid) {
      throw new Error(`Invalid file path: ${validation.error}`);
    }

    const safePath = validation.normalized || filePath;
    return this.run(buildImportMediaScript(safePath, this.quote.bind(this))) as Promise<PremiereItem>;
  }

  async createSequence(
    name: string,
    presetPath?: string,
    settings?: PremiereSequenceSettings,
    options?: PremiereSequenceCreateOptions,
  ): Promise<PremiereSequence> {
    const safeSettings = this.normalizeSequenceSettings(settings);
    const actionParams: Record<string, unknown> = {
      name,
    };
    if (typeof presetPath === "string" && presetPath.trim()) {
      actionParams.presetPath = presetPath;
    }
    if (typeof options?.mediaPath === "string" && options.mediaPath.trim()) {
      actionParams.mediaPath = options.mediaPath;
    }
    if (options?.avoidCreateNewSequence === true) {
      actionParams.avoidCreateNewSequence = true;
    }

    const actionResult = await this.runAction("create_sequence", actionParams) as Record<string, unknown>;
    if (actionResult && actionResult.ok === false) {
      const actionError = String(
        actionResult.error
          ?? actionResult.details
          ?? "create_sequence_failed",
      );
      throw new Error(actionError);
    }

    const resolvedSequenceName = typeof actionResult.sequenceName === "string" && actionResult.sequenceName.trim()
      ? actionResult.sequenceName.trim()
      : name;
    const sequenceResult = await this.run(
      buildCreateSequenceScript(resolvedSequenceName, safeSettings, this.quote.bind(this)),
    ) as Record<string, unknown>;

    if (sequenceResult && sequenceResult.success === false) {
      const sequenceError = String(
        sequenceResult.error
          ?? sequenceResult.details
          ?? "created_sequence_not_found",
      );
      throw new Error(sequenceError);
    }

    return sequenceResult as unknown as PremiereSequence;
  }

  async addToTimeline(
    sequenceId: string,
    projectItemId: string,
    trackIndex: number,
    time: number,
  ): Promise<PremiereClip> {
    const validatedTrackIndex = validateNumber(trackIndex, 0);
    if (!validatedTrackIndex.valid) {
      throw new Error(`Invalid track index: ${validatedTrackIndex.error}`);
    }

    const validatedTime = validateNumber(time, 0);
    if (!validatedTime.valid) {
      throw new Error(`Invalid timeline position: ${validatedTime.error}`);
    }

    const safeTrackIndex = validatedTrackIndex.value as number;
    const safeTime = validatedTime.value as number;

    return this.run(
      buildAddToTimelineScript(
        sequenceId,
        projectItemId,
        safeTrackIndex,
        safeTime,
        this.quote.bind(this),
      ),
    ) as Promise<PremiereClip>;
  }

  async renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<void> {
    const result = await this.run(
      buildRenderSequenceScript(sequenceId, outputPath, presetPath, this.quote.bind(this)),
    ) as Record<string, unknown>;

    if (result && result.success === false) {
      throw new Error(String(result.error ?? result.details ?? "render_sequence_failed"));
    }
  }

  async listProjectItems(): Promise<PremiereItem[]> {
    const result = await this.run(buildListProjectItemsScript()) as {
      ok: boolean;
      items?: PremiereItem[];
      error?: string;
    };

    if (result.ok) {
      return result.items ?? [];
    }

    throw new Error(result.error || "Unknown error listing project items");
  }

  async cleanup(): Promise<void> {
    try {
      if (!this.externalDir) {
        await fsp.rm(this.dir, { recursive: true });
      }
    } catch (error) {
      this.log.warn("Failed to clean up bridge directory:", error);
    }

    this.log.info("PremiereBridge cleaned up");
  }
}
