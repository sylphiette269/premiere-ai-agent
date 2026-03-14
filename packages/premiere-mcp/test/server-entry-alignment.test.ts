import assert from "node:assert/strict";
import test from "node:test";

import { PremiereBridge } from "../src/bridge/index.js";
import { createPremiereMcpServer } from "../src/server.js";

test("createPremiereMcpServer reuses the shared PremiereBridge runtime", () => {
  const server = createPremiereMcpServer() as { bridge?: unknown; start?: unknown; stop?: unknown };

  assert.equal(server.bridge instanceof PremiereBridge, true);
  assert.equal(typeof server.start, "function");
  assert.equal(typeof server.stop, "function");
});
