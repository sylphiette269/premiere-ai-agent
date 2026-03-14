import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAddToTimelineScript,
  buildCreateProjectScript,
  buildCreateSequenceScript,
} from "../src/bridge/script-builders.js";

function quote(value: string): string {
  return JSON.stringify(value);
}

test("buildCreateProjectScript escapes project names and locations through the provided quoter", () => {
  const script = buildCreateProjectScript('Demo "Project"\nOne', 'C:\\Projects\\Demo "Root"', quote);

  assert.match(
    script,
    /app\.newProject\("Demo \\"Project\\"\\nOne", "C:\\\\Projects\\\\Demo \\"Root\\""\);/,
  );
});

test("buildCreateSequenceScript emits explicit settings writes when custom dimensions or rates are present", () => {
  const script = buildCreateSequenceScript(
    "Custom Sequence",
    "",
    {
      width: 1920,
      height: 1080,
      frameRate: 25,
      sampleRate: 48000,
    },
    quote,
  );

  assert.match(script, /sequence\.getSettings\(\)/);
  assert.match(script, /settings\.videoFrameWidth = 1920/);
  assert.match(script, /settings\.videoFrameHeight = 1080/);
  assert.match(script, /settings\.videoFrameRate\.setSecondsAsFraction\(1, 25\)/);
  assert.match(script, /settings\.audioSampleRate\.setSecondsAsFraction\(1, 48000\)/);
  assert.match(script, /duration: bridgeTicksToSeconds\(sequence\.end\) - bridgeTicksToSeconds\(sequence\.zeroPoint\)/);
});

test("buildAddToTimelineScript embeds validated ids and numeric placement data", () => {
  const script = buildAddToTimelineScript('seq-"1"', 'item-"2"', 1, 12.5, quote);

  assert.match(script, /var sequence = bridgeLookupSequence\("seq-\\"1\\""\);/);
  assert.match(script, /var projectItem = bridgeLookupProjectItem\("item-\\"2\\""\);/);
  assert.match(script, /var track = sequence\.videoTracks\[1\];/);
  assert.match(script, /track\.overwriteClip\(projectItem, 12\.5\);/);
});
