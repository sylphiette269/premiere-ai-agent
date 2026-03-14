import { WRITE_VERIFICATION_MAP } from './comparators.js';
import type { VerificationResult } from './types.js';

export async function verifyWriteOperation(
  toolName: string,
  writeArgs: Record<string, unknown>,
  writeResult: Record<string, unknown>,
  executeReadBack: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<VerificationResult> {
  const spec = WRITE_VERIFICATION_MAP[toolName];
  if (!spec) {
    return {
      confirmed: true,
      verificationLevel: 'exists',
    };
  }

  const startedAt = Date.now();
  try {
    const readBackArgs = spec.extractReadBackArgs(writeArgs, writeResult);
    const readBackResult = await executeReadBack(spec.readBackTool, readBackArgs);
    const result = spec.compare(writeArgs, writeResult, readBackResult);
    result.verificationDurationMs = Date.now() - startedAt;
    return result;
  } catch (error) {
    return {
      confirmed: false,
      verificationLevel: 'missing',
      mismatch: `Verification read-back failed: ${error instanceof Error ? error.message : String(error)}`,
      readBackTool: spec.readBackTool,
      verificationDurationMs: Date.now() - startedAt,
    };
  }
}

export async function withVerification(
  toolName: string,
  writeArgs: Record<string, unknown>,
  writeResult: Record<string, unknown>,
  executeReadBack: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<Record<string, unknown>> {
  if (!writeResult.success && !writeResult.ok) {
    return writeResult;
  }

  const verification = await verifyWriteOperation(
    toolName,
    writeArgs,
    writeResult,
    executeReadBack,
  );

  return {
    ...writeResult,
    verification,
  };
}
