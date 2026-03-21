import { useState, useEffect, useCallback } from 'react';

export interface SelectionInfo {
  pairId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  rect: DOMRect;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    
    if (!text) {
      setSelection(null);
      return;
    }

    // 检查是否在 SentencePairCard 内
    const container = range.commonAncestorContainer;
    const pairCard = (container instanceof Element ? container : container.parentElement)
      ?.closest('[data-pair-id]');
    
    if (!pairCard) {
      setSelection(null);
      return;
    }

    const pairId = pairCard.getAttribute('data-pair-id');
    if (!pairId) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    
    // 计算相对于文本内容的偏移
    const preRange = document.createRange();
    preRange.selectNodeContents(pairCard);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + text.length;

    setSelection({
      pairId,
      startOffset,
      endOffset,
      text,
      rect,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clearSelection };
}
