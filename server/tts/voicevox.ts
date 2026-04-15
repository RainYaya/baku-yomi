import type { TTSProvider, SynthesisOptions, Speaker } from './types';

export class VoicevoxProvider implements TTSProvider {
  readonly name = 'voicevox';
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? process.env.VOICEVOX_ENGINE_URL ?? 'http://localhost:50021').replace(/\/$/, '');
  }

  async synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer> {
    const queryRes = await fetch(
      `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: 'POST' },
    );

    if (!queryRes.ok) {
      const detail = await queryRes.text();
      throw new Error(`audio_query failed: ${detail}`);
    }

    const audioQuery = (await queryRes.json()) as Record<string, unknown>;

    if (options && typeof options === 'object') {
      if (typeof options.speedScale === 'number') {
        audioQuery.speedScale = Math.max(0.5, Math.min(2, options.speedScale));
      }
      if (typeof options.pitchScale === 'number') {
        audioQuery.pitchScale = Math.max(-0.15, Math.min(0.15, options.pitchScale));
      }
      if (typeof options.volumeScale === 'number') {
        audioQuery.volumeScale = Math.max(0.2, Math.min(2, options.volumeScale));
      }
    }

    const synthRes = await fetch(`${this.baseUrl}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    });

    if (!synthRes.ok) {
      const detail = await synthRes.text();
      throw new Error(`synthesis failed: ${detail}`);
    }

    return Buffer.from(await synthRes.arrayBuffer());
  }

  async getSpeakers(): Promise<Speaker[]> {
    const response = await fetch(`${this.baseUrl}/speakers`);

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`speakers failed: ${detail}`);
    }

    return (await response.json()) as Speaker[];
  }
}
