import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_KEYS,
  backupFilename,
  createBackup,
  formatStorageSize,
  isBackupFile,
  isStorageNearLimit,
  measureStorage,
  restoreBackup,
  STORAGE_WARN_BYTES,
  type BackupFile,
} from '../src/lib/storage';

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test('measureStorage sums only the requested keys', () => {
  const storage = fakeStorage({
    'book-store': 'abcd',
    'practice-store': '12345678',
    'settings-store': 'xx',
    'other-key': 'ignored',
  });

  const usage = measureStorage(storage, [
    'book-store',
    'practice-store',
    'settings-store',
  ]);

  assert.equal(usage.bytes, 14);
  assert.equal(usage.perKey['book-store'], 4);
  assert.equal(usage.perKey['practice-store'], 8);
  assert.equal(usage.perKey['other-key'], undefined);
});

test('isStorageNearLimit uses the warn threshold', () => {
  assert.equal(
    isStorageNearLimit({
      bytes: STORAGE_WARN_BYTES - 1,
      limit: 5 * 1024 * 1024,
      ratio: 0,
      perKey: {},
    }),
    false
  );
  assert.equal(
    isStorageNearLimit({
      bytes: STORAGE_WARN_BYTES,
      limit: 5 * 1024 * 1024,
      ratio: 0,
      perKey: {},
    }),
    true
  );
});

test('createBackup includes durable data and excludes settings', () => {
  const storage = fakeStorage({
    'book-store': JSON.stringify({ state: { books: [1] }, version: 1 }),
    'practice-store': JSON.stringify({ state: { translations: {} }, version: 1 }),
    'baku-yomi-bookmarks': JSON.stringify({ state: { bookmarks: [] }, version: 1 }),
    'settings-store': JSON.stringify({ state: { apiKey: 'secret' } }),
  });

  const backup = createBackup(storage, new Date('2026-11-11T00:00:00Z'));

  assert.equal(backup.app, 'baku-yomi');
  assert.equal(backup.version, 1);
  assert.deepEqual(backup.data['book-store'], {
    state: { books: [1] },
    version: 1,
  });
  assert.equal('settings-store' in backup.data, false);
  assert.deepEqual(Object.keys(backup.data).sort(), [...BACKUP_KEYS].sort());
});

test('isBackupFile rejects foreign or malformed files', () => {
  assert.equal(isBackupFile(null), false);
  assert.equal(isBackupFile({}), false);
  assert.equal(isBackupFile({ app: 'other', version: 1, data: {} }), false);
  assert.equal(
    isBackupFile({ app: 'baku-yomi', version: 1, data: {} }),
    true
  );
});

test('restoreBackup writes only backup keys and reports the count', () => {
  const storage = fakeStorage({ 'settings-store': 'keep-me' });
  const backup: BackupFile = {
    app: 'baku-yomi',
    version: 1,
    exportedAt: '2026-11-11T00:00:00.000Z',
    data: {
      'book-store': { state: { books: [] }, version: 1 },
      'practice-store': { state: {}, version: 1 },
    },
  };

  const written = restoreBackup(storage, backup);

  assert.equal(written, 2);
  assert.equal(
    storage.values.get('book-store'),
    JSON.stringify({ state: { books: [] }, version: 1 })
  );
  assert.equal(storage.values.get('settings-store'), 'keep-me');
});

test('formatStorageSize and backupFilename are stable', () => {
  assert.equal(formatStorageSize(512), '512 B');
  assert.equal(formatStorageSize(2048), '2.0 KB');
  assert.equal(formatStorageSize(3 * 1024 * 1024), '3.00 MB');
  assert.equal(
    backupFilename(new Date('2026-11-11T12:00:00Z')),
    'baku-yomi-backup-2026-11-11.json'
  );
});
