import type { VideoSource } from '../../types';

export interface ActualFileMetadata {
  name: string;
  size: number;
  lastModified: number;
}

export type ExpectedFileMetadata = Pick<
  VideoSource,
  'fileName' | 'fileSize' | 'fileLastModified'
>;

/**
 * A relinked file is the same material only when name, size and modification
 * time all agree. Missing stored metadata means we cannot tell, so the caller
 * treats it as a mismatch and asks rather than silently accepting another file.
 */
export function fileMetadataMatches(
  expected: ExpectedFileMetadata,
  actual: ActualFileMetadata | null | undefined
): boolean {
  if (!actual) return false;
  if (
    !expected.fileName ||
    expected.fileSize === undefined ||
    expected.fileLastModified === undefined
  ) {
    return false;
  }

  return (
    expected.fileName === actual.name &&
    expected.fileSize === actual.size &&
    expected.fileLastModified === actual.lastModified
  );
}
