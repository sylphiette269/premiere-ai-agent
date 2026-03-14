import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const PANEL_SOURCE_PATHS = [
  path.join(process.cwd(), "cep-panel", "js", "panel-core.js"),
  path.join(process.cwd(), "cep-panel", "js", "panel-scripts.js"),
  path.join(process.cwd(), "cep-panel", "js", "panel-runtime.js"),
  path.join(process.cwd(), "cep-panel", "js", "panel.js"),
];

type PanelHelpers = {
  PANEL_VERSION: string;
  buildActionScript(cmd: {
    id: string;
    action: string;
    params?: Record<string, unknown>;
  }): string;
  buildChooseProjectScript(): string;
  readCommandFile(bridgeFs: {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: string): string;
    unlinkSync(path: string): void;
  } | null | undefined, filePath: string): string;
  buildWriteFileScript(filePath: string, text: string, append?: boolean): string;
  createPanelRuntime(options: {
    cs: { evalScript(script: string, callback?: (value: string) => void): void };
    bridgeFs?: {
      existsSync(path: string): boolean;
      readdirSync?(path: string): string[];
      readFileSync(path: string, encoding: string): string;
      unlinkSync(path: string): void;
    };
    extensionId?: string;
    updateStatus(message: string): void;
    setTimer(fn: () => void, delayMs: number): unknown;
    clearTimer?(handle: unknown): void;
  }): {
    executeCmd(cmd: { id: string; action: string; params?: Record<string, unknown> }): void;
    poll(): void;
    start(): void;
  };
  createVisiblePanelController(options: {
    cs: {
      evalScript(script: string, callback?: (value: string) => void): void;
      requestOpenExtension?(extensionId: string, params: string): void;
    };
    extensionId?: string;
    fs?: {
      existsSync(path: string): boolean;
      readFileSync(path: string, encoding: string): string;
      statSync?(path: string): { size: number };
      openSync?(path: string, flags: string): unknown;
      readSync?(
        fd: unknown,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number,
      ): number;
      closeSync?(fd: unknown): void;
    };
    ui?: {
      log(message: string, level?: string): void;
      setBridgeStatus(connected: boolean, text?: string): void;
      setPremiereStatus(connected: boolean, text?: string): void;
      setProjectPath?(value: string): void;
    };
    writeBridgeControl(enabled: boolean): void;
    setTimer?(fn: () => void, delayMs: number): unknown;
    clearTimer?(handle: unknown): void;
  }): {
    chooseProject(): void;
    openProject(): void;
    startBridge(): void;
    stopBridge(): void;
    startLogSync(): void;
    stopLogSync(): void;
  };
  getCompanionExtensionToOpen(extensionId: string): string;
  getReadyStatus(extensionId: string): string;
  shouldPollExtension(extensionId: string): boolean;
};

async function loadPanelHelpers(
  initialGlobals: Record<string, unknown> = {},
): Promise<PanelHelpers> {
  const context = {
    console,
    globalThis: {} as Record<string, unknown>,
    ...initialGlobals,
  };

  context.globalThis = context;
  vm.createContext(context);
  for (const sourcePath of PANEL_SOURCE_PATHS) {
    const source = await readFile(sourcePath, "utf8");
    vm.runInContext(source, context, { filename: sourcePath });
  }

  return (context as { __PR_MCP_PANEL__: PanelHelpers }).__PR_MCP_PANEL__;
}

function createMockFileContext() {
  const files = new Map<string, string>();

  function File(this: {
    path: string;
    encoding: string;
    exists: boolean;
    _mode?: string;
  }, filePath: string) {
    this.path = filePath;
    this.encoding = "UTF-8";
    this.exists = files.has(filePath);
  }

  File.prototype.open = function open(mode: string) {
    this._mode = mode;
    if (mode === "w") {
      files.set(this.path, "");
      this.exists = true;
    } else if (mode === "a") {
      if (!files.has(this.path)) {
        files.set(this.path, "");
      }
      this.exists = true;
    }
    return true;
  };

  File.prototype.read = function read() {
    return files.get(this.path) ?? "";
  };

  File.prototype.write = function write(text: string) {
    const current = files.get(this.path) ?? "";
    if (this._mode === "a") {
      files.set(this.path, current + text);
      return;
    }
    files.set(this.path, text);
  };

  File.prototype.close = function close() {};
  File.prototype.remove = function remove() {
    files.delete(this.path);
    this.exists = false;
  };

  return { File, files };
}

function assertAvoidsHostSlashReplaceRegex(script: string) {
  assert.equal(
    script.includes("replace(/\\\\/g,'/')"),
    false,
    "generated ExtendScript should avoid slash-replacement regexes that Premiere 2022 rejects via evalScript",
  );
}

test("buildWriteFileScript preserves quotes, backslashes, and newlines", async () => {
  const panel = await loadPanelHelpers();
  const payload = '{"projectPath":"C:\\\\temp\\\\demo.prproj","message":"line1\\n\\"line2\\""}';
  const script = panel.buildWriteFileScript("C:/pr-mcp-cmd/result.json", payload, false);
  const fileContext = createMockFileContext();

  vm.runInNewContext(script, fileContext);

  assert.equal(fileContext.files.get("C:/pr-mcp-cmd/result.json"), payload);
});

test("quoteJsString escapes non-ASCII characters for ExtendScript source", async () => {
  const panel = await loadPanelHelpers();

  assert.equal(
    panel.quoteJsString("E:/作业1/sample1.jpg"),
    '"E:/\\u4f5c\\u4e1a1/sample1.jpg"',
  );
});

test("buildReadCommandScript reports a file-open failure with a sentinel value", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildReadCommandScript("C:/pr-mcp-cmd/cmd.json");

  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; open: (mode: string) => boolean }, _filePath: string) {
      this.exists = true;
      this.open = function open(_mode: string) {
        return false;
      };
    },
  });

  assert.equal(result, "__open_failed__");
});

test("buildChooseProjectScript avoids slash-replacement regexes in ExtendScript", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildChooseProjectScript();

  assertAvoidsHostSlashReplaceRegex(script);
});

test("readCommandFile returns file contents and removes the command file", async () => {
  const panel = await loadPanelHelpers();
  const calls: string[] = [];
  const bridgeFs = {
    existsSync(filePath: string) {
      calls.push(`exists:${filePath}`);
      return true;
    },
    readFileSync(filePath: string, encoding: string) {
      calls.push(`read:${filePath}:${encoding}`);
      return '{"id":"demo-id","action":"get_project_info","params":{}}';
    },
    unlinkSync(filePath: string) {
      calls.push(`unlink:${filePath}`);
    },
  };

  const result = panel.readCommandFile(bridgeFs, "C:/pr-mcp-cmd/cmd.json");

  assert.equal(result, '{"id":"demo-id","action":"get_project_info","params":{}}');
  assert.deepEqual(calls, [
    "exists:C:/pr-mcp-cmd/cmd.json",
    "read:C:/pr-mcp-cmd/cmd.json:utf8",
    "unlink:C:/pr-mcp-cmd/cmd.json",
  ]);
});

