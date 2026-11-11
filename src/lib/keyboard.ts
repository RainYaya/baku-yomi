/**
 * One keyboard dispatcher with explicit priorities.
 *
 * Before: ThemeProvider listened on `document`, ReadingView on `window`, and
 * ThemeProvider deferred its work with `setTimeout(0)` so ReadingView could
 * call `preventDefault()` first. That made shortcut ownership depend on event
 * propagation order and a zero-delay timer. Here, the higher-priority handler
 * wins directly, and returning `true` (or calling `preventDefault`) claims the
 * key.
 */
export type KeyboardHandler = (event: KeyboardEvent) => boolean | void;

export interface KeyboardEntry {
  id: string;
  priority: number;
  handler: KeyboardHandler;
}

const entries = new Map<string, KeyboardEntry>();
let installed = false;

export function runKeyboardHandlers(
  event: KeyboardEvent,
  handlers: Iterable<KeyboardEntry>
): boolean {
  if (event.defaultPrevented) return true;

  const ordered = [...handlers].sort((a, b) => b.priority - a.priority);

  for (const entry of ordered) {
    const handled = entry.handler(event);
    if (handled || event.defaultPrevented) {
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
      return true;
    }
  }

  return false;
}

function handleKeyDown(event: KeyboardEvent) {
  runKeyboardHandlers(event, entries.values());
}

export function registerKeyboardHandler(
  id: string,
  priority: number,
  handler: KeyboardHandler
): () => void {
  entries.set(id, { id, priority, handler });

  if (!installed && typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown);
    installed = true;
  }

  return () => {
    if (entries.get(id)?.handler === handler) {
      entries.delete(id);
    }
  };
}
