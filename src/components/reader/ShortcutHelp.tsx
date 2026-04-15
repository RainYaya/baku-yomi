interface Props {
  onClose: () => void;
}

const shortcuts = [
  { keys: ['j'], desc: '选择下一句（Vim 模式）' },
  { keys: ['k'], desc: '选择上一句（Vim 模式）' },
  { keys: ['r'], desc: '开启 / 停止连续朗读' },
  { keys: ['gi'], desc: '进入输入框' },
  { keys: ['Esc'], desc: '退出输入 / 关闭面板' },
  { keys: ['?'], desc: '显示帮助' },
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
        </div>

        <div className="space-y-3">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {keys.map((key, i) => (
                  <span key={i}>
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
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                {desc}
              </span>
            </div>
          ))}
        </div>

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