test("poll consumes a per-request command file and writes a matching per-request response file", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const calls: string[] = [];
  const bridgeFs = {
    existsSync(filePath: string) {
      calls.push(`exists:${filePath}`);
      return false;
    },
    readdirSync(dirPath: string) {
      calls.push(`readdir:${dirPath}`);
      return ["command-demo-id.json"];
    },
    readFileSync(filePath: string, encoding: string) {
      calls.push(`read:${filePath}:${encoding}`);
      return '{"id":"demo-id","action":"get_project_info","params":{}}';
    },
    unlinkSync(filePath: string) {
      calls.push(`unlink:${filePath}`);
    },
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callback(
            JSON.stringify({
              ok: true,
              projectName: "Demo.prproj",
              projectPath: "E:/浣滀笟1/Demo.prproj",
              activeSequence: null,
              itemCount: 0,
              id: "demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.poll();

  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("C:/pr-mcp-cmd/response-demo-id.json") ?? "{}",
    ),
    {
      ok: true,
      projectName: "Demo.prproj",
      projectPath: "E:/浣滀笟1/Demo.prproj",
      activeSequence: null,
      itemCount: 0,
      id: "demo-id",
    },
  );
  assert.equal(fileContext.files.has("C:/pr-mcp-cmd/result.json"), false);
  assert.deepEqual(calls, [
    "exists:C:/pr-mcp-cmd/bridge-control.json",
    "readdir:C:/pr-mcp-cmd",
    "read:C:/pr-mcp-cmd/command-demo-id.json:utf8",
    "unlink:C:/pr-mcp-cmd/command-demo-id.json",
  ]);
});

test("poll clears the eval timeout once a bridge command callback settles", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const cleared: string[] = [];
  const bridgeFs = {
    existsSync(_filePath: string) {
      return false;
    },
    readdirSync(_dirPath: string) {
      return ["command-demo-id.json"];
    },
    readFileSync(_filePath: string, _encoding: string) {
      return '{"id":"demo-id","action":"get_project_info","params":{}}';
    },
    unlinkSync(_filePath: string) {},
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callback(JSON.stringify({
            ok: true,
            id: "demo-id",
          }));
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {
      return "timer-1";
    },
    clearTimer(handle) {
      cleared.push(String(handle));
    },
  });

  runtime.poll();

  assert.deepEqual(cleared, ["timer-1"]);
});

test("poll executes a raw script bridge command and writes a matching per-request response file", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const rawCommand = {
    id: "raw-demo-id",
    script:
      "(function(){return JSON.stringify({ok:true,source:'raw-script',id:'raw-demo-id'});})()",
    timestamp: new Date("2099-03-08T12:00:00.000Z").toISOString(),
    timeoutMs: 1000,
    expiresAt: new Date("2099-03-08T12:01:00.000Z").toISOString(),
  };
  const bridgeFs = {
    existsSync(_filePath: string) {
      return false;
    },
    readdirSync(_dirPath: string) {
      return ["command-raw-demo-id.json"];
    },
    readFileSync(_filePath: string, _encoding: string) {
      return JSON.stringify(rawCommand);
    },
    unlinkSync(_filePath: string) {},
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callback(
            JSON.stringify({
              ok: true,
              source: "raw-script",
              id: "raw-demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.poll();

  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("C:/pr-mcp-cmd/response-raw-demo-id.json") ?? "{}",
    ),
    {
      ok: true,
      source: "raw-script",
      id: "raw-demo-id",
    },
  );
});

test("poll skips expired raw script commands and writes an expired response", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  let callbackInvocations = 0;
  const bridgeFs = {
    existsSync(_filePath: string) {
      return false;
    },
    readdirSync(_dirPath: string) {
      return ["command-expired-demo-id.json"];
    },
    readFileSync(_filePath: string, _encoding: string) {
      return JSON.stringify({
        id: "expired-demo-id",
        script:
          "(function(){return JSON.stringify({ok:true,source:'raw-script',id:'expired-demo-id'});})()",
        timestamp: new Date("2026-03-08T12:00:00.000Z").toISOString(),
        timeoutMs: 1000,
        expiresAt: new Date("2026-03-08T11:59:00.000Z").toISOString(),
      });
    },
    unlinkSync(_filePath: string) {},
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callbackInvocations += 1;
          callback(
            JSON.stringify({
              ok: true,
              source: "raw-script",
              id: "expired-demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.poll();

  assert.equal(callbackInvocations, 0);
  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("C:/pr-mcp-cmd/response-expired-demo-id.json") ?? "{}",
    ),
    {
      ok: false,
      error: "command_expired",
      expired: true,
      id: "expired-demo-id",
    },
  );
});

test("panel runtime honors a global bridge directory override", async () => {
  const panel = await loadPanelHelpers({
    __PR_MCP_BRIDGE_DIR__: "D:/custom-bridge",
  });
  const fileContext = createMockFileContext();
  const calls: string[] = [];
  const bridgeFs = {
    existsSync(_filePath: string) {
      return false;
    },
    readdirSync(dirPath: string) {
      calls.push(`readdir:${dirPath}`);
      return ["command-demo-id.json"];
    },
    readFileSync(filePath: string, encoding: string) {
      calls.push(`read:${filePath}:${encoding}`);
      return '{"id":"demo-id","action":"get_project_info","params":{}}';
    },
    unlinkSync(filePath: string) {
      calls.push(`unlink:${filePath}`);
    },
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callback(
            JSON.stringify({
              ok: true,
              projectName: "Demo.prproj",
              projectPath: "D:/custom-bridge/Demo.prproj",
              activeSequence: null,
              itemCount: 0,
              id: "demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    extensionId: "com.pr.mcp.panel.hidden",
    updateStatus() {},
    setTimer() {},
  });

  runtime.start();

  assert.deepEqual(calls.slice(0, 3), [
    "readdir:D:/custom-bridge",
    "read:D:/custom-bridge/command-demo-id.json:utf8",
    "unlink:D:/custom-bridge/command-demo-id.json",
  ]);
  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("D:/custom-bridge/bridge-status.json") ?? "{}",
    ),
    {
      panelVersion: panel.PANEL_VERSION,
      bridgeFsAvailable: true,
      bridgeMode: "per-request",
      extensionId: "com.pr.mcp.panel.hidden",
    },
  );
  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("D:/custom-bridge/response-demo-id.json") ?? "{}",
    ),
    {
      ok: true,
      projectName: "Demo.prproj",
      projectPath: "D:/custom-bridge/Demo.prproj",
      activeSequence: null,
      itemCount: 0,
      id: "demo-id",
    },
  );
});

test("start publishes a legacy bridge status file when bridgeFs is unavailable", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();

  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callback("");
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    extensionId: "com.pr.mcp.panel.hidden",
    updateStatus() {},
    setTimer() {},
  });

  runtime.start();

  assert.deepEqual(
    JSON.parse(
      fileContext.files.get("C:/pr-mcp-cmd/bridge-status.json") ?? "{}",
    ),
    {
      panelVersion: panel.PANEL_VERSION,
      bridgeFsAvailable: false,
      bridgeMode: "legacy",
      extensionId: "com.pr.mcp.panel.hidden",
    },
  );
});

