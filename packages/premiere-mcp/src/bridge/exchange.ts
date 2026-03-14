import { join } from 'path';

export const COMMAND_TIMEOUT_MS = 55_000;
export const RESPONSE_TIMEOUT_MS = 60_000;
export const RECOVERY_WAIT_MS = 1_500;
export const SESSION_CONTEXT_FILE_NAME = 'session-context.json';

export interface BridgeExchangePaths {
  commandPath: string;
  responsePath: string;
}

export interface BridgeCommandEnvelope {
  id: string;
  script: string;
  timestamp: string;
  timeoutMs: number;
  expiresAt: string;
}

export interface BridgeActionEnvelope {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export function createBridgeExchangePaths(directory: string, id: string): BridgeExchangePaths {
  return {
    commandPath: join(directory, `command-${id}.json`),
    responsePath: join(directory, `response-${id}.json`),
  };
}

export function createBridgeCommandEnvelope(
  id: string,
  script: string,
  timestamp: Date = new Date(),
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): BridgeCommandEnvelope {
  return {
    id,
    script,
    timestamp: timestamp.toISOString(),
    timeoutMs,
    expiresAt: new Date(timestamp.getTime() + timeoutMs).toISOString(),
  };
}

export function createBridgeActionEnvelope(
  id: string,
  action: string,
  params: Record<string, unknown> = {},
): BridgeActionEnvelope {
  return {
    id,
    action,
    params,
  };
}
