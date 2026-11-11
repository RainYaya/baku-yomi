import { useMemo } from 'react';
import { useSettingsStore } from '../../stores/settingsSlice';
import type { AIProviderType } from '../../types';
import {
  DEFAULT_MODELS,
  BILIBILI_FREE_MODEL,
  isKeylessProvider,
} from '../../types';
import { FiPlus, FiTrash2, FiZap } from 'react-icons/fi';

const PROVIDERS: { value: AIProviderType; label: string; note?: string }[] = [
  { value: 'bilibili-free', label: 'B站免费（无需 Key）', note: '匿名可用，适合日常讲解' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
];

export function AISettingsPanel() {
  const {
    aiProviders,
    activeAIProviderId,
    addAIProvider,
    removeAIProvider,
    setActiveAIProviderId,
    updateAIProvider,
  } = useSettingsStore();

  const active = useMemo(
    () => aiProviders.find((p) => p.id === activeAIProviderId) ?? aiProviders[0],
    [aiProviders, activeAIProviderId]
  );

  if (!active) return null;

  const keyless = isKeylessProvider(active.type);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="settings-label !mb-0">AI 供应商</label>
        <button
          className="settings-mini-btn"
          onClick={() => addAIProvider('openai')}
          title="新增供应商"
        >
          <FiPlus size={14} /> 新增
        </button>
      </div>

      <div className="space-y-2">
        {aiProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setActiveAIProviderId(provider.id)}
            className={`settings-provider-item ${provider.id === activeAIProviderId ? 'active' : ''}`}
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="text-left min-w-0">
                <div className="truncate" style={{ fontFamily: 'var(--font-ui)' }}>
                  {provider.name}
                </div>
                <div className="text-xs opacity-50 truncate">{provider.type}</div>
              </div>
              <span className={`settings-provider-dot ${provider.enabled ? 'on' : 'off'}`} />
            </div>
          </button>
        ))}
      </div>

      <div>
        <label className="settings-label">名称</label>
        <input
          type="text"
          value={active.name}
          onChange={(e) => updateAIProvider(active.id, { name: e.target.value })}
          className="settings-input"
          placeholder="比如：主力 OpenAI"
        />
      </div>

      <div>
        <label className="settings-label">提供商类型</label>
        <select
          value={active.type}
          onChange={(e) => {
            const type = e.target.value as AIProviderType;
            updateAIProvider(active.id, {
              type,
              model: DEFAULT_MODELS[type],
              baseUrl: type === 'openai-compatible' ? active.baseUrl : undefined,
            });
          }}
          className="settings-input"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {keyless ? (
        <div
          className="rounded p-3 text-xs space-y-1.5"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--ink-secondary)',
            fontFamily: 'var(--font-ui)',
            lineHeight: 1.7,
          }}
        >
          <div className="flex items-center gap-1.5" style={{ color: 'var(--accent-secondary)' }}>
            <FiZap size={12} />
            无需 API Key
          </div>
          <p>
            使用 B 站 Index-Translate 的匿名接口，模型固定为 {BILIBILI_FREE_MODEL}。
            请求走流式以避开网关超时，长讲解也能完整返回。
          </p>
          <p style={{ opacity: 0.7 }}>
            这是第三方免费服务，不保证可用性与稳定性。需要更强的分析时，再切回自己的 Key。
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="settings-label">API Key</label>
            <input
              type="password"
              value={active.apiKey}
              onChange={(e) => updateAIProvider(active.id, { apiKey: e.target.value })}
              className="settings-input"
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="settings-label">模型名称</label>
            <input
              type="text"
              value={active.model}
              onChange={(e) => updateAIProvider(active.id, { model: e.target.value })}
              className="settings-input"
              placeholder={DEFAULT_MODELS[active.type]}
            />
          </div>

          {active.type === 'openai-compatible' && (
            <div>
              <label className="settings-label">Base URL</label>
              <input
                type="text"
                value={active.baseUrl ?? ''}
                onChange={(e) => updateAIProvider(active.id, { baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="settings-input"
              />
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <label className="settings-label !mb-0">启用此供应商</label>
        <input
          type="checkbox"
          checked={active.enabled}
          onChange={(e) => updateAIProvider(active.id, { enabled: e.target.checked })}
        />
      </div>

      <div className="flex justify-end">
        <button
          className="settings-mini-btn danger"
          onClick={() => removeAIProvider(active.id)}
          title="删除当前供应商"
        >
          <FiTrash2 size={14} /> 删除当前供应商
        </button>
      </div>
    </div>
  );
}
