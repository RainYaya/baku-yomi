import { useState, useEffect, useCallback, useRef } from 'react';

export interface SelectionInfo {
  pairId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  rect: DOMRect;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const justSelectedRef = useRef(false);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    
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

    justSelectedRef.current = true;
    setSelection({
      pairId,
      startOffset,
      endOffset,
      text,
      rect,
    });

    // 500ms 后重置标记
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 500);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseUp]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // 导出标记，供外部判断
  const hasJustSelected = () => justSelectedRef.current;

  return { selection, clearSelection, hasJustSelected };
}
