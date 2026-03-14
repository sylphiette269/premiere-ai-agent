import assert from "node:assert/strict";
import test from "node:test";

import { PremiereBridge } from "../src/bridge/index.js";

test("PremiereBridge.addToTimeline rejects invalid timeline positions before writing scripts", async () => {
  const bridge = new PremiereBridge();

  await assert.rejects(
    bridge.addToTimeline("seq-1", "item-1", 0, Number.NaN),
    /timeline position/i,
  );
  await assert.rejects(
    bridge.addToTimeline("seq-1", "item-1", 0, Number.POSITIVE_INFINITY),
    /timeline position/i,
  );
  await assert.rejects(
    bridge.addToTimeline("seq-1", "item-1", 0, -1),
    /timeline position/i,
  );
});
