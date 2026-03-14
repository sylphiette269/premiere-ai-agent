import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio server exposes the migrated Premiere MCP surface", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "./src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({
    name: "premiere-mcp-test-client",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const [toolResponse, resourceResponse, promptResponse] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listPrompts(),
    ]);

    const toolNames = toolResponse.tools.map((tool) => tool.name);
    const resourceUris = resourceResponse.resources.map((resource) => resource.uri);
    const promptNames = promptResponse.prompts.map((prompt) => prompt.name);

    assert.equal(toolNames.length > 50, true);
    assert.equal(resourceUris.length, 13);
    assert.equal(promptNames.length, 11);
    assert.equal(toolNames.includes("list_project_items"), true);
    assert.equal(toolNames.includes("build_motion_graphics_demo"), true);
    assert.equal(toolNames.includes("plan_edit_assembly"), true);
    assert.equal(toolNames.includes("assemble_product_spot"), true);
    assert.equal(toolNames.includes("review_edit_reasonability"), true);
    assert.equal(toolNames.includes("plugin_list"), true);
    assert.equal(toolNames.includes("plugin_register"), true);
    assert.equal(toolNames.includes("plugin_set_enabled"), true);
    assert.equal(toolNames.includes("plugin_call"), true);
    assert.equal(resourceUris.includes("premiere://project/info"), true);
    assert.equal(resourceUris.includes("premiere://timeline/tracks"), true);
    assert.equal(promptNames.includes("create_video_project"), true);
    assert.equal(promptNames.includes("audio_cleanup"), true);
  } finally {
    await client.close();
  }
});
