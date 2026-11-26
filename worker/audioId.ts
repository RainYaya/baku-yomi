const INVALID = /[^a-z0-9]+/g;
const TRIM_HYPHENS = /^-+|-+$/g;

/**
 * Asset id for a generated audiobook. The server only accepts
 * `^[a-z0-9][a-z0-9-]*$`, so everything else collapses to a hyphen and the
 * `tts-` prefix guarantees a valid first character.
 */
export function toAudioId(bookId: string): string {
  const sanitized = bookId
    .toLowerCase()
    .replace(INVALID, '-')
    .replace(TRIM_HYPHENS, '');
  return `tts-${sanitized || 'book'}`;
}
