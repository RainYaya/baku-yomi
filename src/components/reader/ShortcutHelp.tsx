interface Props {
  onClose: () => void;
}

const shortcuts = [
  { keys: ['j', '↓'], desc: '下一个句对' },
  { keys: ['k', '↑'], desc: '上一个句对' },
  { keys: ['Enter'], desc: '展开/收起当前句对' },
  { keys: ['Escape'], desc: '收起句对 / 退出输入框' },
  { keys: ['Ctrl', 'Enter'], desc: '提交翻译分析' },
  { keys: ['n'], desc: '切换笔记弹窗' },
  { keys: ['?'], desc: '显示/隐藏快捷键帮助' },
];

export function ShortcutHelp({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-80 p-6 space-y-4 rounded-sm"
        style={{ backgroundColor: 'var(--bg-color)', border: 'var(--border-style)', color: 'var(--brand-green)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold uppercase tracking-wide">键盘快捷键</h3>
        <div className="space-y-2">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {keys.map((key, i) => (
                  <span key={i}>
                    <kbd
                      className="px-1.5 py-0.5 text-xs font-mono rounded-sm"
                      style={{ border: 'var(--border-style)', backgroundColor: 'rgba(26, 81, 46, 0.06)' }}
                    >
                      {key}
                    </kbd>
                    {i < keys.length - 1 && (
                      <span className="text-xs mx-0.5 opacity-40">+</span>
                    )}
                  </span>
                ))}
              </div>
              <span className="text-sm opacity-70">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-center opacity-40">
          按 <kbd className="px-1 py-0.5 text-xs font-mono rounded-sm" style={{ border: 'var(--border-style)' }}>?</kbd> 或 <kbd className="px-1 py-0.5 text-xs font-mono rounded-sm" style={{ border: 'var(--border-style)' }}>Esc</kbd> 关闭
        </p>
      </div>
    </div>
  );
}
