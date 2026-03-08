import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import type { AIProviderType } from '../../types';
import { DEFAULT_MODELS } from '../../types';
import { HiOutlineXMark } from 'react-icons/hi2';

const PROVIDERS: { value: AIProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
];

export function SettingsModal() {
  const { settingsOpen, closeSettings } = useUIStore();
  const { aiProvider, setAIProvider } = useSettingsStore();

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">设置</h2>
          <button
            onClick={closeSettings}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <HiOutlineXMark size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Provider select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AI 供应商
            </label>
            <select
              value={aiProvider.type}
              onChange={(e) => {
                const type = e.target.value as AIProviderType;
                setAIProvider({
                  type,
                  model: DEFAULT_MODELS[type],
                  baseUrl: undefined,
                });
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={aiProvider.apiKey}
              onChange={(e) => setAIProvider({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Model name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              模型名称
            </label>
            <input
              type="text"
              value={aiProvider.model}
              onChange={(e) => setAIProvider({ model: e.target.value })}
              placeholder={DEFAULT_MODELS[aiProvider.type]}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Base URL for OpenAI-compatible */}
          {aiProvider.type === 'openai-compatible' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base URL
              </label>
              <input
                type="text"
                value={aiProvider.baseUrl ?? ''}
                onChange={(e) => setAIProvider({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={closeSettings}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