test("poll prefers the bridge filesystem over evalScript when bridgeFs is available", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const evalScripts: string[] = [];
  const bridgeFs = {
    existsSync(filePath: string) {
      return filePath === "C:/pr-mcp-cmd/cmd.json";
    },
    readFileSync(_filePath: string, _encoding: string) {
      return '{"id":"demo-id","action":"get_project_info","params":{}}';
    },
    unlinkSync(_filePath: string) {},
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(script, callback) {
        evalScripts.push(script);

        if (callback) {
          callback(
            JSON.stringify({
              ok: true,
              projectName: "Demo.prproj",
              projectPath: "E:/作业1/Demo.prproj",
              activeSequence: null,
              itemCount: 0,
              id: "demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.poll();

  assert.equal(
    evalScripts.some((script) => script.includes("cmd.json")),
    false,
  );

  assert.deepEqual(JSON.parse(fileContext.files.get("C:/pr-mcp-cmd/result.json") ?? "{}"), {
    ok: true,
    projectName: "Demo.prproj",
    projectPath: "E:/作业1/Demo.prproj",
    activeSequence: null,
    itemCount: 0,
    id: "demo-id",
  });
});

test("poll skips bridge command execution when bridge control is disabled", async () => {
  const panel = await loadPanelHelpers();
  const calls: string[] = [];
  const bridgeFs = {
    existsSync(filePath: string) {
      calls.push(`exists:${filePath}`);
      return filePath === "C:/pr-mcp-cmd/bridge-control.json";
    },
    readdirSync(dirPath: string) {
      calls.push(`readdir:${dirPath}`);
      return ["command-demo-id.json"];
    },
    readFileSync(filePath: string, encoding: string) {
      calls.push(`read:${filePath}:${encoding}`);
      return '{"enabled":false}';
    },
    unlinkSync(filePath: string) {
      calls.push(`unlink:${filePath}`);
    },
  };

  const runtime = panel.createPanelRuntime({
    bridgeFs,
    cs: {
      evalScript(_script, callback) {
        if (callback) {
          callback(JSON.stringify({ ok: true, id: "demo-id" }));
        }
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.poll();

  assert.deepEqual(calls, [
    "exists:C:/pr-mcp-cmd/bridge-control.json",
    "read:C:/pr-mcp-cmd/bridge-control.json:utf8",
  ]);
});

test("buildActionScript get_project_info returns project path and item count", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "demo-id",
    action: "get_project_info",
    params: {},
  });

  const result = vm.runInNewContext(script, {
    JSON,
    ProjectItemType: { BIN: 2 },
    app: {
      project: {
        name: "Demo.prproj",
        path: "E:/作业1/Demo.prproj",
        activeSequence: {
          name: "Main",
          videoTracks: { numTracks: 1 },
          end: 254016000000 * 5,
        },
        rootItem: {
          children: {
            numItems: 2,
            0: { type: 1 },
            1: {
              type: 2,
              children: {
                numItems: 1,
                0: { type: 1 },
              },
            },
          },
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    projectName: "Demo.prproj",
    projectPath: "E:/作业1/Demo.prproj",
    activeSequence: {
      name: "Main",
      videoTracks: 1,
      duration: 5,
    },
    itemCount: 3,
    id: "demo-id",
  });
});

test("buildActionScript get_project_info returns a structured error when project access throws", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "demo-id",
    action: "get_project_info",
    params: {},
  });

  const result = vm.runInNewContext(script, {
    JSON,
    app: {
      get project() {
        throw new Error("project_unavailable");
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "get_project_info_exception",
    details: "Error: project_unavailable",
    id: "demo-id",
  });
});

test("buildActionScript get_project_info tolerates a project path access failure", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "demo-id",
    action: "get_project_info",
    params: {},
  });

  const result = vm.runInNewContext(script, {
    app: {
      project: {
        name: "Demo.prproj",
        get path() {
          throw new Error("path_unavailable");
        },
        activeSequence: null,
        rootItem: {
          children: {
            numItems: 1,
            0: { type: 1 },
          },
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    projectName: "Demo.prproj",
    projectPath: "",
    activeSequence: null,
    itemCount: 1,
    id: "demo-id",
  });
});

test("buildActionScript ping returns a minimal success payload", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "ping-id",
    action: "ping",
    params: {},
  });

  const result = vm.runInNewContext(script, { JSON });

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    action: "ping",
    id: "ping-id",
  });
  assert.equal(script.includes("JSON.stringify"), false);
});

test("buildActionScript open_project opens a project document through Premiere", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "open-id",
    action: "open_project",
    params: {
      path: "C:/pr-mcp-cmd/mcp-test.prproj",
    },
  });

  const openedPaths: string[] = [];
  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === "C:/pr-mcp-cmd/mcp-test.prproj";
      this.fsName = "C:\\pr-mcp-cmd\\mcp-test.prproj";
    },
    $: {
      sleep() {},
    },
    app: {
      project: {
        name: "",
        path: "",
      },
      openDocument(projectPath: string) {
        openedPaths.push(projectPath);
        this.project.name = "mcp-test.prproj";
        this.project.path = projectPath;
        return true;
      },
    },
  });

  assert.deepEqual(openedPaths, ["C:\\pr-mcp-cmd\\mcp-test.prproj"]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    projectName: "mcp-test.prproj",
    projectPath: "C:\\pr-mcp-cmd\\mcp-test.prproj",
    id: "open-id",
  });
});

test("buildActionScript call_plugin returns executable ExtendScript with plugin dispatch results", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "plugin-call-id",
    action: "call_plugin",
    params: {
      entry: "E:/plugins/demo.jsx",
      method: "run",
      params: {
        amount: 2,
      },
    },
  });

  assert.doesNotThrow(() => new vm.Script(script));

  const context: Record<string, unknown> = {
    __toJson: JSON.stringify,
    File: function File(this: { exists: boolean }, _filePath: string) {
      this.exists = true;
    },
  };

  context.$ = {
    evalFile() {
      context.__pluginDispatch = function __pluginDispatch(method: string, params: Record<string, unknown>) {
        return { method, params };
      };
    },
  };

  const result = vm.runInNewContext(script, context);

  assert.deepEqual(JSON.parse(String(result)), {
    ok: true,
    result: {
      method: "run",
      params: {
        amount: 2,
      },
    },
    id: "plugin-call-id",
  });
});

test("buildActionScript create_sequence prefers createNewSequence when it is available", async () => {
  const panel = await loadPanelHelpers();
  const presetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Preset Sequence",
      presetPath,
    },
  });
  const calls: Array<{ name: string; sequenceID: string }> = [];

  const result = vm.runInNewContext(script, {
    JSON,
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project: {
        activeSequence: null,
        createNewSequence(name: string, sequenceID: string) {
          calls.push({ name, sequenceID });
          this.activeSequence = { name, sequenceID };
          return this.activeSequence;
        },
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "Preset Sequence");
  assert.match(calls[0]?.sequenceID ?? "", /^mcp-seq-/);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Preset Sequence",
    requestedPresetPath: presetPath,
    presetPath: "",
    mode: "createNewSequence",
    id: "create-id",
  });
  assert.equal(script.includes("newSequence(name,presetPath)"), true);
});

