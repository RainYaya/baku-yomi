export type VoicevoxSpeakerStyle = {
  id: number;
  name: string;
};

export type VoicevoxSpeaker = {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxSpeakerStyle[];
};

type VoicevoxPlaybackState = {
  pairId: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

type PlaybackListener = (state: VoicevoxPlaybackState) => void;
type PlaybackEndedListener = (pairId: string | null) => void;

type VoiceCacheItem = {
  key: string;
  url: string;
  size: number;
  lastAccessAt: number;
};

type VoiceCacheStats = {
  items: number;
  totalBytes: number;
  pending: number;
  maxBytes: number;
  hits: number;
  misses: number;
  evictions: number;
};

import { useSettingsStore } from '../../stores/settingsSlice';

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
const voiceCache = new Map<string, VoiceCacheItem>();
const voicePending = new Map<string, Promise<string>>();
const DEFAULT_MAX_CACHE_BYTES = 80 * 1024 * 1024;
let cacheMaxBytes = DEFAULT_MAX_CACHE_BYTES;
let cacheBytes = 0;
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;
let cachedSpeakers: VoicevoxSpeaker[] | null = null;
let speakersRequest: Promise<VoicevoxSpeaker[]> | null = null;
const listeners = new Set<PlaybackListener>();
const endedListeners = new Set<PlaybackEndedListener>();

let playbackState: VoicevoxPlaybackState = {
  pairId: null,
  isLoading: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

function emitPlaybackState(): void {
  for (const listener of listeners) {
    listener(playbackState);
  }
}

function setPlaybackState(partial: Partial<VoicevoxPlaybackState>): void {
  playbackState = { ...playbackState, ...partial };
  emitPlaybackState();
}

function emitPlaybackEnded(pairId: string | null): void {
  for (const listener of endedListeners) {
    listener(pairId);
  }
}

export type VoicevoxSynthesisOptions = {
  speedScale?: number;
  pitchScale?: number;
  volumeScale?: number;
};

/** Read the current TTS provider from settings store (works outside React) */
function getCurrentTtsProvider(): string {
  return useSettingsStore.getState().ttsProvider;
}

function makeVoiceCacheKey(text: string, speaker: number, options?: VoicevoxSynthesisOptions): string {
  const provider = getCurrentTtsProvider();
  const speed = options?.speedScale ?? 1;
  const pitch = options?.pitchScale ?? 0;
  const volume = options?.volumeScale ?? 1;
  return `${provider}::${speaker}::${speed}::${pitch}::${volume}::${text}`;
}

function touchVoiceCache(item: VoiceCacheItem): void {
  item.lastAccessAt = Date.now();
}

function evictVoiceCache(targetBytes = cacheMaxBytes): void {
  if (cacheBytes <= targetBytes) return;

  const candidates = [...voiceCache.values()].sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  for (const item of candidates) {
    voiceCache.delete(item.key);
    cacheBytes -= item.size;
    cacheEvictions += 1;
    URL.revokeObjectURL(item.url);

    if (cacheBytes <= targetBytes) {
      break;
    }
  }
}

function saveVoiceCache(key: string, url: string, size: number): void {
  const existing = voiceCache.get(key);
  if (existing) {
    cacheBytes -= existing.size;
    URL.revokeObjectURL(existing.url);
  }

  const item: VoiceCacheItem = {
    key,
    url,
    size,
    lastAccessAt: Date.now(),
  };

  voiceCache.set(key, item);
  cacheBytes += size;
  evictVoiceCache(cacheMaxBytes);
}

async function requestVoiceBlob(
  text: string,
  speaker: number,
  options?: VoicevoxSynthesisOptions
): Promise<Blob> {
  const provider = getCurrentTtsProvider();
  const response = await fetch(`/api/tts/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker, options }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'TTS request failed');
  }

  return response.blob();
}

async function ensureVoiceUrl(
  text: string,
  speaker: number,
  options?: VoicevoxSynthesisOptions
): Promise<string> {
  const key = makeVoiceCacheKey(text, speaker, options);
  const cached = voiceCache.get(key);
  if (cached) {
    cacheHits += 1;
    touchVoiceCache(cached);
    return cached.url;
  }

  const pending = voicePending.get(key);
  if (pending) {
    return pending;
  }

  cacheMisses += 1;

  const task = (async () => {
    const blob = await requestVoiceBlob(text, speaker, options);
    const url = URL.createObjectURL(blob);
    saveVoiceCache(key, url, blob.size);
    return url;
  })();

  voicePending.set(key, task);

  try {
    return await task;
  } finally {
    voicePending.delete(key);
  }
}

export function prefetchVoicevox(text: string, speaker = 1, options?: VoicevoxSynthesisOptions): Promise<void> {
  return ensureVoiceUrl(text, speaker, options).then(() => undefined);
}

function cleanupCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.ontimeupdate = null;
    currentAudio.onplay = null;
    currentAudio.onpause = null;
    currentAudio.onloadedmetadata = null;
  }

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
  }

  currentAudio = null;
  currentAudioUrl = null;
  setPlaybackState({
    pairId: null,
    isLoading: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });
}

export function subscribeVoicevoxPlayback(listener: PlaybackListener): () => void {
  listeners.add(listener);
  listener(playbackState);
  return () => listeners.delete(listener);
}

export function subscribeVoicevoxEnded(listener: PlaybackEndedListener): () => void {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}

export function toggleVoicevoxPause(): void {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    void currentAudio.play();
  } else {
    currentAudio.pause();
  }
}

export function seekVoicevox(seconds: number): void {
  if (!currentAudio) return;
  currentAudio.currentTime = Math.max(0, Math.min(seconds, currentAudio.duration || 0));
  setPlaybackState({ currentTime: currentAudio.currentTime });
}

export function stopVoicevoxPlayback(): void {
  cleanupCurrentAudio();
}

export function setVoicevoxCacheLimit(maxBytes: number): void {
  cacheMaxBytes = Math.max(1024 * 1024, Math.floor(maxBytes));
  evictVoiceCache(cacheMaxBytes);
}

export function getVoicevoxCacheStats(): VoiceCacheStats {
  return {
    items: voiceCache.size,
    totalBytes: cacheBytes,
    pending: voicePending.size,
    maxBytes: cacheMaxBytes,
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
  };
}

export function clearVoicevoxCache(): void {
  for (const item of voiceCache.values()) {
    URL.revokeObjectURL(item.url);
  }
  voiceCache.clear();
  cacheBytes = 0;
}

export async function getVoicevoxSpeakers(): Promise<VoicevoxSpeaker[]> {
  if (cachedSpeakers) {
    return cachedSpeakers;
  }

  if (speakersRequest) {
    return speakersRequest;
  }

  speakersRequest = (async () => {
    const response = await fetch('/api/tts/voicevox/speakers');

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || 'Failed to fetch speakers');
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid VOICEVOX speakers response');
    }

    cachedSpeakers = data as VoicevoxSpeaker[];
    return cachedSpeakers;
  })();

  try {
    return await speakersRequest;
  } finally {
    speakersRequest = null;
  }
}

export async function playVoicevox(
  text: string,
  speaker = 1,
  pairId?: string,
  options?: VoicevoxSynthesisOptions
): Promise<void> {
  cleanupCurrentAudio();
  setPlaybackState({ pairId: pairId ?? null, isLoading: true, isPlaying: false });

  const url = await ensureVoiceUrl(text, speaker, options);
  const audio = new Audio(url);

  currentAudio = audio;
  currentAudioUrl = null;

  audio.onloadedmetadata = () => {
    setPlaybackState({ duration: audio.duration || 0 });
  };

  audio.ontimeupdate = () => {
    setPlaybackState({ currentTime: audio.currentTime || 0 });
  };

  audio.onplay = () => {
    setPlaybackState({ isLoading: false, isPlaying: true });
  };

  audio.onpause = () => {
    setPlaybackState({ isPlaying: false });
  };

  audio.onended = () => {
    const endedPairId = playbackState.pairId;
    cleanupCurrentAudio();
    emitPlaybackEnded(endedPairId);
  };

  audio.onerror = () => {
    cleanupCurrentAudio();
  };

  try {
    await audio.play();
  } catch (error) {
    cleanupCurrentAudio();
    throw error;
  }
}
