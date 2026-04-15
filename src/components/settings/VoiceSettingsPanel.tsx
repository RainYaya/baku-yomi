import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore, type TTSProviderType } from '../../stores/settingsSlice';
import {
  clearVoicevoxCache,
  getVoicevoxCacheStats,
  getVoicevoxSpeakers,
  type VoicevoxSpeaker,
} from '../../lib/tts/voicevox';

type ServerCacheStats = {
  items: number;
  totalBytes: number;
  maxBytes: number;
  hits: number;
  misses: number;
  evictions: number;
};

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoiceSettingsPanel() {
  const {
    ttsProvider,
    setTtsProvider,
    voicevoxSpeakerId,
    setVoicevoxSpeakerId,
    voicevoxSpeed,
    setVoicevoxSpeed,
    voicevoxPitch,
    setVoicevoxPitch,
    voicevoxVolume,
    setVoicevoxVolume,
    voicevoxPrefetchWindow,
    setVoicevoxPrefetchWindow,
    voicevoxCacheLimitMB,
    setVoicevoxCacheLimitMB,
  } = useSettingsStore();

  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [localStatsText, setLocalStatsText] = useState('');
  const [serverStats, setServerStats] = useState<ServerCacheStats | null>(null);

  const speakerOptions = useMemo(
    () =>
      voicevoxSpeakers.flatMap((speaker) =>
        speaker.styles.map((style) => ({
          id: style.id,
          label: `${speaker.name} / ${style.name}`,
        }))
      ),
    [voicevoxSpeakers]
  );

  const refreshStats = async () => {
    const local = getVoicevoxCacheStats();
    setLocalStatsText(
      `前端缓存：${formatMB(local.totalBytes)} / ${formatMB(local.maxBytes)}，条目 ${local.items}，命中 ${local.hits}，未命中 ${local.misses}`
    );

    try {
      const response = await fetch('/api/tts/cache/stats');
      if (!response.ok) return;
      const data = (await response.json()) as ServerCacheStats;
      setServerStats(data);
    } catch {
      // silent
    }
  };

  const clearBothCaches = async () => {
    clearVoicevoxCache();

    try {
      await fetch('/api/tts/cache/clear', { method: 'POST' });
    } catch {
      // silent
    }

    await refreshStats();
  };

  useEffect(() => {
    let cancelled = false;

    if (ttsProvider === 'voicevox') {
      const loadSpeakers = async () => {
        try {
          const speakers = await getVoicevoxSpeakers();
          if (!cancelled) {
            setVoicevoxSpeakers(speakers);
          }
        } catch (error) {
          console.error('Failed to load VOICEVOX speakers:', error);
        }
      };
      void loadSpeakers();
    }

    void refreshStats();

    return () => {
      cancelled = true;
    };
  }, [ttsProvider]);

  return (
    <div className="space-y-5">
      <div>
        <label className="settings-label">TTS 引擎</label>
        <select
          value={ttsProvider}
          onChange={(e) => setTtsProvider(e.target.value as TTSProviderType)}
          className="settings-input"
        >
          <option value="voicevox">VOICEVOX</option>
          <option value="microsoft">Microsoft TTS（免费）</option>
        </select>
      </div>

      {ttsProvider === 'microsoft' && (
        <p className="settings-note">
          Microsoft TTS 使用 Edge 浏览器内置的免费语音合成，无需额外配置。
        </p>
      )}

      {ttsProvider === 'voicevox' && (
        <>
          <div>
            <label className="settings-label">VOICEVOX 声音（全局）</label>
            <select
              value={voicevoxSpeakerId}
              onChange={(e) => setVoicevoxSpeakerId(Number(e.target.value))}
              className="settings-input"
            >
              {speakerOptions.length > 0 ? (
                speakerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))
              ) : (
                <option value={voicevoxSpeakerId}>声音 {voicevoxSpeakerId}</option>
              )}
            </select>
          </div>

          <div>
            <label className="settings-label">语速 {voicevoxSpeed.toFixed(2)}</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={voicevoxSpeed}
              onChange={(e) => setVoicevoxSpeed(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="settings-label">音高 {voicevoxPitch.toFixed(2)}</label>
            <input
              type="range"
              min={-0.15}
              max={0.15}
              step={0.01}
              value={voicevoxPitch}
              onChange={(e) => setVoicevoxPitch(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="settings-label">音量 {voicevoxVolume.toFixed(2)}</label>
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={voicevoxVolume}
              onChange={(e) => setVoicevoxVolume(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <label className="settings-label">连续朗读预取句数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={voicevoxPrefetchWindow}
              onChange={(e) => setVoicevoxPrefetchWindow(Number(e.target.value))}
              className="settings-input"
            />
          </div>

          <div>
            <label className="settings-label">前端缓存上限（MB）</label>
            <input
              type="number"
              min={16}
              max={512}
              value={voicevoxCacheLimitMB}
              onChange={(e) => setVoicevoxCacheLimitMB(Number(e.target.value))}
              className="settings-input"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="settings-label !mb-0">缓存状态</label>
          <button className="settings-mini-btn" onClick={() => void refreshStats()}>
            刷新
          </button>
        </div>
        <p className="settings-note">{localStatsText || '前端缓存：读取中...'}</p>
        <p className="settings-note">
          {serverStats
            ? `服务端缓存：${formatMB(serverStats.totalBytes)} / ${formatMB(serverStats.maxBytes)}，条目 ${serverStats.items}，命中 ${serverStats.hits}，未命中 ${serverStats.misses}`
            : '服务端缓存：读取中...'}
        </p>
        <div className="flex justify-end">
          <button className="settings-mini-btn danger" onClick={() => void clearBothCaches()}>
            清空前后端缓存
          </button>
        </div>
      </div>
    </div>
  );
}