test("buildActionScript create_sequence uses createNewSequenceFromClips when mediaPath is provided", async () => {
  const panel = await loadPanelHelpers();
  const mediaPath = "C:/pr-mcp-cmd/sample1.jpg";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Clip Driven Sequence",
      mediaPath,
    },
  });

  const projectItem = {
    type: 1,
    getMediaPath() {
      return "C:\\pr-mcp-cmd\\sample1.jpg";
    },
  };
  const rootItem = {
    children: {
      numItems: 1,
      0: projectItem,
    },
  };

  const calls: Array<{ name: string; items: unknown[]; destinationBin: unknown }> = [];
  const result = vm.runInNewContext(script, {
    JSON,
    ProjectItemType: { CLIP: 1, BIN: 2 },
    app: {
      project: {
        rootItem,
        activeSequence: null,
        createNewSequenceFromClips(name: string, items: unknown[], destinationBin: unknown) {
          calls.push({ name, items, destinationBin });
          this.activeSequence = { name };
          return this.activeSequence;
        },
      },
    },
  });

  assertAvoidsHostSlashReplaceRegex(script);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "Clip Driven Sequence");
  assert.equal(calls[0]?.items.length, 1);
  assert.equal(calls[0]?.items[0], projectItem);
  assert.equal(calls[0]?.destinationBin, rootItem);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Clip Driven Sequence",
    requestedPresetPath: "",
    presetPath: "",
    mode: "createNewSequenceFromClips",
    id: "create-id",
  });
});

test("buildActionScript create_sequence prefers createNewSequenceFromClips before preset-based APIs when mediaPath is provided", async () => {
  const panel = await loadPanelHelpers();
  const mediaPath = "C:/pr-mcp-cmd/sample1.jpg";
  const requestedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const resolvedPresetPath =
    "E:\\PR20222\\Adobe Premiere Pro 2022\\Settings\\SequencePresets\\Digital SLR\\1080p\\DSLR 1080p25.sqpreset";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Clip Driven Sequence",
      mediaPath,
      presetPath: requestedPresetPath,
    },
  });

  const projectItem = {
    type: 1,
    getMediaPath() {
      return "C:\\pr-mcp-cmd\\sample1.jpg";
    },
  };
  const rootItem = {
    children: {
      numItems: 1,
      0: projectItem,
    },
  };
  const publicCalls: string[] = [];
  const qeCalls: string[] = [];
  const clipCalls: Array<{ name: string; items: unknown[]; destinationBin: unknown }> = [];

  const result = vm.runInNewContext(script, {
    JSON,
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === requestedPresetPath;
      this.fsName = resolvedPresetPath;
    },
    ProjectItemType: { CLIP: 1, BIN: 2 },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      enableQE() {
        qeCalls.push("enableQE");
      },
      project: {
        rootItem,
        activeSequence: null,
        newSequence() {
          publicCalls.push("newSequence");
          throw new Error("should_not_run");
        },
        createNewSequence(name: string) {
          publicCalls.push("createNewSequence:" + name);
          throw new Error("should_not_run");
        },
        createNewSequenceFromClips(name: string, items: unknown[], destinationBin: unknown) {
          clipCalls.push({ name, items, destinationBin });
          this.activeSequence = { name };
          return this.activeSequence;
        },
      },
    },
    qe: {
      project: {
        newSequence() {
          qeCalls.push("qe.project.newSequence");
          throw new Error("should_not_run");
        },
      },
    },
  });

  assert.deepEqual(qeCalls, []);
  assert.deepEqual(publicCalls, []);
  assert.equal(clipCalls.length, 1);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Clip Driven Sequence",
    requestedPresetPath: requestedPresetPath,
    presetPath: "",
    mode: "createNewSequenceFromClips",
    id: "create-id",
  });
});

test("executeCmd create_sequence support probe avoids slash-replacement regexes in the support script", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const capturedScripts: string[] = [];

  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (!callback) {
          vm.runInNewContext(script, fileContext);
          return;
        }

        capturedScripts.push(script);
        callback("EvalScript error.");
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.executeCmd({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Clip Driven Sequence",
      mediaPath: "C:/pr-mcp-cmd/sample1.jpg",
    },
  });

  assert.ok(capturedScripts.length >= 1);
  assertAvoidsHostSlashReplaceRegex(capturedScripts[0] ?? "");
});

test("buildActionScript create_sequence falls back to newSequence and normalizes the preset path", async () => {
  const panel = await loadPanelHelpers();
  const requestedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const resolvedPresetPath =
    "E:\\PR20222\\Adobe Premiere Pro 2022\\Settings\\SequencePresets\\Digital SLR\\1080p\\DSLR 1080p25.sqpreset";
  const normalizedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Preset Sequence",
      presetPath: requestedPresetPath,
    },
  });
  const calls: Array<{ name: string; presetPath: string }> = [];

  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === requestedPresetPath;
      this.fsName = resolvedPresetPath;
    },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project: {
        activeSequence: null,
        createNewSequence: undefined,
        newSequence(name: string, presetPath: string) {
          calls.push({ name, presetPath });
          this.activeSequence = { name };
        },
      },
    },
  });

  assert.deepEqual(calls, [{ name: "Preset Sequence", presetPath: normalizedPresetPath }]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Preset Sequence",
    requestedPresetPath,
    presetPath: normalizedPresetPath,
    mode: "newSequence",
    id: "create-id",
  });
});

test("buildActionScript create_sequence returns a preset error when no preset is available", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Missing Preset Sequence",
    },
  });

  const result = vm.runInNewContext(script, {
    JSON,
    File: function File(this: { exists: boolean }, _path: string) {
      this.exists = false;
    },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project: {
        createNewSequence: undefined,
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "sequence_preset_not_found",
    creationErrors: [
      {
        mode: "qe.project.newSequence",
        details: "sequence_preset_not_found",
      },
    ],
    id: "create-id",
  });
});

test("buildActionScript create_sequence falls back to qe.project.newSequence when public APIs throw", async () => {
  const panel = await loadPanelHelpers();
  const requestedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const resolvedPresetPath =
    "E:\\PR20222\\Adobe Premiere Pro 2022\\Settings\\SequencePresets\\Digital SLR\\1080p\\DSLR 1080p25.sqpreset";
  const normalizedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "QE Sequence",
      presetPath: requestedPresetPath,
    },
  });

  let qeWasEnabled = false;
  const qeCalls: Array<{ name: string; presetPath: string }> = [];
  const project = {
    activeSequence: null as null | { name: string },
    createNewSequence() {
      throw new Error("create_failed");
    },
    newSequence() {
      throw new Error("new_sequence_failed");
    },
  };

  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === requestedPresetPath;
      this.fsName = resolvedPresetPath;
    },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project,
      enableQE() {
        qeWasEnabled = true;
      },
    },
    qe: {
      project: {
        newSequence(name: string, presetPath: string) {
          qeCalls.push({ name, presetPath });
          project.activeSequence = { name };
        },
      },
    },
  });

  assert.equal(qeWasEnabled, true);
  assert.deepEqual(qeCalls, [{ name: "QE Sequence", presetPath: normalizedPresetPath }]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "QE Sequence",
    requestedPresetPath,
    presetPath: normalizedPresetPath,
    mode: "qe.project.newSequence",
    id: "create-id",
  });
});

