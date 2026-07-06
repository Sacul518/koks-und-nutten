export interface ControlCallbacks {
  onTap: (screenX: number, screenY: number) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (factor: number, centerX: number, centerY: number) => void;
  onDirChange: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  onSprintChange: (on: boolean) => void;
  onRecenter: () => void;
}

const TAP_MAX_DISTANCE = 12;
const TAP_MAX_MS = 400;

export function attachControls(target: HTMLElement, cb: ControlCallbacks): void {
  interface TrackedPointer {
    x: number;
    y: number;
  }
  const pointers = new Map<number, TrackedPointer>();
  let tapCandidate: { id: number; startX: number; startY: number; startTime: number } | null = null;
  let pinchDistance = 0;

  target.addEventListener("pointerdown", (e) => {
    target.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      tapCandidate = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startTime: performance.now() };
    } else {
      tapCandidate = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    }
  });

  target.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size === 1) {
      if (tapCandidate && Math.hypot(e.clientX - tapCandidate.startX, e.clientY - tapCandidate.startY) > TAP_MAX_DISTANCE) {
        tapCandidate = null;
      }
      if (!tapCandidate) cb.onPan(dx, dy);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const centerX = (a!.x + b!.x) / 2;
      const centerY = (a!.y + b!.y) / 2;
      if (pinchDistance > 0 && dist > 0) {
        cb.onZoom(dist / pinchDistance, centerX, centerY);
      }
      pinchDistance = dist;
      cb.onPan(dx / 2, dy / 2);
    }
  });

  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinchDistance = 0;
    if (tapCandidate?.id === e.pointerId) {
      if (performance.now() - tapCandidate.startTime <= TAP_MAX_MS) {
        cb.onTap(e.clientX, e.clientY);
      }
      tapCandidate = null;
    }
  };
  target.addEventListener("pointerup", endPointer);
  target.addEventListener("pointercancel", endPointer);

  // Safari-eigene Pinch-Gesten (Seitenzoom) unterbinden
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    target.addEventListener(type, (e) => e.preventDefault());
  }

  target.addEventListener("wheel", (e) => {
    e.preventDefault();
    cb.onZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
  }, { passive: false });

  // Tastatur: WASD / Pfeiltasten, Shift = Sprint, C zum Zentrieren
  const pressed = new Set<string>();
  let lastDx = 0;
  let lastDy = 0;
  let sprinting = false;
  const setSprint = (on: boolean) => {
    if (on !== sprinting) {
      sprinting = on;
      cb.onSprintChange(on);
    }
  };
  const updateDir = () => {
    const dx = (pressed.has("d") || pressed.has("arrowright") ? 1 : 0) - (pressed.has("a") || pressed.has("arrowleft") ? 1 : 0);
    const dy = (pressed.has("s") || pressed.has("arrowdown") ? 1 : 0) - (pressed.has("w") || pressed.has("arrowup") ? 1 : 0);
    if (dx !== lastDx || dy !== lastDy) {
      lastDx = dx;
      lastDy = dy;
      cb.onDirChange(dx as -1 | 0 | 1, dy as -1 | 0 | 1);
    }
  };
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === "shift") {
      setSprint(true);
      return;
    }
    if (key === "c") {
      cb.onRecenter();
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      e.preventDefault();
      pressed.add(key);
      updateDir();
    }
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === "shift") {
      setSprint(false);
      return;
    }
    pressed.delete(key);
    updateDir();
  });
  window.addEventListener("blur", () => {
    pressed.clear();
    setSprint(false);
    updateDir();
  });
}
