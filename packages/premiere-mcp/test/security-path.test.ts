import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateFilePath } from "../src/utils/security.js";

test("validateFilePath rejects traversal segments before normalization", () => {
  const result = validateFilePath("../outside/demo.jsx");

  assert.equal(result.valid, false);
  assert.match(String(result.error), /traversal/i);
});

test("validateFilePath enforces allowed-directory boundaries instead of prefix matches", () => {
  const allowedDir = path.join(os.tmpdir(), "premiere-allowed");
  const siblingDir = allowedDir + "-other";
  const candidatePath = path.join(siblingDir, "demo.jsx");

  const result = validateFilePath(candidatePath, [allowedDir]);

  assert.equal(result.valid, false);
  assert.match(String(result.error), /allowed directories/i);
});
