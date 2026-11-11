export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
export const STORAGE_WARN_BYTES = 3.5 * 1024 * 1024;

/** Durable user data that belongs in a backup. Settings are excluded so a
 * shared backup never leaks API keys. */
export const BACKUP_KEYS = [
  'book-store',
  'practice-store',
  'baku-yomi-bookmarks',
] as const;

/** Keys counted toward the localStorage pressure indicator. */
export const STORAGE_KEYS = [...BACKUP_KEYS, 'settings-store'] as const;

export const STORAGE_ERROR_EVENT = 'baku-yomi:storage-error';

export type BackupKey = (typeof BACKUP_KEYS)[number];

export interface StorageUsage {
  bytes: number;
  limit: number;
  ratio: number;
  perKey: Record<string, number>;
}

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage {
  setItem(key: string, value: string): void;
}

function byteLength(value: string): number {
  if (typeof Blob !== 'undefined') return new Blob([value]).size;
  return value.length * 2;
}

export function measureStorage(
  storage: ReadableStorage,
  keys: readonly string[] = STORAGE_KEYS
): StorageUsage {
  const perKey: Record<string, number> = {};
  let bytes = 0;

  for (const key of keys) {
    const value = storage.getItem(key);
    if (value == null) continue;
    const size = byteLength(value);
    perKey[key] = size;
    bytes += size;
  }

  return {
    bytes,
    limit: STORAGE_LIMIT_BYTES,
    ratio: bytes / STORAGE_LIMIT_BYTES,
    perKey,
  };
}

export function isStorageNearLimit(usage: StorageUsage): boolean {
  return usage.bytes >= STORAGE_WARN_BYTES;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface BackupFile {
  app: 'baku-yomi';
  version: 1;
  exportedAt: string;
  data: Partial<Record<BackupKey, unknown>>;
}

export function createBackup(
  storage: ReadableStorage,
  now: Date = new Date()
): BackupFile {
  const data: Partial<Record<BackupKey, unknown>> = {};

  for (const key of BACKUP_KEYS) {
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }

  return {
    app: 'baku-yomi',
    version: 1,
    exportedAt: now.toISOString(),
    data,
  };
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Record<string, unknown>;
  return (
    backup.app === 'baku-yomi' &&
    backup.version === 1 &&
    typeof backup.data === 'object' &&
    backup.data !== null
  );
}

/** Restore backup keys. Returns how many keys were written. */
export function restoreBackup(
  storage: WritableStorage,
  backup: BackupFile
): number {
  let written = 0;
  for (const key of BACKUP_KEYS) {
    if (!(key in backup.data)) continue;
    storage.setItem(key, JSON.stringify(backup.data[key]));
    written += 1;
  }
  return written;
}

export function backupFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `baku-yomi-backup-${stamp}.json`;
}
