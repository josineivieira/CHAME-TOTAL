let pending = 0;
const listeners = new Set<() => void>();
export const processing = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: () => pending,
};
export function beginProcessing() {
  pending++;
  listeners.forEach((listener) => listener());
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending = Math.max(0, pending - 1);
    listeners.forEach((listener) => listener());
  };
}
