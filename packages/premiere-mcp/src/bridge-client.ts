import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BridgeConfig } from "./config.js";
import { Logger } from "./utils/logger.js";

type BridgeEnvelope = {
  id: string;
  action: string;
  params: Record<string, unknown>;
};

export type BridgeResult = {
  id: string;
  ok: boolean;
  [key: string]: unknown;
};

type BridgeMode = "legacy" | "per-request";

type BridgeStatus = {
  bridgeMode?: string;
  bridgeFsAvailable?: boolean;
};

export class BridgeClient {
  private readonly log = new Logger("BridgeClient");

  constructor(private readonly config: BridgeConfig) {}

  async sendCommand(
    action: string,
    params: Record<string, unknown>,
  ): Promise<BridgeResult> {
    const bridgeMode = await this.resolveBridgeMode();
    const id = randomUUID();
    const envelope: BridgeEnvelope = { id, action, params };
    const commandPath =
      bridgeMode === "per-request"
        ? this.commandPathFor(id)
        : this.config.commandFile;
    const responsePath =
      bridgeMode === "per-request"
        ? this.responsePathFor(id)
        : this.legacyResponsePath();

    await mkdir(path.dirname(commandPath), { recursive: true });
    await mkdir(path.dirname(responsePath), { recursive: true });

    if (bridgeMode === "legacy") {
      await rm(responsePath, { force: true }).catch(() => {});
    }

    await writeFile(commandPath, JSON.stringify(envelope), "utf8");

    return this.pollForResult(
      id,
      responsePath,
      bridgeMode === "per-request",
    );
  }

  private commandPathFor(id: string): string {
    return path.join(
      this.bridgeDirectory(),
      `command-${id}.json`,
    );
  }

  private responsePathFor(id: string): string {
    return path.join(
      this.bridgeDirectory(),
      `response-${id}.json`,
    );
  }

  private legacyResponsePath(): string {
    return path.join(
      this.bridgeDirectory(),
      path.basename(this.config.resultFile),
    );
  }

  private bridgeDirectory(): string {
    return path.dirname(this.config.commandFile);
  }

  private statusPath(): string {
    return path.join(this.bridgeDirectory(), "bridge-status.json");
  }

  private bridgeModeFromStatus(status: BridgeStatus): BridgeMode | null {
    if (status.bridgeMode === "per-request") {
      return "per-request";
    }

    if (status.bridgeMode === "legacy") {
      return "legacy";
    }

    if (status.bridgeFsAvailable === true) {
      return "per-request";
    }

    if (status.bridgeFsAvailable === false) {
      return "legacy";
    }

    return null;
  }

  private async resolveBridgeMode(): Promise<BridgeMode> {
    const statusPath = this.statusPath();
    const startedAt = Date.now();
    const waitBudgetMs = Math.min(this.config.timeoutMs, 2000);

    while (Date.now() - startedAt < waitBudgetMs) {
      try {
        const raw = await readFile(statusPath, "utf8");
        const status = JSON.parse(raw) as BridgeStatus;

        const bridgeMode = this.bridgeModeFromStatus(status);

        if (bridgeMode) {
          return bridgeMode;
        }
      } catch {
        // Keep polling until the status file becomes readable or the budget expires.
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.config.pollIntervalMs),
      );
    }

    this.log.warn(
      `Bridge status file was unavailable after ${waitBudgetMs}ms, falling back to legacy bridge mode: ${statusPath}`,
    );
    return "legacy";
  }

  private async pollForResult(
    expectedId: string,
    responsePath: string,
    cleanupResponseFile: boolean,
  ): Promise<BridgeResult> {
    const startedAt = Date.now();
    let mismatchedLegacyResponseId: string | null = null;

    while (Date.now() - startedAt < this.config.timeoutMs) {
      try {
        await access(responsePath);
        const raw = await readFile(responsePath, "utf8");
        const result = JSON.parse(raw) as BridgeResult;

        if (result.id === expectedId) {
          if (cleanupResponseFile) {
            await rm(responsePath, { force: true }).catch(() => {});
          }
          return result;
        }
        if (!cleanupResponseFile) {
          await rm(responsePath, { force: true }).catch(() => {});
          mismatchedLegacyResponseId =
            typeof result.id === "string" ? result.id : "<missing-id>";
        }
      } catch {
        // Keep polling until timeout.
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.config.pollIntervalMs),
      );
    }

    if (mismatchedLegacyResponseId) {
      throw new Error(
        `Discarded mismatched Premiere result in legacy mode: expected ${expectedId}, received ${mismatchedLegacyResponseId}. No matching response arrived before timeout.`,
      );
    }

    throw new Error(`Timed out waiting for Premiere result: ${expectedId}`);
  }
}
