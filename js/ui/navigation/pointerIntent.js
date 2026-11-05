// Tells real cursor movement apart from the synthetic mousemove/mouseover
// events Chromium dispatches when content changes under a stationary cursor.
// Hover handlers must only move focus after a real move: otherwise a focused
// poster expanding (or the hero rotating) under the cursor moves focus, which
// changes the content again, in a loop that keeps the TV busy.

export const POINTER_HOVER_WINDOW_MS = 150;
const MIN_MOVE_PX = 1;

export function createPointerIntentGate({ now = () => Date.now() } = {}) {
  let lastX = null;
  let lastY = null;
  let lastRealMoveAt = -Infinity;
  return {
    // Records a mousemove/pointermove; returns true when the cursor moved.
    noteMove(event) {
      const x = Number(event?.clientX);
      const y = Number(event?.clientY);
      if (
        event?.clientX == null ||
        event?.clientY == null ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return false;
      }
      const moved =
        lastX === null || Math.abs(x - lastX) >= MIN_MOVE_PX || Math.abs(y - lastY) >= MIN_MOVE_PX;
      lastX = x;
      lastY = y;
      if (moved) {
        lastRealMoveAt = now();
      }
      return moved;
    },
    // True only shortly after a real cursor move.
    isHoverIntentional() {
      return now() - lastRealMoveAt <= POINTER_HOVER_WINDOW_MS;
    }
  };
}

// App-wide gate, fed by FocusEngine from document mousemove events.
export const PointerIntent = createPointerIntentGate();