test("buildActionScript create_sequence prefers qe.project.newSequence before public sequence APIs", async () => {
  const panel = await loadPanelHelpers();
  const requestedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const resolvedPresetPath =
    "E:\\PR20222\\Adobe Premiere Pro 2022\\Settings\\SequencePresets\\Digital SLR\\1080p\\DSLR 1080p25.sqpreset";
  const normalizedPresetPath =
    "E:/PR20222/Adobe Premiere Pro 2022/Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset";
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "QE First Sequence",
      presetPath: requestedPresetPath,
    },
  });

  const publicCalls: string[] = [];
  const qeCalls: Array<{ name: string; presetPath: string }> = [];
  const project = {
    activeSequence: null as null | { name: string },
    createNewSequence() {
      publicCalls.push("createNewSequence");
      throw new Error("should_not_run");
    },
    newSequence() {
      publicCalls.push("newSequence");
      throw new Error("should_not_run");
    },
  };

  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === requestedPresetPath;
      this.fsName = resolvedPresetPath;
    },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project,
      enableQE() {},
    },
    qe: {
      project: {
        newSequence(name: string, presetPath: string) {
          qeCalls.push({ name, presetPath });
          project.activeSequence = { name };
        },
      },
    },
  });

  assert.deepEqual(publicCalls, []);
  assert.deepEqual(qeCalls, [{ name: "QE First Sequence", presetPath: normalizedPresetPath }]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "QE First Sequence",
    requestedPresetPath,
    presetPath: normalizedPresetPath,
    mode: "qe.project.newSequence",
    id: "create-id",
  });
});

test("buildActionScript create_sequence opens the created sequence when it is not active yet", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Auto Active Sequence",
    },
  });
  const openedSequenceIds: string[] = [];

  const project = {
    activeSequence: null as null | { name: string; sequenceID: string },
    sequences: {
      numSequences: 0,
      0: undefined as undefined | { name: string; sequenceID: string },
    },
    createNewSequence(name: string, sequenceID: string) {
      this.sequences[0] = { name, sequenceID };
      this.sequences.numSequences = 1;
      return this.sequences[0];
    },
    openSequence(sequenceID: string) {
      openedSequenceIds.push(sequenceID);
      if (this.sequences[0] && sequenceID === this.sequences[0].sequenceID) {
        this.activeSequence = this.sequences[0];
        return true;
      }
      return false;
    },
  };

  const result = vm.runInNewContext(script, {
    JSON,
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project,
    },
  });

  assert.equal(openedSequenceIds.length, 1);
  assert.match(openedSequenceIds[0] ?? "", /^mcp-seq-/);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Auto Active Sequence",
    requestedPresetPath: "",
    presetPath: "",
    mode: "createNewSequence",
    id: "create-id",
  });
});

test("buildActionScript create_sequence retries until the sequence becomes visible", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "create-id",
    action: "create_sequence",
    params: {
      name: "Delayed Sequence",
    },
  });
  const openedSequenceIds: string[] = [];

  const project = {
    activeSequence: null as null | { name: string; sequenceID: string },
    sequences: {
      numSequences: 0,
      0: undefined as undefined | { name: string; sequenceID: string },
    },
    createNewSequence(_name: string, _sequenceID: string) {},
    openSequence(sequenceID: string) {
      openedSequenceIds.push(sequenceID);
      if (this.sequences[0] && sequenceID === this.sequences[0].sequenceID) {
        this.activeSequence = this.sequences[0];
        return true;
      }
      return false;
    },
  };

  let sleepCount = 0;

  const result = vm.runInNewContext(script, {
    JSON,
    $: {
      sleep() {
        sleepCount += 1;
        if (sleepCount === 1) {
          project.sequences[0] = { name: "Delayed Sequence", sequenceID: "seq-delayed" };
          project.sequences.numSequences = 1;
        }
      },
    },
    app: {
      path: "E:/PR20222/Adobe Premiere Pro 2022",
      project,
    },
  });

  assert.deepEqual(openedSequenceIds, ["seq-delayed"]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    sequenceName: "Delayed Sequence",
    requestedPresetPath: "",
    presetPath: "",
    mode: "createNewSequence",
    id: "create-id",
  });
});

test("buildActionScript import_media encodes non-ASCII paths safely in the generated script", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "import-id",
    action: "import_media",
    params: {
      paths: ["E:/作业1/sample1.jpg"],
    },
  });

  assert.equal(script.includes("\\u4f5c\\u4e1a1"), true);
});

test("buildActionScript import_media returns a structured error when importFiles throws", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "import-id",
    action: "import_media",
    params: {
      paths: ["E:/sample1.jpg"],
    },
  });
  const fileContext = createMockFileContext();

  fileContext.files.set("E:/sample1.jpg", "image");

  const result = vm.runInNewContext(script, {
    JSON,
    File: fileContext.File,
    app: {
      project: {
        rootItem: {},
        importFiles() {
          throw new Error("import_failed");
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "import_media_exception",
    details: "Error: import_failed",
    id: "import-id",
  });
});

test("buildActionScript import_media prefers fsName for existing files", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "import-id",
    action: "import_media",
    params: {
      paths: ["E:/sample1.jpg"],
    },
  });
  const importedPaths: string[][] = [];

  const result = vm.runInNewContext(script, {
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === "E:/sample1.jpg";
      this.fsName = "E:\\sample1.jpg";
    },
    app: {
      project: {
        rootItem: {},
        importFiles(paths: string[]) {
          importedPaths.push(paths);
          return true;
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(importedPaths)), [["E:\\sample1.jpg"]]);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    mediaPolicy: "reference-only",
    copyOperations: 0,
    results: [{
      path: "E:/sample1.jpg",
      importedPath: "E:\\sample1.jpg",
      importMode: "reference-only",
      copied: false,
      ok: true,
    }],
    id: "import-id",
  });
});

