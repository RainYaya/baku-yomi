import { useMemo, useState } from 'react';
import { FiSearch, FiSettings, FiStar, FiTrash2 } from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import { useSavedSentenceStore } from '../../stores/savedSentenceSlice';
import { useUIStore } from '../../stores/uiSlice';
import { ThemeToggle } from '../../theme/ThemeToggle';

/**
 * Every sentence the reader starred, across all materials.
 *
 * The entry carries a snapshot of the text, so it stays readable after the
 * book that produced it is deleted; only the jump back needs the book.
 */
export function SavedSentencesPage() {
  const sentences = useSavedSentenceStore((s) => s.sentences);
  const remove = useSavedSentenceStore((s) => s.remove);
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setScrollToPairId = useBookStore((s) => s.setScrollToPairId);
  const setPracticePairId = useBookStore((s) => s.setPracticePairId);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openSettings = useUIStore((s) => s.openSettings);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sentences;
    return sentences.filter((sentence) =>
      [sentence.japanese, sentence.chinese, sentence.bookTitle, sentence.chapterTitle]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [sentences, query]);

  const openSentence = (bookId: string, chapterIndex: number, pairId: string) => {
    setCurrentBook(bookId);
    setCurrentChapter(chapterIndex);
    setScrollToPairId(pairId);
    setCurrentView('reader');
  };

  const practiceSentence = (bookId: string, chapterIndex: number, pairId: string) => {
    openSentence(bookId, chapterIndex, pairId);
    setPracticePairId(pairId);
  };

  return (
    <section className="shelf-app saved-app">
      <header className="shelf-topbar">
        <button
          className="shelf-brand shelf-brand-btn"
          onClick={() => setCurrentView('home')}
          title="回到桌面"
        >
          baku-yomi
        </button>
        <span className="shelf-divider" aria-hidden="true" />
        <span className="shelf-crumb">收藏句 · Saved</span>

        <div className="shelf-top-right">
          <label className="shelf-search">
            <FiSearch size={13} aria-hidden="true" />
            <input
              placeholder="搜索句子或材料"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索收藏句"
            />
          </label>
          <button className="shelf-btn" onClick={() => setCurrentView('review')}>
            <FiStar size={13} /> 练习记录
          </button>
          <button
            className="shelf-icon-btn"
            onClick={openSettings}
            title="打开设置"
            aria-label="打开设置"
          >
            <FiSettings size={15} />
          </button>
          <ThemeToggle className="shelf-icon-btn" />
        </div>
      </header>

      <main className="review-main">
        <div className="review-head">
          <div>
            <span className="home-kicker">Saved Sentences</span>
            <h1>收藏句</h1>
            <p>
              {sentences.length > 0
                ? `已收藏 ${sentences.length} 句。点开头或结尾的句子，随时跳回去练。`
                : '在阅读页点句子旁的「收藏」，想练的句子就会留在这里。'}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="saved-empty">
            {sentences.length === 0
              ? '还没有收藏的句子。'
              : '没有匹配的句子。'}
          </p>
        ) : (
          <ul className="saved-list">
            {filtered.map((sentence) => {
              const book = books.find((entry) => entry.id === sentence.bookId);
              return (
                <li key={sentence.id} className="saved-item">
                  <div className="saved-text">
                    <p className="saved-ja">{sentence.japanese}</p>
                    {sentence.chinese.trim() && (
                      <p className="saved-zh">{sentence.chinese}</p>
                    )}
                    <p className="saved-meta">
                      {sentence.bookTitle}
                      {sentence.chapterTitle && sentence.chapterTitle !== sentence.bookTitle
                        ? ` · ${sentence.chapterTitle}`
                        : ''}{' '}
                      · {new Date(sentence.createdAt).toLocaleDateString('zh-CN')}
                      {!book && ' · 原书已删除'}
                    </p>
                  </div>
                  <div className="saved-actions">
                    <button
                      className="shelf-btn"
                      disabled={!book}
                      onClick={() =>
                        openSentence(sentence.bookId, sentence.chapterIndex, sentence.pairId)
                      }
                    >
                      回到原句
                    </button>
                    <button
                      className="shelf-btn primary"
                      disabled={!book}
                      onClick={() =>
                        practiceSentence(
                          sentence.bookId,
                          sentence.chapterIndex,
                          sentence.pairId
                        )
                      }
                    >
                      练这句
                    </button>
                    <button
                      className="shelf-icon-btn"
                      onClick={() => remove(sentence.id)}
                      aria-label="取消收藏"
                      title="取消收藏"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </section>
  );
}
