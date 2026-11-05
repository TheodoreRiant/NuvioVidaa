// Pointer hover must follow real cursor movement only. When content changes
// under a stationary cursor (a focused poster expanding, the hero rotating),
// Chromium dispatches synthetic mousemove/mouseover events at the same
// coordinates. Treating those as hover moved focus, which changed the content
// again: a self-sustaining loop measured at ~300-500 ms of main-thread work
// every 3 s on the home screen (VIDAA cursor, LG Magic Remote).
import assert from "node:assert/strict";

const { createPointerIntentGate, POINTER_HOVER_WINDOW_MS } =
  await import("../js/ui/navigation/pointerIntent.js");

let clock = 1000;
const gate = createPointerIntentGate({ now: () => clock });

// 1. No movement seen yet: hover is not trusted.
assert.equal(gate.isHoverIntentional(), false);

// 2. A move to new coordinates is real; hover right after it is trusted.
assert.equal(gate.noteMove({ clientX: 100, clientY: 200 }), true);
clock += 20;
assert.equal(gate.isHoverIntentional(), true);

// 3. A synthetic move at the same coordinates is not a real move.
clock += 2000;
assert.equal(gate.noteMove({ clientX: 100, clientY: 200 }), false);
assert.equal(gate.isHoverIntentional(), false, "stale after the hover window");

// 4. Sub-pixel jitter is ignored; a visible move counts again.
assert.equal(gate.noteMove({ clientX: 100.4, clientY: 200.3 }), false);
assert.equal(gate.noteMove({ clientX: 140, clientY: 200 }), true);
assert.equal(gate.isHoverIntentional(), true);

// 5. The hover window is short: content changing seconds later under a
//    stationary cursor is not hover.
clock += POINTER_HOVER_WINDOW_MS + 1;
assert.equal(gate.isHoverIntentional(), false);
assert.ok(
  POINTER_HOVER_WINDOW_MS >= 50 && POINTER_HOVER_WINDOW_MS <= 250,
  "shorter than a row scroll"
);

// 6. Malformed events never count as moves.
assert.equal(gate.noteMove(null), false);
assert.equal(gate.noteMove({}), false);
assert.equal(gate.noteMove({ clientX: "a", clientY: 1 }), false);

console.log("Pointer intent passed (only real cursor movement counts as hover).");