test("buildActionScript import_media rejects unsupported import modes", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "import-id",
    action: "import_media",
    params: {
      paths: ["E:/sample1.jpg"],
      importMode: "copy",
    },
  });

  const result = vm.runInNewContext(script, {
    JSON,
    app: {
      project: {
        rootItem: {},
        importFiles() {
          throw new Error("should_not_run");
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "unsupported_import_mode",
    importMode: "copy",
    supportedModes: ["reference-only"],
    id: "import-id",
  });
});

test("buildActionScript import_media rejects generated verification artifacts", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "import-id",
    action: "import_media",
    params: {
      paths: ["C:/Users/test/AppData/Local/Temp/premiere-fade-verify-demo/frame-17.jpg"],
    },
  });

  const result = vm.runInNewContext(script, {
    JSON,
    File: function File(this: { exists: boolean; fsName: string }, filePath: string) {
      this.exists = filePath === "C:/Users/test/AppData/Local/Temp/premiere-fade-verify-demo/frame-17.jpg";
      this.fsName = "C:\\Users\\test\\AppData\\Local\\Temp\\premiere-fade-verify-demo\\frame-17.jpg";
    },
    app: {
      project: {
        rootItem: {},
        importFiles() {
          throw new Error("should_not_run");
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: true,
    mediaPolicy: "reference-only",
    copyOperations: 0,
    results: [{
      path: "C:/Users/test/AppData/Local/Temp/premiere-fade-verify-demo/frame-17.jpg",
      importMode: "reference-only",
      copied: false,
      ok: false,
      error: "generated_verification_artifact_not_allowed",
    }],
    id: "import-id",
  });
});

test("buildActionScript add_clip_to_timeline matches imported media paths after normalization", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "clip-id",
    action: "add_clip_to_timeline",
    params: {
      mediaPath: "E:/作业1/sample1.jpg",
      trackIndex: 0,
      startTime: 0,
    },
  });

  assertAvoidsHostSlashReplaceRegex(script);
  const inserted: Array<{ clip: { getMediaPath(): string }; startTime: number }> = [];
  const insertedClip = {
    projectItem: {
      getMediaPath() {
        return "E:\\浣滀笟1\\sample1.jpg";
      },
    },
    start: {
      seconds: 0,
    },
    end: {
      seconds: 5,
    },
  };
  const trackClips = {
    numItems: 0,
  } as {
    numItems: number;
    [key: number]: {
      projectItem: { getMediaPath(): string };
      start: { seconds: number };
      end: { seconds: number };
    };
  };

  const result = vm.runInNewContext(script, {
    JSON,
    ProjectItemType: { CLIP: 1, BIN: 2 },
    app: {
      project: {
        activeSequence: {
          videoTracks: {
            0: {
              clips: trackClips,
              overwriteClip(clip: { getMediaPath(): string }, startTime: number) {
                inserted.push({ clip, startTime });
                trackClips[0] = insertedClip;
                trackClips.numItems = 1;
              },
            },
          },
        },
        rootItem: {
          children: {
            numItems: 1,
            0: {
              type: 1,
              getMediaPath() {
                return "E:\\作业1\\sample1.jpg";
              },
            },
          },
        },
      },
    },
  });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.startTime, 0);
  assert.deepEqual(JSON.parse(result), {
    ok: true,
    message: "clip_added",
    trackIndex: 0,
    startTime: 0,
    id: "clip-id",
  });
});

test("buildActionScript add_clip_to_timeline returns a structured error when overwriteClip does not create a visible clip", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "clip-id",
    action: "add_clip_to_timeline",
    params: {
      mediaPath: "E:/sample1.jpg",
      trackIndex: 0,
      startTime: 12.5,
    },
  });

  const result = vm.runInNewContext(script, {
    JSON,
    ProjectItemType: { CLIP: 1, BIN: 2 },
    app: {
      project: {
        activeSequence: {
          videoTracks: {
            0: {
              clips: {
                numItems: 0,
              },
              overwriteClip() {},
            },
          },
        },
        rootItem: {
          children: {
            numItems: 1,
            0: {
              type: 1,
              getMediaPath() {
                return "E:/sample1.jpg";
              },
            },
          },
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "clip_not_added",
    mediaPath: "E:/sample1.jpg",
    trackIndex: 0,
    startTime: 12.5,
    id: "clip-id",
  });
});

test("buildActionScript add_clip_to_timeline returns a structured error when overwriteClip throws", async () => {
  const panel = await loadPanelHelpers();
  const script = panel.buildActionScript({
    id: "clip-id",
    action: "add_clip_to_timeline",
    params: {
      mediaPath: "E:/sample1.jpg",
      trackIndex: 0,
      startTime: 0,
    },
  });

  const result = vm.runInNewContext(script, {
    JSON,
    ProjectItemType: { CLIP: 1, BIN: 2 },
    app: {
      project: {
        activeSequence: {
          videoTracks: {
            0: {
              clips: {
                numItems: 0,
              },
              overwriteClip() {
                throw new Error("insert_failed");
              },
            },
          },
        },
        rootItem: {
          children: {
            numItems: 1,
            0: {
              type: 1,
              getMediaPath() {
                return "E:/sample1.jpg";
              },
            },
          },
        },
      },
    },
  });

  assert.deepEqual(JSON.parse(result), {
    ok: false,
    error: "add_clip_to_timeline_exception",
    details: "Error: insert_failed",
    id: "clip-id",
  });
});

test("executeCmd create_sequence falls back to the single-script path when support probing returns non-JSON", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  let callbackCount = 0;
  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (callback) {
          callbackCount += 1;

          if (callbackCount === 1) {
            callback("EvalScript error.");
            return;
          }

          callback(
            JSON.stringify({
              ok: true,
              sequenceName: "Sequence A",
              requestedPresetPath: "C:/preset.sqpreset",
              presetPath: "C:/preset.sqpreset",
              mode: "direct-script-fallback",
              id: "demo-id",
            }),
          );
          return;
        }

        vm.runInNewContext(script, fileContext);
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.executeCmd({
    id: "demo-id",
    action: "create_sequence",
    params: { name: "Sequence A" },
  });

  const written = fileContext.files.get("C:/pr-mcp-cmd/result.json");
  assert.ok(written);

  assert.deepEqual(JSON.parse(written), {
    ok: true,
    sequenceName: "Sequence A",
    requestedPresetPath: "C:/preset.sqpreset",
    presetPath: "C:/preset.sqpreset",
    mode: "direct-script-fallback",
    id: "demo-id",
  });
});

test("executeCmd create_sequence retries isolated eval attempts after a host-level eval failure", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const seenLabels: string[] = [];
  let confirmCount = 0;

  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (!callback) {
          vm.runInNewContext(script, fileContext);
          return;
        }

        if (script.includes("resolve_create_sequence_support_exception")) {
          seenLabels.push("support");
          callback(
            JSON.stringify({
              ok: true,
              presetPath: "C:/preset.sqpreset",
              hasEnableQE: true,
              hasQeProjectNewSequence: true,
              hasProjectNewSequence: true,
              hasProjectCreateNewSequence: false,
              id: "demo-id",
            }),
          );
          return;
        }

        if (
          script.includes("qe.project.newSequence(name,presetPath)") &&
          script.includes("qe_sequence_exception")
        ) {
          seenLabels.push("qe-attempt");
          callback("EvalScript error.");
          return;
        }

        if (script.includes("created_sequence_not_found")) {
          confirmCount += 1;
          seenLabels.push(`confirm-${confirmCount}`);

          if (confirmCount === 1) {
            callback(
              JSON.stringify({
                ok: false,
                error: "created_sequence_not_found",
                sequenceName: "Sequence A",
                requestedPresetPath: "C:/preset.sqpreset",
                presetPath: "C:/preset.sqpreset",
                mode: "qe.project.newSequence",
                id: "demo-id",
              }),
            );
            return;
          }

          callback(
            JSON.stringify({
              ok: true,
              sequenceName: "Sequence A",
              requestedPresetPath: "C:/preset.sqpreset",
              presetPath: "C:/preset.sqpreset",
              mode: "newSequence",
              id: "demo-id",
            }),
          );
          return;
        }

        if (
          script.includes("app.project.newSequence(name,presetPath)") &&
          script.includes("new_sequence_exception")
        ) {
          seenLabels.push("newSequence-attempt");
          callback(
            JSON.stringify({
              ok: true,
              mode: "newSequence",
              id: "demo-id",
            }),
          );
          return;
        }

        callback("unexpected");
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.executeCmd({
    id: "demo-id",
    action: "create_sequence",
    params: { name: "Sequence A", presetPath: "C:/preset.sqpreset" },
  });

  assert.deepEqual(seenLabels, [
    "support",
    "qe-attempt",
    "confirm-1",
    "newSequence-attempt",
    "confirm-2",
  ]);
  assert.deepEqual(
    JSON.parse(fileContext.files.get("C:/pr-mcp-cmd/result.json") ?? "{}"),
    {
      ok: true,
      sequenceName: "Sequence A",
      requestedPresetPath: "C:/preset.sqpreset",
      presetPath: "C:/preset.sqpreset",
      mode: "newSequence",
      id: "demo-id",
    },
  );
});

