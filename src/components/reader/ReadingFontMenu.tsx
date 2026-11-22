import { useEffect, useRef, useState } from 'react';
import { FiType } from 'react-icons/fi';
import {
  useSettingsStore,
  type ReadingFont,
} from '../../stores/settingsSlice';
import { registerKeyboardHandler } from '../../lib/keyboard';
import { PairOrderToggle } from '../common/PairOrderToggle';

const FONTS: Array<{
  id: ReadingFont;
  label: string;
  note: string;
}> = [
  { id: 'serif', label: '明朝', note: '长文阅读推荐' },
  { id: 'sans', label: '黑体', note: '清爽、屏幕感' },
  { id: 'ud', label: 'UD 黑体', note: '字形清楚，久读不累' },
  { id: 'maru', label: '圆体', note: '柔和，接近原版' },
  { id: 'klee', label: '教科书体', note: '接近手写，适合初学' },
];

/**
 * Reading typeface picker that sits next to A−/A+. The preview line uses each
 * family so the choice is made by looking, not by guessing the name.
 */
export function ReadingFontMenu() {
  const readingFont = useSettingsStore((s) => s.readingFont);
  const setReadingFont = useSettingsStore((s) => s.setReadingFont);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    const unregister = registerKeyboardHandler('reading-font', 100, (event) => {
      if (event.key !== 'Escape') return false;
      setOpen(false);
      return true;
    });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      unregister();
    };
  }, [open]);

  const current = FONTS.find((font) => font.id === readingFont) ?? FONTS[0];

  return (
    <div className="reading-font-menu" ref={rootRef}>
      <button
        className="binder-icon-btn"
        onClick={() => setOpen((value) => !value)}
        title={`阅读字体：${current.label}`}
        aria-label={`阅读字体：${current.label}`}
        aria-expanded={open}
      >
        <FiType size={15} />
      </button>

      {open && (
        <div className="reading-font-popover" role="menu" aria-label="选择阅读字体">
          {FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              role="menuitemradio"
              aria-checked={font.id === readingFont}
              className={`reading-font-option${font.id === readingFont ? ' active' : ''}`}
              data-font={font.id}
              onClick={() => {
                setReadingFont(font.id);
                setOpen(false);
              }}
            >
              <span className="reading-font-sample">あア漢字</span>
              <span className="reading-font-copy">
                <b>{font.label}</b>
                <small>{font.note}</small>
              </span>
            </button>
          ))}

          <div className="reading-font-order">
            <span>双语顺序</span>
            <PairOrderToggle />
          </div>
        </div>
      )}
    </div>
  );
}
