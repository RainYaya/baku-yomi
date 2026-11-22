/**
 * The local video file chosen during this browser session. The file itself is
 * never copied into storage; Task 6 persists a FileSystemFileHandle instead,
 * and this map keeps playback working until the page is reloaded.
 */
const sessionFiles = new Map<string, File>();

export function setSessionVideoFile(bookId: string, file: File): void {
  sessionFiles.set(bookId, file);
}

export function getSessionVideoFile(bookId: string): File | undefined {
  return sessionFiles.get(bookId);
}

export function deleteSessionVideoFile(bookId: string): void {
  sessionFiles.delete(bookId);
}
