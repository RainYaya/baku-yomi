import assert from 'node:assert/strict';
import test from 'node:test';
import { fileMetadataMatches } from '../src/lib/video/localVideo';

const expected = {
  fileName: 'walk.mp4',
  fileSize: 1024,
  fileLastModified: 1_700_000_000_000,
};

test('fileMetadataMatches accepts the same name, size and timestamp', () => {
  assert.equal(
    fileMetadataMatches(expected, {
      name: 'walk.mp4',
      size: 1024,
      lastModified: 1_700_000_000_000,
    }),
    true
  );
});

test('fileMetadataMatches rejects a different name', () => {
  assert.equal(
    fileMetadataMatches(expected, {
      name: 'other.mp4',
      size: 1024,
      lastModified: 1_700_000_000_000,
    }),
    false
  );
});

test('fileMetadataMatches rejects a different size', () => {
  assert.equal(
    fileMetadataMatches(expected, {
      name: 'walk.mp4',
      size: 2048,
      lastModified: 1_700_000_000_000,
    }),
    false
  );
});

test('fileMetadataMatches rejects a different timestamp', () => {
  assert.equal(
    fileMetadataMatches(expected, {
      name: 'walk.mp4',
      size: 1024,
      lastModified: 1_700_000_001_000,
    }),
    false
  );
});

test('fileMetadataMatches refuses to guess when metadata is missing', () => {
  assert.equal(
    fileMetadataMatches(
      { fileName: 'walk.mp4' },
      { name: 'walk.mp4', size: 1024, lastModified: 1 }
    ),
    false
  );
  assert.equal(fileMetadataMatches(expected, null), false);
});
