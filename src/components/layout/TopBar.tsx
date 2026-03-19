import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import {
  HiOutlineBars3,
  HiOutlineCog6Tooth,
  HiOutlineEyeSlash,
  HiOutlineEye,
  HiOutlineLanguage,
  HiOutlineLightBulb,
} from 'react-icons/hi2';

export function TopBar() {
  const { blindMode, toggleBlindMode, showFurigana, toggleFurigana, keywordMode, toggleKeywordMode } =
    useSettingsStore();
  const { toggleSidebar, openSettings } = useUIStore();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="切换侧栏"
        >
          <HiOutlineBars3 size={20} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">双語回訳</h1>
        <span className="text-xs text-gray-400">Bilingual Back-Translation</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleBlindMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            blindMode
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={blindMode ? '关闭盲模式' : '开启盲模式（隐藏日文原文）'}
        >
          {blindMode ? (
            <HiOutlineEyeSlash size={16} />
          ) : (
            <HiOutlineEye size={16} />
          )}
          {blindMode ? '盲模式 ON' : '盲模式'}
        </button>

        <button
          onClick={toggleFurigana}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showFurigana
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={showFurigana ? '隐藏注音' : '显示注音（振り仮名）'}
        >
          <HiOutlineLanguage size={16} />
          {showFurigana ? '注音 ON' : '注音'}
        </button>

        <button
          onClick={toggleKeywordMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            keywordMode
              ? 'bg-violet-100 text-violet-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={keywordMode ? '关闭AI提示模式' : '开启AI提示模式（隐藏中文，用AI语法提示辅助回译）'}
        >
          <HiOutlineLightBulb size={16} />
          {keywordMode ? 'AI提示 ON' : 'AI提示'}
        </button>

        <button
          onClick={openSettings}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="设置"
        >
          <HiOutlineCog6Tooth size={20} />
        </button>
      </div>
    </header>
  );
}
