import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const PLUGIN_REGISTRY_SOURCE_PATH = path.join(
  process.cwd(),
  "cep-panel",
  "js",
  "plugin-registry.js",
);

type PluginRegistryUi = {
  refresh(): void;
  setEnabled(id: string, enabled: boolean, callback?: (ok: boolean) => void): void;
};

async function loadPluginRegistryUi(initialGlobals: Record<string, unknown> = {}) {
  const source = await readFile(PLUGIN_REGISTRY_SOURCE_PATH, "utf8");
  const context = {
    console,
    globalThis: {} as Record<string, unknown>,
    ...initialGlobals,
  };

  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: PLUGIN_REGISTRY_SOURCE_PATH });

  return {
    pluginRegistryUI: (context as { pluginRegistryUI: PluginRegistryUi }).pluginRegistryUI,
    context,
  };
}

test("plugin registry UI renders enable and disable actions for each plugin", async () => {
  const elements = {
    pluginList: { innerHTML: "" },
    pluginCount: { textContent: "" },
  };

  const { pluginRegistryUI } = await loadPluginRegistryUi({
    document: {
      getElementById(id: string) {
        return elements[id as keyof typeof elements] ?? null;
      },
    },
    CSInterface: function CSInterface(this: { evalScript: (script: string, callback?: (value: string) => void) => void }) {
      this.evalScript = function evalScript(_script: string, callback?: (value: string) => void) {
        callback?.(JSON.stringify({
          plugins: [
            { id: "enabled-plugin", name: "Enabled Plugin", version: "1.0.0", enabled: true },
            { id: "disabled-plugin", name: "Disabled Plugin", version: "1.0.0", enabled: false },
          ],
        }));
      };
    },
  });

  pluginRegistryUI.refresh();

  assert.equal(elements.pluginCount.textContent, "2 个插件");
  assert.match(elements.pluginList.innerHTML, /停用/);
  assert.match(elements.pluginList.innerHTML, /启用/);
  assert.match(elements.pluginList.innerHTML, /pluginRegistryUI\.setEnabled\('enabled-plugin',false\)/);
  assert.match(elements.pluginList.innerHTML, /pluginRegistryUI\.setEnabled\('disabled-plugin',true\)/);
});

test("plugin registry UI rewrites plugins.json when setEnabled is called", async () => {
  const elements = {
    pluginList: { innerHTML: "" },
    pluginCount: { textContent: "" },
  };
  let storedPluginsJson = JSON.stringify({
    plugins: [
      { id: "demo-plugin", name: "Demo Plugin", version: "1.0.0", enabled: true },
    ],
  });
  const seenScripts: string[] = [];

  const { pluginRegistryUI } = await loadPluginRegistryUi({
    document: {
      getElementById(id: string) {
        return elements[id as keyof typeof elements] ?? null;
      },
    },
    CSInterface: function CSInterface(this: { evalScript: (script: string, callback?: (value: string) => void) => void }) {
      this.evalScript = function evalScript(script: string, callback?: (value: string) => void) {
        seenScripts.push(script);

        if (script.includes("f.open('r')")) {
          callback?.(storedPluginsJson);
          return;
        }

        if (script.includes("f.open('w')")) {
          assert.match(script, /\\"enabled\\":false/);
          storedPluginsJson = JSON.stringify({
            plugins: [
              { id: "demo-plugin", name: "Demo Plugin", version: "1.0.0", enabled: false },
            ],
          });
          callback?.("ok");
          return;
        }

        callback?.("unexpected");
      };
    },
  });

  await new Promise<void>((resolve) => {
    pluginRegistryUI.setEnabled("demo-plugin", false, function () {
      resolve();
    });
  });

  assert.equal(JSON.parse(storedPluginsJson).plugins[0].enabled, false);
  assert.equal(seenScripts.some((script) => script.includes("f.open('w')")), true);
});
