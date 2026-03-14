import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PluginRegistry } from "../src/plugin-manager.js";

test("PluginRegistry registers entries inside allowed plugin directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-plugin-registry-"));
  const previousAllowedDirs = process.env.PREMIERE_PLUGIN_ALLOWED_DIRS;
  const allowedDir = path.join(root, "plugins");

  process.env.PREMIERE_PLUGIN_ALLOWED_DIRS = allowedDir;

  try {
    const registry = new PluginRegistry(root);
    const manifest = await registry.register({
      id: "demo-plugin",
      name: "Demo Plugin",
      entry: path.join(allowedDir, "demo.jsx"),
      methods: ["run"],
    });

    assert.equal(manifest.entry, path.resolve(allowedDir, "demo.jsx"));
  } finally {
    if (previousAllowedDirs === undefined) {
      delete process.env.PREMIERE_PLUGIN_ALLOWED_DIRS;
    } else {
      process.env.PREMIERE_PLUGIN_ALLOWED_DIRS = previousAllowedDirs;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("PluginRegistry rejects entries outside allowed plugin directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-plugin-registry-"));
  const previousAllowedDirs = process.env.PREMIERE_PLUGIN_ALLOWED_DIRS;
  const allowedDir = path.join(root, "plugins");

  process.env.PREMIERE_PLUGIN_ALLOWED_DIRS = allowedDir;

  try {
    const registry = new PluginRegistry(root);

    await assert.rejects(
      registry.register({
        id: "demo-plugin",
        name: "Demo Plugin",
        entry: path.join(root, "outside", "demo.jsx"),
        methods: ["run"],
      }),
      /allowed directories/i,
    );
  } finally {
    if (previousAllowedDirs === undefined) {
      delete process.env.PREMIERE_PLUGIN_ALLOWED_DIRS;
    } else {
      process.env.PREMIERE_PLUGIN_ALLOWED_DIRS = previousAllowedDirs;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("PluginRegistry.load reports malformed registry JSON with a clear error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "premiere-plugin-registry-"));
  const registryPath = path.join(root, "plugins.json");

  try {
    await writeFile(registryPath, "{not-json", "utf8");
    const registry = new PluginRegistry(root);

    await assert.rejects(
      registry.load(),
      /plugin registry/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
