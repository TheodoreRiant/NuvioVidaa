// VIDAA browsers are driven by an on-screen cursor: the focus engine must
// route pointer moves and clicks to the current screen, as it does for the LG
// Magic Remote. Regression: clicking a source in the stream picker did nothing
// on VIDAA because pointer handling was gated on webOS only.
import assert from "node:assert/strict";

const listeners = new Map();
const rootClasses = new Set();
globalThis.HTMLElement = class HTMLElement {};
globalThis.document = {
  activeElement: null,
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  contains: () => true,
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: {
    classList: { add: (name) => rootClasses.add(name), contains: (name) => rootClasses.has(name) }
  },
  body: { classList: { add: () => {}, contains: () => false } }
};
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Mozilla/5.0 (X11; Linux armv7l) Chrome/111.0.0.0 PageReader/6.1.20" },
  configurable: true
});
globalThis.location = { search: "" };
globalThis.__NUVIO_PLATFORM__ = "vidaa";

const { Platform } = await import("../js/platform/index.js");
const { Router } = await import("../js/ui/navigation/routerState.js");
const { FocusEngine } = await import("../js/ui/navigation/focusEngine.js");

// 1. Pointer remote platforms: LG webOS (Magic Remote) and VIDAA (cursor).
Platform.current = null;
assert.equal(Platform.hasPointerRemote(), true, "VIDAA uses a pointer remote");
for (const [name, expected] of [
  ["webos", true],
  ["tizen", false],
  ["browser", false]
]) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  assert.equal(Platform.hasPointerRemote(), expected, `${name} pointer remote`);
}
globalThis.__NUVIO_PLATFORM__ = "vidaa";
Platform.current = null;

// 2. On VIDAA the focus engine listens for cursor moves and clicks.
FocusEngine.init();
for (const type of ["keydown", "keyup", "mousemove", "pointermove", "click"]) {
  assert.ok(listeners.has(type), `listens for ${type}`);
}
assert.ok(rootClasses.has("webos-pointer-remote"), "pointer cursor styling enabled");

// 3. A click on a focusable item (e.g. a source row) focuses it and reaches
//    the current screen's onPointerActivate handler.
{
  const classes = new Set(["focusable"]);
  const row = Object.assign(new HTMLElement(), {
    disabled: false,
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 400, height: 60 }),
    closest: (selector) => (selector === ".focusable" ? row : null),
    focus() {
      document.activeElement = row;
    }
  });
  const activated = [];
  const originalGetCurrentScreen = Router.getCurrentScreen;
  Router.getCurrentScreen = () => ({
    onPointerActivate(target) {
      activated.push(target);
      return true;
    }
  });
  let prevented = false;
  try {
    listeners.get("click")({
      target: row,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {},
      stopImmediatePropagation() {}
    });
  } finally {
    Router.getCurrentScreen = originalGetCurrentScreen;
  }
  assert.deepEqual(activated, [row], "click reaches the screen");
  assert.ok(classes.has("focused"), "clicked row gets focus");
  assert.equal(prevented, true, "handled click does not fall through");
}

console.log("VIDAA pointer remote passed (cursor moves and clicks reach the screen).");
