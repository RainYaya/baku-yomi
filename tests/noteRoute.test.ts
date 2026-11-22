import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_NOTE_SOURCES,
  noteStatusError,
  validateNoteArticleUrl,
  validateNoteFeedSources,
} from '../server/routes/note';

test('validateNoteArticleUrl accepts canonical note article URLs', () => {
  const url = validateNoteArticleUrl(
    'https://note.com/seoyun/n/n1234abcd?from=feed#comments'
  );

  assert.equal(url.hostname, 'note.com');
  assert.equal(url.pathname, '/seoyun/n/n1234abcd');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
});

test('validateNoteArticleUrl accepts the www host and normalizes it', () => {
  const url = validateNoteArticleUrl('https://www.note.com/seoyun/n/n1234abcd');
  assert.equal(url.hostname, 'note.com');
});

test('validateNoteArticleUrl rejects other hosts and lookalikes', () => {
  assert.throws(() => validateNoteArticleUrl('https://example.com/seoyun/n/n1'));
  assert.throws(() =>
    validateNoteArticleUrl('https://note.com.evil.example/seoyun/n/n1')
  );
});

test('validateNoteArticleUrl rejects non-article paths', () => {
  assert.throws(() => validateNoteArticleUrl('https://note.com/seoyun'));
  assert.throws(() => validateNoteArticleUrl('https://note.com/seoyun/n/'));
  assert.throws(() => validateNoteArticleUrl('https://note.com/n/n1234'));
  assert.throws(() => validateNoteArticleUrl('https://note.com/hashtag/エッセイ'));
});

test('validateNoteArticleUrl rejects unsafe URLs', () => {
  assert.throws(() => validateNoteArticleUrl('http://note.com/seoyun/n/n1'));
  assert.throws(() =>
    validateNoteArticleUrl('https://user:pass@note.com/seoyun/n/n1')
  );
  assert.throws(() =>
    validateNoteArticleUrl('https://note.com:8443/seoyun/n/n1')
  );
  assert.throws(() => validateNoteArticleUrl('not a url'));
});

test('validateNoteFeedSources accepts, normalizes and dedupes sources', () => {
  const sources = validateNoteFeedSources([
    { kind: 'hashtag', key: ' エッセイ ' },
    { kind: 'author', key: 'seoyun' },
    { kind: 'hashtag', key: 'エッセイ' },
  ]);

  assert.deepEqual(sources, [
    { kind: 'hashtag', key: 'エッセイ' },
    { kind: 'author', key: 'seoyun' },
  ]);
  assert.equal(MAX_NOTE_SOURCES, 8);
});

test('validateNoteFeedSources caps the enabled source count', () => {
  const tooMany = Array.from({ length: MAX_NOTE_SOURCES + 1 }, (_, index) => ({
    kind: 'hashtag',
    key: `tag${index}`,
  }));

  assert.throws(() => validateNoteFeedSources(tooMany), /最多/);
});

test('validateNoteFeedSources rejects malformed sources', () => {
  assert.throws(() => validateNoteFeedSources('nope'));
  assert.throws(() =>
    validateNoteFeedSources([{ kind: 'topic', key: 'エッセイ' }])
  );
  assert.throws(() => validateNoteFeedSources([{ kind: 'author', key: '' }]));
  assert.throws(() =>
    validateNoteFeedSources([{ kind: 'author', key: 'https://note.com/x' }])
  );
  assert.throws(() =>
    validateNoteFeedSources([{ kind: 'hashtag', key: 'a/b' }])
  );
});

test('noteStatusError tells the reader when an article needs login or permission', () => {
  for (const status of [401, 403]) {
    const error = noteStatusError(status);
    assert.equal(error.status, 403);
    assert.match(error.message, /登录|权限/);
    assert.match(error.message, /note/);
  }

  const missing = noteStatusError(404);
  assert.equal(missing.status, 404);
  assert.match(missing.message, /不存在/);

  const upstream = noteStatusError(500);
  assert.equal(upstream.status, 502);
  assert.match(upstream.message, /500/);
});
