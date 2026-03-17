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
        className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-800">键盘快捷键</h3>
        <div className="space-y-2">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {keys.map((key, i) => (
                  <span key={i}>
                    <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-mono text-gray-700">
                      {key}
                    </kbd>
                    {i < keys.length - 1 && (
                      <span className="text-gray-400 text-xs mx-0.5">+</span>
                    )}
                  </span>
                ))}
              </div>
              <span className="text-sm text-gray-600">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          按 <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-xs font-mono">?</kbd> 或 <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-xs font-mono">Esc</kbd> 关闭
        </p>
      </div>
    </div>
  );
}