test("executeCmd create_sequence prefers createNewSequenceFromClips first when mediaPath is provided", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const seenLabels: string[] = [];

  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (!callback) {
          vm.runInNewContext(script, fileContext);
          return;
        }

        if (script.includes("resolve_create_sequence_support_exception")) {
          seenLabels.push("support");
          callback(
            JSON.stringify({
              ok: true,
              presetPath: "C:/preset.sqpreset",
              hasEnableQE: true,
              hasQeProjectNewSequence: true,
              hasProjectNewSequence: true,
              hasProjectCreateNewSequence: true,
              hasProjectCreateNewSequenceFromClips: true,
              id: "demo-id",
            }),
          );
          return;
        }

        if (script.includes("created_sequence_not_found")) {
          seenLabels.push("confirm");
          callback(
            JSON.stringify({
              ok: true,
              sequenceName: "Sequence A",
              requestedPresetPath: "",
              presetPath: "",
              mode: "createNewSequenceFromClips",
              id: "demo-id",
            }),
          );
          return;
        }

        if (script.includes("app.project.createNewSequenceFromClips(name,[sourceItem],app.project.rootItem)")) {
          seenLabels.push("clip-attempt");
          callback(
            JSON.stringify({
              ok: true,
              mode: "createNewSequenceFromClips",
              id: "demo-id",
            }),
          );
          return;
        }

        if (script.includes("qe.project.newSequence(name,presetPath)")) {
          seenLabels.push("qe-attempt");
          callback("unexpected-qe");
          return;
        }

        if (script.includes("app.project.newSequence(name,presetPath)")) {
          seenLabels.push("newSequence-attempt");
          callback("unexpected-newSequence");
          return;
        }

        if (script.includes("app.project.createNewSequence(name,generatedSequenceId)")) {
          seenLabels.push("createNewSequence-attempt");
          callback("unexpected-createNewSequence");
          return;
        }

        callback("unexpected");
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.executeCmd({
    id: "demo-id",
    action: "create_sequence",
    params: { name: "Sequence A", mediaPath: "C:/sample1.jpg" },
  });

  assert.deepEqual(seenLabels, ["support", "clip-attempt", "confirm"]);
  assert.deepEqual(
    JSON.parse(fileContext.files.get("C:/pr-mcp-cmd/result.json") ?? "{}"),
    {
      ok: true,
      sequenceName: "Sequence A",
      requestedPresetPath: "",
      presetPath: "",
      mode: "createNewSequenceFromClips",
      id: "demo-id",
    },
  );
});

test("executeCmd create_sequence falls back to isolated preset attempts when support and direct scripts both hit host eval errors", async () => {
  const panel = await loadPanelHelpers();
  const fileContext = createMockFileContext();
  const seenLabels: string[] = [];

  const runtime = panel.createPanelRuntime({
    cs: {
      evalScript(script, callback) {
        if (!callback) {
          vm.runInNewContext(script, fileContext);
          return;
        }

        if (script.includes("resolve_create_sequence_support_exception")) {
          seenLabels.push("support");
          callback("EvalScript error.");
          return;
        }

        if (
          script.includes("created_sequence_not_found") &&
          script.includes("generatedSequenceId")
        ) {
          seenLabels.push("direct-fallback");
          callback("EvalScript error.");
          return;
        }

        if (
          script.includes("qe.project.newSequence(name,presetPath)") &&
          script.includes("qe_sequence_exception")
        ) {
          seenLabels.push("qe-attempt");
          callback(
            JSON.stringify({
              ok: true,
              mode: "qe.project.newSequence",
              id: "demo-id",
            }),
          );
          return;
        }

        if (script.includes("created_sequence_not_found")) {
          seenLabels.push("confirm");
          callback(
            JSON.stringify({
              ok: true,
              sequenceName: "Sequence A",
              requestedPresetPath: "C:/preset.sqpreset",
              presetPath: "C:/preset.sqpreset",
              mode: "qe.project.newSequence",
              id: "demo-id",
            }),
          );
          return;
        }

        callback("unexpected");
      },
    },
    updateStatus() {},
    setTimer() {},
  });

  runtime.executeCmd({
    id: "demo-id",
    action: "create_sequence",
    params: { name: "Sequence A", presetPath: "C:/preset.sqpreset" },
  });

  assert.deepEqual(seenLabels, [
    "support",
    "direct-fallback",
    "qe-attempt",
    "confirm",
  ]);
  assert.deepEqual(
    JSON.parse(fileContext.files.get("C:/pr-mcp-cmd/result.json") ?? "{}"),
    {
      ok: true,
      sequenceName: "Sequence A",
      requestedPresetPath: "C:/preset.sqpreset",
      presetPath: "C:/preset.sqpreset",
      mode: "qe.project.newSequence",
      id: "demo-id",
    },
  );
});

test("getReadyStatus includes a visible version marker and extension id", async () => {
  const panel = await loadPanelHelpers();

  assert.equal(
    panel.getReadyStatus("com.pr.mcp.panel.main"),
    "ready v" + panel.PANEL_VERSION + " com.pr.mcp.panel.main",
  );
});

test("shouldPollExtension only enables bridge polling for the hidden worker extension", async () => {
  const panel = await loadPanelHelpers();

  assert.equal(panel.shouldPollExtension("com.pr.mcp.panel.hidden"), true);
  assert.equal(panel.shouldPollExtension("com.pr.mcp.panel.main"), false);
  assert.equal(panel.shouldPollExtension("some.other.extension"), false);
});

test("getCompanionExtensionToOpen asks the main panel to wake the hidden worker", async () => {
  const panel = await loadPanelHelpers();

  assert.equal(
    panel.getCompanionExtensionToOpen("com.pr.mcp.panel.main"),
    "com.pr.mcp.panel.hidden",
  );
  assert.equal(panel.getCompanionExtensionToOpen("com.pr.mcp.panel.hidden"), "");
  assert.equal(panel.getCompanionExtensionToOpen("some.other.extension"), "");
});

