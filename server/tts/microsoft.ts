import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TTSProvider, SynthesisOptions, Speaker } from './types';

// Japanese voices — id maps to index in this array
const JA_VOICES = [
  'ja-JP-NanamiNeural',   // id 0, female
  'ja-JP-KeitaNeural',    // id 1, male
];

export class MicrosoftTTSProvider implements TTSProvider {
  readonly name = 'microsoft';

  async synthesize(text: string, speaker: number, options?: SynthesisOptions): Promise<Buffer> {
    const voice = JA_VOICES[speaker] ?? JA_VOICES[0];

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const prosody: { rate?: number; pitch?: string; volume?: number } = {};
    if (options?.speedScale != null) {
      prosody.rate = options.speedScale;
    }
    if (options?.pitchScale != null) {
      // Convert our -0.15~0.15 range to semitone string
      const st = (options.pitchScale * 20).toFixed(1);
      prosody.pitch = `${Number(st) >= 0 ? '+' : ''}${st}st`;
    }
    if (options?.volumeScale != null) {
      // Convert our 0.2~2 range to 0~100
      prosody.volume = Math.round(Math.min(100, Math.max(0, options.volumeScale * 50)));
    }

    const { audioStream } = tts.toStream(text, prosody);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }

    tts.close();
    return Buffer.concat(chunks);
  }

  async getSpeakers(): Promise<Speaker[]> {
    try {
      const tts = new MsEdgeTTS();
      const allVoices = await tts.getVoices();
      const jaVoices = allVoices.filter((v) => v.Locale === 'ja-JP');
      tts.close();

      if (jaVoices.length > 0) {
        return jaVoices.map((v, i) => ({
          name: v.FriendlyName,
          speaker_uuid: `ms-${v.ShortName}`,
          styles: [{ id: i, name: v.ShortName }],
        }));
      }
    } catch {
      // Fall back to hardcoded list
    }

    return JA_VOICES.map((voice, i) => ({
      name: voice.replace('Neural', ''),
      speaker_uuid: `ms-${voice}`,
      styles: [{ id: i, name: voice }],
    }));
  }
}
