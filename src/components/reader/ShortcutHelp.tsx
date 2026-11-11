import { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { registerKeyboardHandler } from '../../lib/keyboard';

interface Props {
  onClose: () => void;
}

const shortcuts = [
  { keys: ['j'], desc: '下一句' },
  { keys: ['k'], desc: '上一句' },
  { keys: ['P'], desc: '在句内练习' },
  { keys: ['E'], desc: '在句内看讲解' },
  { keys: ['⇧', 'P'], desc: '打开整页练习桌' },
  { keys: ['gi'], desc: '进入输入框' },
  { keys: ['r'], desc: '开启 / 停止连续朗读' },
  { keys: ['Esc'], desc: '逐级返回' },
  { keys: ['?'], desc: '显示帮助' },
];

export function ShortcutHelp({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(
    () =>
      registerKeyboardHandler('shortcut-help', 100, (event) => {
        if (event.key === 'Escape' || event.key === '?') {
          onClose();
          return true;
        }
        return false;
      }),
    [onClose]
  );

  return (
    <div
      className="shortcut-backdrop"
      data-help-state="open"
      role="dialog"
      aria-modal="true"
      aria-label="快捷键"
      onClick={onClose}
    >
      <div className="shortcut-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-head">
          <div>
            <h3>快捷键</h3>
            <span>阅读时随时可用</span>
          </div>
          <button
            ref={closeRef}
            className="shortcut-close"
            onClick={onClose}
            aria-label="关闭快捷键"
            title="关闭"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="shortcut-list">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="shortcut-row">
              <span className="shortcut-keys">
                {keys.map((key, i) => (
                  <kbd key={i}>{key}</kbd>
                ))}
              </span>
              <span className="shortcut-desc">{desc}</span>
            </div>
          ))}
        </div>

        <p className="shortcut-foot">
          按 <kbd>?</kbd> 或 <kbd>Esc</kbd> 关闭
        </p>
      </div>
    </div>
  );
}
