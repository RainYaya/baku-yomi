import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import type { AIProviderType } from '../../types';
import { DEFAULT_MODELS } from '../../types';
import { FiX } from 'react-icons/fi';

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
    <div className="modal-overlay" onClick={closeSettings}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '2rem' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2
            className="text-lg font-medium"
            style={{
              fontFamily: 'var(--font-ui)',
              color: 'var(--ink-primary)',
            }}
          >
            设置
          </h2>
          <button
            onClick={closeSettings}
            className="p-1.5 rounded transition-colors opacity-50 hover:opacity-100"
            style={{ color: 'var(--ink-muted)' }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Provider select */}
          <div>
            <label
              className="block text-sm mb-2"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-secondary)',
                fontWeight: 500,
              }}
            >
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
              className="w-full px-4 py-2.5 text-sm"
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-paper)',
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-primary)',
              }}
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
            <label
              className="block text-sm mb-2"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-secondary)',
                fontWeight: 500,
              }}
            >
              API Key
            </label>
            <input
              type="password"
              value={aiProvider.apiKey}
              onChange={(e) => setAIProvider({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 text-sm"
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-paper)',
                fontFamily: 'var(--font-ui)',
              }}
            />
          </div>

          {/* Model name */}
          <div>
            <label
              className="block text-sm mb-2"
              style={{
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-secondary)',
                fontWeight: 500,
              }}
            >
              模型名称
            </label>
            <input
              type="text"
              value={aiProvider.model}
              onChange={(e) => setAIProvider({ model: e.target.value })}
              placeholder={DEFAULT_MODELS[aiProvider.type]}
              className="w-full px-4 py-2.5 text-sm"
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-paper)',
                fontFamily: 'var(--font-ui)',
              }}
            />
          </div>

          {/* Base URL for OpenAI-compatible */}
          {aiProvider.type === 'openai-compatible' && (
            <div>
              <label
                className="block text-sm mb-2"
                style={{
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--ink-secondary)',
                  fontWeight: 500,
                }}
              >
                Base URL
              </label>
              <input
                type="text"
                value={aiProvider.baseUrl ?? ''}
                onChange={(e) => setAIProvider({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="w-full px-4 py-2.5 text-sm"
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-paper)',
                  fontFamily: 'var(--font-ui)',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={closeSettings}
            className="btn btn-primary px-6 py-2.5"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
