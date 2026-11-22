const DB_NAME = 'baku-yomi-media';
const DB_VERSION = 1;
const STORE = 'handles';

export interface VideoFileHandle {
  getFile(): Promise<File>;
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: {
    mode?: 'read' | 'readwrite';
  }): Promise<PermissionState>;
}

interface ShowOpenFilePicker {
  (options: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }): Promise<VideoFileHandle[]>;
}

export interface PickedVideo {
  file: File;
  handle: VideoFileHandle;
}

export function supportsFileHandles(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    'showOpenFilePicker' in window
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideoHandle(
  bookId: string,
  handle: VideoFileHandle
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(handle, bookId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function getVideoHandle(
  bookId: string
): Promise<VideoFileHandle | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;

  const database = await openDatabase();
  try {
    return await new Promise<VideoFileHandle | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(bookId);
      request.onsuccess = () =>
        resolve((request.result as VideoFileHandle | undefined) ?? undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function deleteVideoHandle(bookId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).delete(bookId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  } catch {
    // A missing handle must never block deleting the book.
  }
}

/** Ask for read access to an existing handle. Must run from a user gesture. */
export async function requestHandlePermission(
  handle: VideoFileHandle
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;

  const descriptor = { mode: 'read' as const };
  try {
    if ((await handle.queryPermission(descriptor)) === 'granted') return true;
    return (await handle.requestPermission(descriptor)) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Pick a local video through the File System Access API. Returns null when the
 * browser has no support (caller falls back to `<input type="file">`) or the
 * user cancels.
 */
export async function pickVideoFile(): Promise<PickedVideo | null> {
  if (typeof window === 'undefined') return null;
  const picker = (
    window as unknown as { showOpenFilePicker?: ShowOpenFilePicker }
  ).showOpenFilePicker;
  if (!picker) return null;

  try {
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: '视频',
          accept: {
            'video/mp4': ['.mp4'],
            'video/webm': ['.webm'],
            'video/quicktime': ['.mov'],
          },
        },
      ],
    });
    if (!handle) return null;
    return { file: await handle.getFile(), handle };
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') return null;
    throw error;
  }
}
