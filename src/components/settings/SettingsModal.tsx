import { useState } from 'react';
import { useUIStore } from '../../stores/uiSlice';
import { FiX } from 'react-icons/fi';
import { AISettingsPanel } from './AISettingsPanel';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

type SettingsTab = 'ai' | 'voice';

export function SettingsModal() {
  const { settingsOpen, closeSettings } = useUIStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  if (!settingsOpen) return null;

  return (
    <div className="settings-drawer-overlay" onClick={closeSettings}>
      <aside
        className="settings-drawer settings-drawer-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-drawer-header">
          <h2 className="settings-drawer-title">设置</h2>
          <button
            onClick={closeSettings}
            className="settings-close-btn"
            title="关闭设置"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="设置分类">
          <button
            role="tab"
            aria-selected={activeTab === 'ai'}
            className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            AI
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'voice'}
            className={`settings-tab ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            语音
          </button>
        </div>

        <div className="settings-drawer-content">
          {activeTab === 'ai' ? <AISettingsPanel /> : <VoiceSettingsPanel />}
        </div>

        <div className="settings-drawer-footer">
          <button onClick={closeSettings} className="btn btn-primary px-6 py-2.5">
            完成
          </button>
        </div>
      </aside>
    </div>
  );
}
