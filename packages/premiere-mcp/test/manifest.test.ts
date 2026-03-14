import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MANIFEST_PATH = path.join(
  process.cwd(),
  "cep-panel",
  "CSXS",
  "manifest.xml",
);

test("panel manifest declares explicit width and height for the main panel", async () => {
  const manifest = await readFile(MANIFEST_PATH, "utf8");
  const mainPanelMatch = manifest.match(
    /<Extension Id="com\.pr\.mcp\.panel\.main">[\s\S]*?<\/Extension>/,
  );

  assert.ok(mainPanelMatch, "main panel manifest block should exist");

  const mainPanel = mainPanelMatch[0];
  assert.match(mainPanel, /<Type>Panel<\/Type>/);
  assert.match(mainPanel, /<Size>\s*<Width>\d+<\/Width>\s*<Height>\d+<\/Height>\s*<\/Size>/);
});
