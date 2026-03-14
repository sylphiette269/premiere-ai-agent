import assert from "node:assert/strict";
import test from "node:test";

type SignalName = "SIGINT" | "SIGTERM";

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

test("runPremiereMcpServer waits for an in-flight connect before stopping on SIGINT", async () => {
  const handlers = new Map<SignalName, () => void>();
  const connectDeferred = createDeferred();
  const calls: string[] = [];
  const exitCalls: number[] = [];
  const server = {
    async start() {
      calls.push("start");
    },
    async connect() {
      calls.push("connect");
      return connectDeferred.promise;
    },
    async stop() {
      calls.push("stop");
    },
  };

  const { runPremiereMcpServer } = await import("../src/server-entry.js");

  const runPromise = runPremiereMcpServer({
    server,
    createTransport: () => ({ start: async () => undefined }),
    processController: {
      once(signal: SignalName, handler: () => void) {
        handlers.set(signal, handler);
        return process;
      },
      exit(code: number) {
        exitCalls.push(code);
      },
    },
  });

  await Promise.resolve();

  handlers.get("SIGINT")?.();
  await Promise.resolve();

  assert.deepEqual(calls, ["start", "connect"]);
  assert.deepEqual(exitCalls, []);

  connectDeferred.resolve();
  await runPromise;

  assert.deepEqual(calls, ["start", "connect", "stop"]);
  assert.deepEqual(exitCalls, [0]);
});

test("runPremiereMcpServer logs shutdown errors raised after SIGTERM", async () => {
  const handlers = new Map<SignalName, () => void>();
  const connectDeferred = createDeferred();
  const exitCalls: number[] = [];
  const logLines: unknown[][] = [];
  const server = {
    async start() {
      return undefined;
    },
    async connect() {
      return connectDeferred.promise;
    },
    async stop() {
      throw new Error("stop_failed");
    },
  };

  const { runPremiereMcpServer } = await import("../src/server-entry.js");

  const runPromise = runPremiereMcpServer({
    server,
    createTransport: () => ({ start: async () => undefined }),
    processController: {
      once(signal: SignalName, handler: () => void) {
        handlers.set(signal, handler);
        return process;
      },
      exit(code: number) {
        exitCalls.push(code);
      },
    },
    logError: (...args: unknown[]) => {
      logLines.push(args);
    },
  });

  await Promise.resolve();

  handlers.get("SIGTERM")?.();
  await Promise.resolve();
  connectDeferred.resolve();
  await runPromise;

  assert.equal(exitCalls[0], 1);
  assert.match(String(logLines[0]?.[0]), /shut down/i);
  assert.match(String(logLines[0]?.[1]), /stop_failed/i);
});
