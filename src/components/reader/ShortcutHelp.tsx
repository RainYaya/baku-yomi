import { FiX } from 'react-icons/fi';

interface Props {
  onClose: () => void;
}

const shortcuts = [
  { keys: ['j', '↓'], desc: '下一句' },
  { keys: ['k', '↑'], desc: '上一句' },
  { keys: ['Enter'], desc: '展开/收起' },
  { keys: ['n'], desc: '笔记' },
  { keys: ['Ctrl', 'Enter'], desc: '提交分析' },
  { keys: ['Esc'], desc: '关闭' },
  { keys: ['?'], desc: '帮助' },
];

export function ShortcutHelp({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(45, 45, 45, 0.3)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 p-6 animate-slide-up"
        style={{
          backgroundColor: 'var(--bg-paper)',
          borderRadius: '6px',
          boxShadow: '0 8px 32px rgba(44, 74, 110, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-sm font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-primary)',
              letterSpacing: '0.08em',
            }}
          >
            快捷键
          </h3>
          <button
            onClick={onClose}
            className="p-1 opacity-40 hover:opacity-100 transition-opacity"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="space-y-3">
          {shortcuts.map(({ keys, desc }) => (
            <div
              key={desc}
              className="flex items-center justify-between"
              style={{ fontFamily: 'var(--font-ui)' }}
            >
              <div className="flex items-center gap-1.5">
                {keys.map((key, i) => (
                  <span key={i} className="flex items-center">
                    <kbd
                      className="px-2 py-1 text-xs"
                      style={{
                        fontFamily: 'monospace',
                        border: '1px solid var(--border-color)',
                        borderRadius: '3px',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {key}
                    </kbd>
                    {i < keys.length - 1 && (
                      <span className="text-xs mx-0.5 opacity-40">+</span>
                    )}
                  </span>
                ))}
              </div>
              <span
                className="text-sm"
                style={{ color: 'var(--ink-muted)' }}
              >
                {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p
          className="text-xs text-center mt-6 opacity-40"
          style={{ fontFamily: 'var(--font-ui)' }}
        >
          按 <kbd className="px-1.5 py-0.5" style={{ border: '1px solid var(--border-color)', borderRadius: '2px' }}>?</kbd> 或{' '}
          <kbd className="px-1.5 py-0.5" style={{ border: '1px solid var(--border-color)', borderRadius: '2px' }}>Esc</kbd> 关闭
        </p>
      </div>
    </div>
  );
}
