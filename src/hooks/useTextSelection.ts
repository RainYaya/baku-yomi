import { useState, useEffect, useCallback, useRef } from 'react';

export interface SelectionInfo {
  pairId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  rect: DOMRect;
}

/**
 * Text length inside a range fragment, ignoring ruby annotations.
 *
 * Bookmark offsets are stored against `pair.japanese` (the plain sentence),
 * so furigana readings must never count towards the offset. The old code
 * measured from the whole card, which included the pair number, the audio
 * control and the Chinese line — that is why a one-word selection landed one
 * or two characters to the right.
 */
function textOf(fragment: DocumentFragment): string {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest('rt, rp')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let text = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    text += node.textContent ?? '';
  }
  return text;
}

function textLengthOf(fragment: DocumentFragment): number {
  return textOf(fragment).length;
}

function offsetWithin(root: HTMLElement, container: Node, offset: number): number | null {
  try {
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(container, offset);
    return textLengthOf(prefix.cloneContents());
  } catch {
    // The selection started outside this sentence.
    return null;
  }
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const justSelectedRef = useRef(false);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tapping the popover collapses the native selection before React's click
  // handler runs. Keep the captured selection alive long enough for the
  // bookmark/explain action to fire.
  const keepSelectionUntilRef = useRef(0);

  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (Date.now() < keepSelectionUntilRef.current) return;
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const startElement =
      container instanceof Element ? container : container.parentElement;

    // Only selections inside the Japanese sentence are meaningful. Selecting
    // the translation or a control should not offer a bookmark.
    const textRoot = startElement?.closest<HTMLElement>('[data-pair-text]');
    if (!textRoot) {
      setSelection(null);
      return;
    }

    const pairCard = textRoot.closest<HTMLElement>('[data-pair-id]');
    const pairId = pairCard?.getAttribute('data-pair-id');
    if (!pairCard || !pairId) {
      setSelection(null);
      return;
    }

    const raw = textOf(range.cloneContents());
    const rootLength = textLengthOf(
      (() => {
        const whole = document.createRange();
        whole.selectNodeContents(textRoot);
        return whole.cloneContents();
      })()
    );

    let startOffset = offsetWithin(textRoot, range.startContainer, range.startOffset);
    let endOffset = offsetWithin(textRoot, range.endContainer, range.endOffset);
    if (startOffset == null || endOffset == null) {
      setSelection(null);
      return;
    }

    // A selection that runs past the sentence is clamped to it.
    startOffset = Math.max(0, Math.min(startOffset, rootLength));
    endOffset = Math.max(startOffset, Math.min(endOffset, rootLength));

    // Trim leading/trailing whitespace while keeping the offsets aligned with
    // the stored sentence. `raw` is the selection as rendered, furigana
    // excluded.
    const selectedText = raw;
    const leading = selectedText.length - selectedText.trimStart().length;
    const trailing = selectedText.length - selectedText.trimEnd().length;
    startOffset += leading;
    endOffset -= trailing;

    if (endOffset <= startOffset) {
      setSelection(null);
      return;
    }

    const text = selectedText.trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    justSelectedRef.current = true;
    setSelection({
      pairId,
      startOffset,
      endOffset,
      text,
      rect,
    });

    // 500ms 后重置标记，避免点击卡片时误关弹层
    if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
    guardTimerRef.current = setTimeout(() => {
      justSelectedRef.current = false;
      guardTimerRef.current = null;
    }, 500);
  }, []);

  useEffect(() => {
    // Desktop: mouseup is the final event of a drag selection.
    const handleMouseUp = () => readSelection();

    // Mobile: iOS/Android commit a long-press selection after touchend, and
    // dragging the native selection handles does not fire touchend at all.
    // Read on the next frame and let selectionchange cover the rest.
    const handleTouchEnd = () => {
      requestAnimationFrame(readSelection);
    };

    // selectionchange is the only reliable signal for touch selection. It
    // fires repeatedly while the handles are dragged, so debounce it.
    const handleSelectionChange = () => {
      if (selectionChangeTimerRef.current) {
        clearTimeout(selectionChangeTimerRef.current);
      }
      selectionChangeTimerRef.current = setTimeout(readSelection, 80);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (guardTimerRef.current) {
        clearTimeout(guardTimerRef.current);
        guardTimerRef.current = null;
      }
      if (selectionChangeTimerRef.current) {
        clearTimeout(selectionChangeTimerRef.current);
        selectionChangeTimerRef.current = null;
      }
    };
  }, [readSelection]);

  const keepSelection = useCallback(() => {
    keepSelectionUntilRef.current = Date.now() + 600;
  }, []);

  const clearSelection = useCallback(() => {
    keepSelectionUntilRef.current = 0;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // 导出标记，供外部判断
  const hasJustSelected = useCallback(() => justSelectedRef.current, []);

  return { selection, clearSelection, hasJustSelected, keepSelection };
}
