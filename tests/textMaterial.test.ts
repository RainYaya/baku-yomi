import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextBook,
  buildTextChapters,
  paragraphsFromText,
  splitTextChapters,
} from '../src/lib/import/textMaterial';

test('splits markdown headings into chapters', () => {
  const chapters = splitTextChapters('# 一\n甲。\n\n## 二\n乙。');
  assert.deepEqual(chapters, [
    { title: '一', text: '甲。' },
    { title: '二', text: '乙。' },
  ]);
});

test('keeps a heading-less paste as one chapter', () => {
  const chapters = splitTextChapters('第一段。\n\n第二段。', '随笔');
  assert.deepEqual(chapters, [{ title: '随笔', text: '第一段。\n\n第二段。' }]);
});

test('drops an empty leading chapter before the first heading', () => {
  const chapters = splitTextChapters('  \n\n# 正文\n甲。');
  assert.deepEqual(chapters, [{ title: '正文', text: '甲。' }]);
});

test('treats blank lines as paragraph boundaries', () => {
  assert.deepEqual(paragraphsFromText('甲。\n\n乙。\n   \n丙。'), ['甲。', '乙。', '丙。']);
});

test('treats each line as a paragraph when there are no blank lines', () => {
  assert.deepEqual(paragraphsFromText('甲。\n乙。\n\n'), ['甲。', '乙。']);
});

test('joins a wrapped paragraph without blank lines into one block', () => {
  assert.deepEqual(paragraphsFromText('甲。\n乙。\n\n丙。'), ['甲。 乙。', '丙。']);
});

test('buildTextBook scopes pair ids to the new book and marks text source', () => {
  const book = buildTextBook({
    title: '测试',
    text: '# 一章\n日文一。\n中文一。\n\n# 二章\n日文二。',
  });

  assert.equal(book.source?.kind, 'text');
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].index, 0);
  assert.equal(book.chapters[1].index, 1);
  assert.match(book.id, /^book-/);

  for (const chapter of book.chapters) {
    for (const pair of chapter.pairs) {
      assert.equal(pair.id, `${book.id}-ch${chapter.index}-p${pair.pairIndex}`);
      assert.equal(pair.chapterIndex, chapter.index);
    }
  }
});

test('buildTextBook pairs adjacent Japanese and Chinese lines', () => {
  const book = buildTextBook({
    title: '双语',
    text: '# 一章\n日本語の文。\n中文翻译。\n次の文。',
  });
  const pairs = book.chapters[0].pairs;
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].japanese, '日本語の文。');
  assert.equal(pairs[0].chinese, '中文翻译。');
  assert.equal(pairs[0].translationSource, 'imported');
  assert.equal(pairs[1].japanese, '次の文。');
  assert.equal(pairs[1].chinese, '');
});

test('buildTextBook rejects empty input', () => {
  assert.throws(() => buildTextBook({ title: '空', text: '   \n\n  ' }), /没有可导入的正文/);
});

test('buildTextBook falls back to a chapter title', () => {
  const book = buildTextBook({ title: '', text: '本文だけ。' });
  assert.equal(book.title, '正文');
  assert.equal(book.chapters[0].title, '正文');
});

test('buildTextChapters scopes appended article ids to the start sequence', () => {
  const { chapters, nextSeq } = buildTextChapters({
    bookId: 'collection-1',
    text: '追記の本文。',
    startSeq: 3,
    startIndex: 0,
    fallbackTitle: '新しい記事',
  });

  assert.equal(chapters.length, 1);
  assert.equal(nextSeq, 4);
  assert.equal(chapters[0].id, 'collection-1-ch3');
  assert.equal(chapters[0].index, 0);
  assert.equal(chapters[0].title, '新しい記事');
  assert.equal(chapters[0].pairs[0].id, 'collection-1-ch3-p0');
});

test('buildTextChapters keeps display index separate from the id sequence', () => {
  const { chapters } = buildTextChapters({
    bookId: 'collection-2',
    text: '# 一\n甲。\n\n# 二\n乙。',
    startSeq: 5,
    startIndex: 2,
  });

  assert.deepEqual(
    chapters.map((chapter) => [chapter.id, chapter.index]),
    [
      ['collection-2-ch5', 2],
      ['collection-2-ch6', 3],
    ]
  );
  assert.ok(chapters.every((chapter) => chapter.pairs[0].chapterIndex === chapter.index));
});

test('buildTextChapters returns no chapters for blank text', () => {
  const { chapters, nextSeq } = buildTextChapters({
    bookId: 'collection-3',
    text: '  \n\n ',
    startSeq: 1,
  });
  assert.equal(chapters.length, 0);
  assert.equal(nextSeq, 1);
});
