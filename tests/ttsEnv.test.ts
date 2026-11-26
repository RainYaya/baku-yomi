import assert from 'node:assert/strict';
import test from 'node:test';
import { readEnv } from '../worker/env';

test('readEnv falls back to the local voicestudio and a 32k bitrate', () => {
  const env = readEnv({});

  assert.equal(env.voicestudioUrl, 'http://127.0.0.1:3900');
  assert.equal(env.model, 'omnivoice');
  assert.equal(env.voice, 'default');
  assert.equal(env.bitrate, '32k');
  assert.equal(env.port, 3910);
});

test('a configured bitrate is kept and a nonsense one falls back', () => {
  assert.equal(readEnv({ BAKU_TTS_BITRATE: '48k' }).bitrate, '48k');
  assert.equal(readEnv({ BAKU_TTS_BITRATE: '64k' }).bitrate, '64k');
  assert.equal(readEnv({ BAKU_TTS_BITRATE: 'loud' }).bitrate, '32k');
  assert.equal(readEnv({ BAKU_TTS_BITRATE: '999999' }).bitrate, '32k');
});

test('a trailing slash on the speech base URL is stripped', () => {
  const env = readEnv({ VOICESTUDIO_URL: 'http://10.0.0.5:3900/' });

  assert.equal(env.voicestudioUrl, 'http://10.0.0.5:3900');
});

test('the share PIN is read from the environment', () => {
  assert.equal(readEnv({ VOICESTUDIO_PIN: '123456' }).pin, '123456');
  assert.equal(readEnv({}).pin, '');
});
