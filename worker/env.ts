import { homedir } from 'node:os';
import { join } from 'node:path';

export interface WorkerEnv {
  /** OpenAI-compatible speech endpoint, without a trailing slash. */
  voicestudioUrl: string;
  voicestudioKey: string;
  /** VoiceStudio's share PIN; required when it is reached over the LAN. */
  pin: string;
  model: string;
  voice: string;
  bitrate: string;
  port: number;
  workdir: string;
  /** App server that receives the asset; empty means keep it local. */
  rogUrl: string;
  importToken: string;
}

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** `32k`, `48k`, `64k`; anything else would make libopus fail at encode time. */
const BITRATE = /^\d{2,3}k$/;

function readBitrate(value: string | undefined): string {
  const wanted = text(value);
  return BITRATE.test(wanted) ? wanted : '32k';
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const port = Number(source.BAKU_TTS_PORT ?? 3910);
  return {
    voicestudioUrl: withoutTrailingSlash(
      text(source.VOICESTUDIO_URL) || 'http://127.0.0.1:3900'
    ),
    voicestudioKey: text(source.VOICESTUDIO_KEY),
    pin: text(source.VOICESTUDIO_PIN),
    model: text(source.VOICESTUDIO_MODEL) || 'omnivoice',
    voice: text(source.VOICESTUDIO_VOICE) || 'default',
    bitrate: readBitrate(source.BAKU_TTS_BITRATE),
    port: Number.isFinite(port) && port > 0 ? port : 3910,
    workdir: text(source.BAKU_TTS_WORKDIR) || join(homedir(), '.baku-tts'),
    rogUrl: withoutTrailingSlash(text(source.BAKU_ROG_URL)),
    importToken: text(source.BAKU_IMPORT_TOKEN),
  };
}
