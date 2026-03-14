import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("index.html uses a cache-busting query string for panel.js", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(html, /<script src="js\/panel\.js\?v=[^"]+"/);
});

test("index.html references a CSInterface runtime script that exists on disk", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(html, /<script src="js\/CSInterface\.js"><\/script>/);
  assert.equal(
    existsSync(path.join(process.cwd(), "cep-panel", "js", "CSInterface.js")),
    true,
  );
});

test("index.html loads bridge-config.js and bridge-ui.js before panel.js", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(
    html,
    /<script src="js\/bridge-config\.js"><\/script>\s*<script src="js\/bridge-ui\.js"><\/script>\s*<script src="js\/plugin-registry\.js"><\/script>\s*<script src="js\/panel-core\.js"><\/script>\s*<script src="js\/panel-scripts\.js"><\/script>\s*<script src="js\/panel-runtime\.js"><\/script>\s*<script src="js\/panel\.js\?v=/,
  );
  assert.equal(
    existsSync(path.join(process.cwd(), "cep-panel", "js", "bridge-config.js")),
    true,
  );
});

test("index.html loads panel helper scripts before panel.js", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(
    html,
    /<script src="js\/panel-core\.js"><\/script>\s*<script src="js\/panel-scripts\.js"><\/script>\s*<script src="js\/panel-runtime\.js"><\/script>\s*<script src="js\/panel\.js\?v=/,
  );
  assert.equal(
    existsSync(path.join(process.cwd(), "cep-panel", "js", "panel-core.js")),
    true,
  );
  assert.equal(
    existsSync(path.join(process.cwd(), "cep-panel", "js", "panel-scripts.js")),
    true,
  );
  assert.equal(
    existsSync(path.join(process.cwd(), "cep-panel", "js", "panel-runtime.js")),
    true,
  );
});

test("index.html exposes project path controls for manual file selection", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(html, /id="projectPathInput"/);
  assert.match(html, /onclick="panelUiChooseProject\(\)"/);
  assert.match(html, /onclick="panelUiOpenProject\(\)"/);
});

test("index.html exposes the editorial redesign shell while preserving runtime anchors", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(html, /class="shell shell-editorial"/);
  assert.match(html, /class="masthead"/);
  assert.match(html, /class="editorial-title"/);
  assert.match(html, /class="console-shell"/);
  assert.match(html, /id="status"/);
});