test("createVisiblePanelController chooses a project path and opens it through Premiere", async () => {
  const panel = await loadPanelHelpers();
  const scripts: string[] = [];
  const bridgeControl: boolean[] = [];
  const logs: Array<{ message: string; level?: string }> = [];
  let chosenProjectPath = "";

  const controller = panel.createVisiblePanelController({
    cs: {
      evalScript(script, callback) {
        scripts.push(script);

        if (!callback) {
          return;
        }

        if (script.includes("openDialog")) {
          callback(JSON.stringify({
            ok: true,
            path: "C:/picked/demo.prproj",
          }));
          return;
        }

        callback(JSON.stringify({
          ok: true,
          projectName: "demo.prproj",
          projectPath: "C:/picked/demo.prproj",
          id: "open-project-id",
        }));
      },
    },
    ui: {
      log(message: string, level?: string) {
        logs.push({ message, level });
      },
      setBridgeStatus() {},
      setPremiereStatus() {},
      setProjectPath(value: string) {
        chosenProjectPath = value;
      },
    },
    writeBridgeControl(enabled: boolean) {
      bridgeControl.push(enabled);
    },
  });

  controller.chooseProject();
  controller.openProject();
  controller.startBridge();
  controller.stopBridge();

  assert.equal(chosenProjectPath, "C:/picked/demo.prproj");
  assert.equal(scripts[0]?.includes("BridgeTalk.bringToFront"), true);
  assert.equal(scripts[1]?.includes("openDialog"), true);
  assert.equal(scripts[2]?.includes("C:/picked/demo.prproj"), true);
  assert.deepEqual(bridgeControl, [true, false]);
  assert.equal(
    logs.some((entry) => entry.message.includes("demo.prproj")),
    true,
  );
});

test("createVisiblePanelController prefers the hidden file input and focuses it when available", async () => {
  let htmlPickerClicks = 0;
  let htmlInputFocuses = 0;
  const openedExtensions: Array<{ extensionId: string; params: string }> = [];
  let windowFocuses = 0;
  const evalScripts: string[] = [];
  let inputValue = "stale";

  const panel = await loadPanelHelpers({
    focus() {
      windowFocuses += 1;
    },
    document: {
      getElementById(id: string) {
        if (id === "projectFileInput") {
          return {
            get value() {
              return inputValue;
            },
            set value(next: string) {
              inputValue = next;
            },
            focus() {
              htmlInputFocuses += 1;
            },
            click() {
              htmlPickerClicks += 1;
            },
          };
        }
        return null;
      },
    },
  });

  const controller = panel.createVisiblePanelController({
    cs: {
      evalScript(script, callback) {
        evalScripts.push(script);
        if (callback) {
          callback(JSON.stringify({ ok: true }));
        }
      },
      requestOpenExtension(extensionId, params) {
        openedExtensions.push({ extensionId, params });
      },
    },
    extensionId: "com.test.panel",
    ui: {
      log() {},
      setBridgeStatus() {},
      setPremiereStatus() {},
    },
    writeBridgeControl() {},
  });

  controller.chooseProject();

  assert.equal(evalScripts.length, 1);
  assert.equal(evalScripts[0]?.includes("BridgeTalk.bringToFront"), true);
  assert.deepEqual(openedExtensions, [{ extensionId: "com.test.panel", params: "" }]);
  assert.equal(windowFocuses, 1);
  assert.equal(htmlInputFocuses, 1);
  assert.equal(htmlPickerClicks, 1);
  assert.equal(inputValue, "");
});

test("createVisiblePanelController falls back to ExtendScript picker when the hidden file input is unavailable", async () => {
  let chosenProjectPath = "";
  const logs: Array<{ message: string; level?: string }> = [];
  const evalScripts: string[] = [];

  const panel = await loadPanelHelpers({
    document: {
      getElementById(_id: string) {
        return null;
      },
    },
  });

  const controller = panel.createVisiblePanelController({
    cs: {
      evalScript(script, callback) {
        evalScripts.push(script);
        if (callback) {
          if (script.includes("BridgeTalk.bringToFront")) {
            callback(JSON.stringify({ ok: true }));
            return;
          }
          callback(JSON.stringify({
            ok: true,
            path: "C:/picked/from-extendscript.prproj",
          }));
        }
      },
    },
    ui: {
      log(message: string, level?: string) {
        logs.push({ message, level });
      },
      setBridgeStatus() {},
      setPremiereStatus() {},
      setProjectPath(value: string) {
        chosenProjectPath = value;
      },
    },
    writeBridgeControl() {},
  });

  controller.chooseProject();

  assert.equal(evalScripts.length, 2);
  assert.equal(evalScripts[0]?.includes("BridgeTalk.bringToFront"), true);
  assert.equal(evalScripts[1]?.includes("openDialog"), true);
  assert.equal(chosenProjectPath, "C:/picked/from-extendscript.prproj");
  assert.equal(
    logs.some((entry) => entry.message === "html_picker_unavailable_fallback_extendscript"),
    true,
  );
});

test("createVisiblePanelController mirrors hidden worker bridge logs into the visible ui log", async () => {
  const panel = await loadPanelHelpers();
  const logs: Array<{ message: string; level?: string }> = [];
  const scheduled: Array<() => void> = [];
  let logText = [
    "2026-03-13T02:30:00.000Z cmd_raw {\"id\":\"demo\",\"script\":\"huge-script\"}",
    "2026-03-13T02:30:00.100Z dispatch raw_script",
    "2026-03-13T02:30:00.200Z write_result {\"success\":true,\"message\":\"Effect applied\",\"effectName\":\"FI: Blur FX\"}",
  ].join("\n");

  const controller = panel.createVisiblePanelController({
    cs: {
      evalScript() {},
    },
    extensionId: "com.pr.mcp.panel.main",
    fs: {
      existsSync(targetPath: string) {
        return targetPath === "C:/pr-mcp-cmd/panel.log";
      },
      readFileSync(targetPath: string, encoding: string) {
        assert.equal(targetPath, "C:/pr-mcp-cmd/panel.log");
        assert.equal(encoding, "utf8");
        return logText;
      },
    },
    ui: {
      log(message: string, level?: string) {
        logs.push({ message, level });
      },
      setBridgeStatus() {},
      setPremiereStatus() {},
    },
    writeBridgeControl() {},
    setTimer(fn: () => void) {
      scheduled.push(fn);
      return scheduled.length;
    },
    clearTimer() {},
  });

  assert.ok(controller);
  assert.equal(logs.some((entry) => entry.message.includes("huge-script")), false);
  assert.equal(logs.some((entry) => entry.message.includes("dispatch raw_script")), true);
  assert.equal(logs.some((entry) => entry.message.includes("Effect applied")), true);

  logText += "\n2026-03-13T02:30:01.000Z raw_script {\"success\":false,\"error\":\"boom\"}";
  scheduled[0]?.();

  assert.equal(
    logs.some((entry) => entry.level === "error" && entry.message.includes("boom")),
    true,
  );
});
