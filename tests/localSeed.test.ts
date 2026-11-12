import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLocalSeedLibrary } from '../src/lib/seed/localSeed';

const MANIFEST = {
  books: [
    {
      id: 'local-tenseijingo',
      title: '天声人语',
      author: '合集',
      kind: 'collection',
      file: '/default-library.md',
    },
  ],
};

const MARKDOWN = [
  '# 第一篇',
  '日文の一。',
  '中文一。',
  '',
  '# 第二篇',
  '日文の二。',
  '中文二。',
].join('\n');

function mockFetch(handler: (url: string) => Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    handler(String(input))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('loads a collection from the local seed manifest', async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith('/default-library.json')) {
      return new Response(JSON.stringify(MANIFEST), { status: 200 });
    }
    if (url.endsWith('/default-library.md')) {
      return new Response(MARKDOWN, { status: 200 });
    }
    return new Response('', { status: 404 });
  });

  try {
    const books = await fetchLocalSeedLibrary();
    assert.equal(books.length, 1);
    const book = books[0];
    assert.equal(book.id, 'local-tenseijingo');
    assert.equal(book.title, '天声人语');
    assert.equal(book.source?.kind, 'collection');
    assert.equal(book.chapters.length, 2);
    assert.equal(book.chapterSeq, 2);
    assert.equal(book.chapters[0].pairs.length, 1);
    assert.equal(book.chapters[0].pairs[0].japanese, '日文の一。');
    assert.equal(book.chapters[0].pairs[0].chinese, '中文一。');
    assert.equal(book.chapters[1].pairs[0].id, 'local-tenseijingo-ch1-p0');
  } finally {
    restore();
  }
});

test('returns no books when the manifest is absent', async () => {
  const restore = mockFetch(() => new Response('', { status: 404 }));
  try {
    assert.deepEqual(await fetchLocalSeedLibrary(), []);
  } finally {
    restore();
  }
});

test('skips an entry whose file is missing', async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith('/default-library.json')) {
      return new Response(JSON.stringify(MANIFEST), { status: 200 });
    }
    return new Response('', { status: 404 });
  });

  try {
    assert.deepEqual(await fetchLocalSeedLibrary(), []);
  } finally {
    restore();
  }
});
