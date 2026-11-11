/**
 * A tiny registry of live machine snapshots for debugging and agent use.
 *
 * In development it exposes `window.__BAKU_MACHINES__.snapshot()`, so an
 * agent (or a human in DevTools) can read the exact workflow state instead of
 * inferring it from DOM classes. In production the registry is inert.
 */

type Snapshot = () => unknown;

const snapshots = new Map<string, Snapshot>();

export function registerMachineSnapshot(id: string, get: Snapshot): () => void {
  snapshots.set(id, get);
  return () => {
    if (snapshots.get(id) === get) {
      snapshots.delete(id);
    }
  };
}

export function getMachineSnapshots(): Record<string, unknown> {
  return Object.fromEntries(
    [...snapshots.entries()].map(([id, get]) => [id, get()])
  );
}

const isDev =
  typeof import.meta.env !== 'undefined' && import.meta.env.DEV;

if (isDev && typeof window !== 'undefined') {
  (window as unknown as { __BAKU_MACHINES__?: unknown }).__BAKU_MACHINES__ = {
    snapshot: getMachineSnapshots,
  };
}
