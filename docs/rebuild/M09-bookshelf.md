# M9 · 书架与多书管理

> 目标：把「导入 EPUB 之后」的入口升级成真正的图书馆——多本书共存、书架总览、侧栏导航、当前书高亮、一眼看清进度。
> 关联课程：L09（组件分层实践：布局层与列表渲染）。
> 前置：完成 M8。M0 的 MainLayout 还是纯壳（TopBar/Sidebar 未建）；M3 的 bookSlice 已提供 `books`/`currentBookId`/`currentChapterIndex`/`readingProgress`/`lastReadAt`/`lastChapterIndexByBook` 与 `getLastChapterIndexForBook`/`renameBook`/`removeBook` 等全部 API；M3 的 uiSlice 只有骨架；App.tsx 目前无条件渲染 ReadingView。

## 构筑总览（本里程碑结束时的项目结构）

```
src/
├── stores/
│   └── uiSlice.ts                  # 补全 currentView（'bookshelf' | 'reader'）+ sidebarOpen
├── App.tsx                         # 按 currentView 条件渲染 BookshelfPage / ReadingView（改）
└── components/
    ├── layout/
    │   ├── MainLayout.tsx          # 接入 TopBar + Sidebar + app-workspace 布局（改）
    │   ├── Sidebar.tsx             # 导入入口 + 书架总览导航 + 书列表 + 章节列表（新建）
    │   └── TopBar.tsx              # 品牌区 + 上下文标签 + 进度 + 字号控制（新建）
    └── bookshelf/
        ├── BookshelfPage.tsx       # 搜索 + 排序 + 网格 + 双分支空态（新建）
        └── BookCard.tsx            # 封面 + 进度条 + 统计 + 重命名/删除（新建）
```

> 最终差异说明：真实仓库里书架页是**后期才补的**（初版只有侧栏书列表，commit bfd12f4 才加 BookshelfPage）——「先能用、后好看」的顺序也体现在本卡：侧栏是导航主干（Step 2），书架页是总览视图（Step 4-5）。uiSlice 的 `settingsOpen` 在 M4/M5 已被 SettingsModal 消费，本卡只新增/激活 `currentView` 与 `sidebarOpen`。

## Step 1 · uiSlice：currentView 视图切换

**做什么：** 补全 `src/stores/uiSlice.ts`。这是 M9 的架构支点：**「现在在哪个视图」是一个全局状态**——App（渲染分支）、MainLayout（布局类名）、TopBar（上下文标签）、Sidebar（导航高亮）四处都要读它。M3 建了骨架，本步补全为最终形态（21 行）。

```ts
import { create } from 'zustand';

export type AppView = 'bookshelf' | 'reader';

interface UIState {
  settingsOpen: boolean;
  sidebarOpen: boolean;
  currentView: AppView;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: AppView) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  settingsOpen: false,
  sidebarOpen: true,
  currentView: 'bookshelf',

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCurrentView: (view) => set({ currentView: view }),
}));
```

**逐行讲解：**
- `AppView` 只有两个值：`'bookshelf'`（书架总览）与 `'reader'`（阅读器）——联合类型让非法值在编译期就报错。
- **ui store 不持久化**（没有 persist）：视图是会话状态，刷新回书架是合理的默认（M3 定下的原则：会话开关刷新即复位）。
- `settingsOpen` 是 M4/M5 的 SettingsModal 在用，本卡不动；`sidebarOpen` 默认 `true`——阅读器打开时侧栏默认可见，TopBar 的菜单按钮切换它。
- 视图切换本身**不搬任何数据**：书、进度、选中句都在各自的 store 里，切视图只是换渲染分支——这就是「从阅读器切回书架不丢状态」的架构保证。

**验证：** `npx tsc -b` 通过；浏览器 console 执行 `useUIStore.getState().setCurrentView('reader')` 观察 `currentView` 变化（渲染接线在 Step 6 生效）。

## Step 2 · Sidebar：书籍列表、当前书高亮、导入按钮

**做什么：** **新建** `src/components/layout/Sidebar.tsx`。三段式：顶部导入入口（隐藏 file input + 按钮转发）、书架总览导航、BOOKS 书列表（当前书高亮 + 行内删除）；页脚是当前书的章节列表（带进度徽标）。**容器组件：0 props，全部数据经 store 自取。**

```tsx
import { useRef } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { FiBookOpen, FiTrash2, FiPlus, FiChevronRight, FiGrid } from 'react-icons/fi';
import { useEpubParser } from '../../hooks/useEpubParser';

export function Sidebar() {
  const books = useBookStore((s) => s.books);
  const currentBookId = useBookStore((s) => s.currentBookId);
  const currentChapterIndex = useBookStore((s) => s.currentChapterIndex);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const removeBook = useBookStore((s) => s.removeBook);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const { parseFile, parsing } = useEpubParser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentBook = books.find((b) => b.id === currentBookId) ?? null;

  const openReader = (bookId: string, chapterIndex?: number) => {
    setCurrentBook(bookId);
    const target = chapterIndex ?? getLastChapterIndexForBook(bookId);
    setCurrentChapter(target);
    setCurrentView('reader');
  };

  if (!sidebarOpen) return null;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.name.endsWith('.epub')) parseFile(file);
    e.target.value = '';
  };

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-inner">
        <div className="app-sidebar-section">
          <div className="app-sidebar-heading-row">
            <h2 className="app-sidebar-heading">LIBRARY</h2>
            <input ref={fileInputRef} type="file" accept=".epub" onChange={handleImport} className="hidden" />
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="app-mini-action"
            title="导入书籍"
          >
            {parsing ? (
              <div className="app-spinner" />
            ) : (
              <>
                <FiPlus size={14} />
                IMPORT
              </>
            )}
          </button>
        </div>

        <div className="app-sidebar-section">
          <button
            className={`app-sidebar-link ${currentView === 'bookshelf' ? 'active' : ''}`}
            onClick={() => setCurrentView('bookshelf')}
          >
            <FiGrid size={14} />
            <span>书架总览</span>
          </button>
        </div>

        <div className="app-sidebar-section">
          <div className="app-sidebar-label">BOOKS</div>
          {books.length === 0 ? (
            <p className="app-sidebar-empty">点击 + 导入书籍</p>
          ) : (
            <ul className="app-sidebar-list">
              {books.map((book) => (
                <li key={book.id} className="group flex items-center">
                  <button
                    onClick={() => openReader(book.id)}
                    className={`app-sidebar-link ${currentBookId === book.id ? 'active' : ''}`}
                  >
                    <FiBookOpen size={16} className="flex-shrink-0" />
                    <span className="truncate flex-1 text-sm">{book.title}</span>
                  </button>
                  <button
                    onClick={() => removeBook(book.id)}
                    className="app-inline-danger"
                    title="删除"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {currentBook && currentBook.chapters.length > 0 && (
        <div className="app-sidebar-section app-sidebar-footer">
          <div className="app-sidebar-label">CHAPTERS</div>
          <ul className="app-sidebar-list">
            {currentBook.chapters.map((chapter, idx) => {
              const progress = readingProgress[chapter.id] ?? 0;
              const pct =
                chapter.pairs.length > 0
                  ? Math.round((progress / chapter.pairs.length) * 100)
                  : 0;
              const isActive = currentChapterIndex === idx;

              return (
                <li key={chapter.id}>
                  <button
                    onClick={() => openReader(currentBook.id, idx)}
                    className={`app-sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <FiChevronRight size={14} className="flex-shrink-0" />
                    <span className="truncate flex-1 text-sm">{chapter.title}</span>
                    {pct > 0 && (
                      <span className="app-sidebar-progress">{pct}%</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
```

**逐行讲解：**
- **`openReader` 是跨 store 编排的缩影**：三次 set 分属两个 store（bookSlice 两下 + uiSlice 一下），顺序保证阅读视图打开时书和章已就位。可选参数实现两种语义：点书 = 续读上次章（`getLastChapterIndexForBook` 兜底），点具体章 = 定向跳转。**点书与点章收敛到同一个函数**——「打开书」只有一个入口。
- **当前书高亮是派生 UI**：`currentBookId === book.id` 比较出 `active` class，没有任何命令式 `setActive`。数据在 store、影子在 DOM——这就是「派生值不存库」的展示。
- **双按钮结构**：主按钮占满整行（点击区域最大化），删除按钮独立在外——button 嵌 button 是非法 HTML，所以必须是兄弟。
- **隐藏 file input 模式**：`accept=".epub"` 限定类型，`fileInputRef.current?.click()` 由按钮转发点击；`handleImport` 里 `e.target.value = ''` 复位，否则同名文件无法重复选择。解析中 `disabled={parsing}` + spinner 防重复触发。
- **章节列表是页脚区**：只有当前书存在且有章节时才渲染（无书时侧栏不出现空的章节区）。章的身份用**下标**比较（`currentChapterIndex === idx`）——章在书内有序且不重排，下标是合法身份；书用 `book.id`（L09 的 key 之争在激活态上的同构问题）。
- 每章进度 `readingProgress[chapter.id] ?? 0` 与 `pairs.length` 相除取整，`pct > 0` 才显示徽标——**派生值就地现算，不存库**。

**验证（Step 6 接线后）：** 导入第二本书 → 侧栏出现两本书；点 B 书 → B 高亮、进入 B 的续读章；侧栏点具体章 → 定向跳转且该章高亮；删除按钮 → 确认后书消失。

## Step 3 · TopBar：品牌区、上下文标签、进度、字号控制

**做什么：** **新建** `src/components/layout/TopBar.tsx`。零 props 容器：品牌区 + 侧栏开关、上下文标签（随 `currentView` 变化）、主题指示器占位、阅读进度百分比、设置入口、字号控制。

```tsx
import { useSettingsStore } from '../../stores/settingsSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useBookStore } from '../../stores/bookSlice';
import { FiMenu, FiSettings } from 'react-icons/fi';
import { ThemeIndicator } from '../../theme/ThemeIndicator';

export function TopBar() {
  const { changeFontZoom } = useSettingsStore();
  const { toggleSidebar, openSettings, currentView } = useUIStore();
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);

  const progressPct =
    currentChapter && currentChapter.pairs.length > 0
      ? Math.round((getReadingProgress(currentChapter.id) / currentChapter.pairs.length) * 100)
      : 0;

  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-brand">
          <button onClick={toggleSidebar} className="app-icon-btn" title="切换侧栏">
            <FiMenu size={16} />
          </button>
          <div>
            <div className="app-logo">BAKU-YOMI</div>
            <div className="app-context">
              {currentView === 'bookshelf'
                ? `LIBRARY / ${currentBook ? currentBook.title : 'EMPTY'}`
                : `READER / ${currentChapter?.title || 'DOUBLE BACKTRANSLATION'}`}
            </div>
          </div>
        </div>

        <div className="app-header-tools">
          <div className="app-shortcuts">THEME N / M / D / S / R / W</div>
          <ThemeIndicator />
          {currentView === 'reader' && currentChapter && (
            <span className="app-progress-indicator">{progressPct}%</span>
          )}
          <button onClick={openSettings} className="app-icon-btn" title="打开设置">
            <FiSettings size={16} />
          </button>
        </div>
      </div>

      <div className="app-header-sub">
        <div className="app-sub-label">
          {currentView === 'bookshelf'
            ? 'quiet library surface'
            : currentBook?.title || 'active reading session'}
        </div>
        <div className="font-controls">
          <button onClick={() => changeFontZoom(-1)} className="font-control-btn">A-</button>
          <button onClick={() => changeFontZoom(1)} className="font-control-btn">A+</button>
        </div>
      </div>
    </header>
  );
}
```

**逐行讲解：**
- **上下文标签是视图的实时镜子**：`currentView === 'bookshelf'` 显示 `LIBRARY / 书名`，否则显示 `READER / 章节名`——同一份 `currentView` 数据在顶栏的第二次投影（第一次是 App 的渲染分支）。
- **进度公式是「原始数据 → 展示值」的最小派生**：`getReadingProgress(chapter.id) / pairs.length` 取整，只有 reader 视图才显示。
- `getCurrentBook()/getCurrentChapter()` 是**在 selector 内调用 store 方法**——返回的是数组里的既有对象，引用稳定所以安全。
- `ThemeIndicator` 是 M10 主题里程碑的组件——本卡先渲染占位（或先返回 null），M10 再填充；`THEME N / M / D / S / R / W` 快捷键提示同理。字号控制 `changeFontZoom` 是 M2 就有的设置。
- 零 props 是「应用级单例」容器组件的特权：TopBar 与 Sidebar 是兄弟节点，靠共同父级（store）协作，互相不引用、不传 props。

**验证（Step 6 接线后）：** 顶栏显示 LIBRARY/EMPTY；导入书后变 LIBRARY/书名；切到阅读器显示 READER/章节名 + 进度百分比；A-/A+ 改变正文字号；菜单按钮折叠/展开侧栏。

## Step 4 · BookshelfPage：网格、搜索、排序、空态

**做什么：** **新建** `src/components/bookshelf/BookshelfPage.tsx`。书架总览视图：工具栏（搜索 + 排序 + 导入）+ 书籍网格 + 双分支空态。

```tsx
import { useMemo, useState } from 'react';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { useEpubParser } from '../../hooks/useEpubParser';
import { BookCard } from './BookCard';

type SortBy = 'lastImported' | 'title' | 'progress';

export function BookshelfPage() {
  const books = useBookStore((s) => s.books);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const getLastChapterIndexForBook = useBookStore((s) => s.getLastChapterIndexForBook);
  const readingProgress = useBookStore((s) => s.readingProgress);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const { parseFile, parsing } = useEpubParser();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('lastImported');

  const filteredBooks = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    const list = books.filter((b) => {
      if (!lowerQuery) return true;
      return (
        b.title.toLowerCase().includes(lowerQuery) ||
        (b.author ?? '').toLowerCase().includes(lowerQuery)
      );
    });

    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'));
    }

    if (sortBy === 'progress') {
      const progressOf = (bookId: string) => {
        const book = list.find((b) => b.id === bookId);
        if (!book) return 0;
        const total = book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0);
        if (!total) return 0;
        const done = book.chapters.reduce((sum, ch) => sum + (readingProgress[ch.id] ?? 0), 0);
        return done / total;
      };
      return [...list].sort((a, b) => progressOf(b.id) - progressOf(a.id));
    }

    return [...list].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0));
  }, [books, query, sortBy, readingProgress]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.name.endsWith('.epub')) {
      void parseFile(file);
    }
    e.target.value = '';
  };

  const openBook = (bookId: string) => {
    setCurrentBook(bookId);
    setCurrentChapter(getLastChapterIndexForBook(bookId));
    setCurrentView('reader');
  };

  return (
    <section className="bookshelf-page">
      <header className="bookshelf-toolbar">
        <div className="bookshelf-toolbar-left">
          <div className="bookshelf-kicker">LIBRARY</div>
          <div>
            <h2 className="bookshelf-heading">书架</h2>
            <span className="bookshelf-count">共 {books.length} 本</span>
          </div>
        </div>

        <div className="bookshelf-toolbar-right">
          <input
            className="settings-input"
            style={{ minWidth: 220 }}
            placeholder="搜索书名 / 作者"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="settings-input"
            style={{ width: 150 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="lastImported">按导入时间</option>
            <option value="title">按书名</option>
            <option value="progress">按阅读进度</option>
          </select>

          <label className="btn btn-primary cursor-pointer">
            {parsing ? '导入中...' : '导入 EPUB'}
            <input type="file" accept=".epub" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {filteredBooks.length === 0 ? (
        <div className="bookshelf-empty">
          <p>{books.length === 0 ? '你的书架还是空的，先导入第一本 EPUB 吧。' : '没有匹配的书，换个关键词试试。'}</p>
          {books.length === 0 && (
            <label className="btn btn-primary cursor-pointer">
              {parsing ? '导入中...' : '导入 EPUB'}
              <input type="file" accept=".epub" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          )}
        </div>
      ) : (
        <div className="bookshelf-grid">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} onOpen={() => openBook(book.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
```

**逐行讲解：**
- **useMemo 派生链**：filter 先缩小集合（`trim().toLowerCase()` 后做大小写不敏感子串匹配，空白查询 = 全量），再按三种策略 sort；`[...list].sort` 先拷贝避免原地排序副作用；中文排序用 `localeCompare(…, 'zh-Hans')` 才是拼音序；依赖数组 `[books, query, sortBy, readingProgress]` 覆盖闭包内全部响应式数据（progress 策略用到 readingProgress，即使当前没选中也要列全）。
- **`openBook` 与侧栏 `openReader` 是同一语义**：`setCurrentBook` → `getLastChapterIndexForBook` 续读章 → `setCurrentChapter` → `setCurrentView('reader')`。差异只在侧栏可以显式指定章节。
- **空态双分支**：`books.length === 0` 是**真空态**（从未导入）→ 给出带导入按钮的行动引导；只有搜索/排序过滤为空是**伪空态** → 提示换关键词、绝不放导入按钮。区分「数据空」与「结果空」是空态设计的基本功。
- 导入用 `<label>` 包隐藏 file input——label 转发点击让按钮和文件选择解耦，是 file input 的惯用包装。

**验证（Step 6 接线后）：** 空书架显示引导 + 导入按钮；导入后网格出现书卡；搜索书名/作者过滤；三种排序切换正确（进度排序 = 已读占比从高到低）；搜索无结果显示「换个关键词」且无导入按钮。

## Step 5 · BookCard：封面 + 进度条 + 统计 + 重命名/删除

**做什么：** **新建** `src/components/bookshelf/BookCard.tsx`。近展示组件：`book` + `onOpen` 两个 props，直连 store 取进度与 action（刻意保留的例外）。封面双轨（真实封面 / 标题哈希渐变兜底）+ 封面进度条 + 统计行 + 内联重命名 + 删除确认。

```tsx
import { useMemo, useState } from 'react';
import type { Book } from '../../types';
import { useBookStore } from '../../stores/bookSlice';
import { FiBook, FiPlay, FiEdit2, FiTrash2, FiLayers, FiFileText } from 'react-icons/fi';

interface Props {
  book: Book;
  onOpen: () => void;
}

function calcProgressPct(book: Book, readingProgress: Record<string, number>): number {
  const totalPairs = book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0);
  if (totalPairs <= 0) return 0;

  const readPairs = book.chapters.reduce((sum, ch) => {
    const idx = readingProgress[ch.id] ?? 0;
    return sum + Math.min(Math.max(idx, 0), ch.pairs.length);
  }, 0);

  return Math.round((readPairs / totalPairs) * 100);
}

function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(145deg, hsl(${hue} 30% 25%), hsl(${(hue + 40) % 360} 35% 18%))`;
}

export function BookCard({ book, onOpen }: Props) {
  const readingProgress = useBookStore((s) => s.readingProgress);
  const removeBook = useBookStore((s) => s.removeBook);
  const renameBook = useBookStore((s) => s.renameBook);

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(book.title);

  const progressPct = useMemo(
    () => calcProgressPct(book, readingProgress),
    [book, readingProgress]
  );

  const totalPairs = useMemo(
    () => book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0),
    [book.chapters]
  );

  const handleDelete = () => {
    if (window.confirm(`确定删除《${book.title}》吗？`)) {
      removeBook(book.id);
    }
  };

  return (
    <article className="bookshelf-card">
      {/* Cover */}
      <div
        className="bookshelf-cover"
        style={{ background: book.coverUrl ? undefined : coverGradient(book.title) }}
        onClick={onOpen}
      >
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="bookshelf-cover-img" />
        ) : (
          <div className="bookshelf-cover-fallback">
            <FiBook size={28} style={{ opacity: 0.5 }} />
            <span className="bookshelf-cover-title">{book.title}</span>
          </div>
        )}
        {progressPct > 0 && (
          <div className="bookshelf-cover-progress">
            <div className="bookshelf-cover-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="bookshelf-card-body">
        {editing ? (
          <div className="space-y-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="settings-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  renameBook(book.id, titleDraft);
                  setEditing(false);
                } else if (e.key === 'Escape') {
                  setTitleDraft(book.title);
                  setEditing(false);
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="settings-mini-btn"
                onClick={() => { renameBook(book.id, titleDraft); setEditing(false); }}
              >
                保存
              </button>
              <button
                className="settings-mini-btn"
                onClick={() => { setTitleDraft(book.title); setEditing(false); }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="bookshelf-title" title={book.title}>{book.title}</h3>
            <p className="bookshelf-subtitle">{book.author || '未知作者'}</p>

            <div className="bookshelf-stats">
              <span className="bookshelf-stat">
                <FiLayers size={12} />
                {book.chapters.length} 章
              </span>
              <span className="bookshelf-stat">
                <FiFileText size={12} />
                {totalPairs} 句对
              </span>
              {progressPct > 0 && (
                <span className="bookshelf-stat bookshelf-stat-accent">
                  {progressPct}%
                </span>
              )}
            </div>
          </>
        )}

        {!editing && (
          <div className="bookshelf-actions">
            <button className="bookshelf-btn-primary" onClick={onOpen}>
              <FiPlay size={13} />
              {progressPct > 0 ? '继续阅读' : '开始阅读'}
            </button>
            <button
              className="bookshelf-btn-icon"
              onClick={() => setEditing(true)}
              title="重命名"
            >
              <FiEdit2 size={14} />
            </button>
            <button
              className="bookshelf-btn-icon bookshelf-btn-danger"
              onClick={handleDelete}
              title="删除"
            >
              <FiTrash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
```

**逐行讲解：**
- **`calcProgressPct` 是模块级纯函数**：全书各章已读数 `Math.min(Math.max(idx,0), pairs.length)` 截断求和（截断防越界脏数据）再算比例。`useMemo` 缓存是因为卡片会在搜索输入时频繁重渲。
- **封面兜底哈希**：`hash = (hash << 5) - hash + charCodeAt(i)`（即 `hash * 31 + c` 的位运算写法）逐字符累积，`hash |= 0` 强转 32 位整数防溢出成浮点，`Math.abs(hash) % 360` 取色相。两个性质：**确定性**（同一本书永远同色）与**均匀性**（书名微差 → 色相大幅散开，相邻书不易撞色）。`style={{ background: book.coverUrl ? undefined : coverGradient(title) }}`——React 对 undefined 样式直接跳过。
- **重命名是受控组件练习**：`titleDraft` 唯一本地状态；Enter 提交 `renameBook`（store 里 `title.trim() || b.title` 兜底空标题）、Esc 还原——四条路径（Enter/Esc/保存/取消）收敛到「要么提交、要么还原」。
- **删除带确认**：`window.confirm` 书名入文案；`removeBook` 是 M3 的 action，删除当前书时会清空 `currentBookId`，阅读器侧自然降级到无书界面。
- **统计行全部派生**：章数 = `chapters.length`、句对数 = 各章求和、进度 = 已读/总数——零冗余存储，同一份 `readingProgress` 在这里、侧栏、TopBar 三处投影。

**验证（Step 6 接线后）：** 卡片显示封面（无封面时渐变）+ 进度条 + 统计；读到 30% 后「继续阅读」按钮与 30% 徽标出现；重命名 Enter 保存 / Esc 取消 / 空标题回退；删除弹确认框、删后卡片消失、侧栏同步。

## Step 6 · App.tsx：按 currentView 切换视图

**做什么：** 改 `src/App.tsx`。M8 版本无条件渲染 `ReadingView`；本步改为按 `currentView` 切换。**这是 M9 的枢纽接线**——Step 2-5 的组件都靠这里活起来。

```tsx
import { MainLayout } from './components/layout/MainLayout';
import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { useUIStore } from './stores/uiSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);

  return (
    <MainLayout>
      {currentView === 'bookshelf' ? <BookshelfPage /> : <ReadingView />}
      <SettingsModal />
    </MainLayout>
  );
}
```

**讲解：** 视图切换是**渲染分支**而不是路由：`currentView === 'bookshelf' ? <BookshelfPage /> : <ReadingView />`。两个视图组件**不卸载数据**——书、进度、选中句都在 store 里，切走再切回状态原样（阅读器里 `selectedPairId` 等组件局部状态会丢，但 store 数据不丢——这是刻意取舍：重进阅读器按进度恢复）。`WelcomeGuide`（M12 的 onboarding）还没出现；`SettingsModal` 是 M4 就有的。

**验证：** 启动默认落在书架视图；点侧栏「书架总览」/点书名进阅读器，来回切换状态不丢。

## Step 7 · MainLayout：接入 TopBar 与 Sidebar

**做什么：** 改 `src/components/layout/MainLayout.tsx`。M0 的纯壳升级为三区骨架：TopBar +（Sidebar + main）。

```tsx
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../stores/uiSlice';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const currentView = useUIStore((s) => s.currentView);

  return (
    <div className="app-shell min-h-screen">
      <div className="app-frame">
        <TopBar />
        <div className={`app-workspace ${currentView === 'reader' ? 'app-workspace-reader' : ''}`}>
          <Sidebar />
          <main className={`app-main ${currentView === 'reader' ? 'app-main-reader' : ''}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
```

**逐行讲解：**
- **组合根不关心页面内容**：`children` 插槽由 App 决定灌入 BookshelfPage 还是 ReadingView——布局与页面彻底解耦。
- **兄弟协作靠 store**：TopBar 和 Sidebar 是兄弟节点，不互相引用、不传 props；「侧栏开合」「当前视图」在 uiSlice，各自订阅。
- **条件类名做视图级样式开关**：`currentView === 'reader' ? 'app-workspace-reader' : ''`——阅读模式收窄主区（CSS 在 M10 主题里程碑统一收口，类名已按最终命名）。
- 最终版还有 `style={{ color: 'var(--text)' }}` 把正文颜色锚在主题变量上——M10 加，本步先不加。

**验证（全链路，`pnpm dev` 后行为级逐条过）：**
- 空库启动 → 书架页空态引导 + 侧栏「点击 + 导入书籍」
- 导入一本 → 自动成为当前书（addBook 语义）进入阅读器；切回书架出现书卡
- 导入第二本 → 侧栏两本书、书架网格两卡；点 B 书名续读 B 的上次章节
- 从书架点「继续阅读」与侧栏点书名的行为一致（都进续读章）
- 删除正在读的书 → 确认后界面回到无书态，不报错、无死引用
- 重命名 → 侧栏与书架卡同步
- 30+ 本书滚动流畅，控制台无 key 警告、无未捕获异常

## 收尾验收清单

- [ ] 默认落在书架视图；书架 ⇄ 阅读器来回切换不丢 store 数据
- [ ] 侧栏：书列表当前书高亮、点书名续读、点章定向跳转、行内删除、导入按钮解析中禁用
- [ ] TopBar：上下文标签随视图变化、reader 视图显示进度%、A-/A+ 字号、菜单键折叠侧栏
- [ ] 书架页：搜索（书名/作者）、三路排序、双分支空态、导入按钮
- [ ] 书卡：封面双轨、进度条、统计行、重命名（Enter/Esc）、删除确认
- [ ] 两条导入路径（侧栏 + 书架）收敛同一解析 Hook；多书并存互不干扰
- [ ] 能画出「currentView 在 App / MainLayout / TopBar / Sidebar 的四次投影」
- [ ] 能说出：为什么视图切换是渲染分支而非路由 / 为什么当前书高亮是派生 UI / 为什么书卡是「近展示」例外

## 与最终代码的差异复盘

1. `App.tsx`——最终版还渲染 `WelcomeGuide`（M12 onboarding），本卡先不建。
2. `MainLayout`——最终版多了 `style={{ color: 'var(--text)' }}`（M10 主题变量兑现）。
3. `TopBar`——`ThemeIndicator` 本卡为占位，M10 填充真实实现；`THEME N/M/D/S/R/W` 快捷键提示同理。
4. `Sidebar`——本卡行为与最终版一致；进度徽标等样式细节在 M10 统一收口。
5. `BookshelfPage`/`BookCard`——最终版行为一致；`coverUrl` 的封面提取发生在解析管线（M1 领域），`importedAt` 由 `addBook` 写入（M3）——本卡只是消费方，不新增任何 store 字段。
6. 全部组件类名（app-sidebar、bookshelf-card 等）在最终版由 index.css 提供——M10 主题里程碑统一沉淀 28KB 样式，本卡先保证结构与行为。

## 设计注记（历史弯路）

- **书架页是后期才补的**（bfd12f4）：真实项目先有侧栏书列表，跑了好几个里程碑才加 BookshelfPage 总览——「能用」先于「好看」。复刻时侧栏先行（本卡 Step 2 先于 Step 4），顺序与真实演进一致。
- **多书导入**（c232340）：早期版本导入新书直接替换旧书（单书应用），多书支持是需求演进逼出来的——books 从「一本书」变「一个数组」，所有以书为单位的 state 都要加 id 维度。M3 的 bookSlice 从一开始就是数组设计，这是复刻时提前做对的一件事。
- **封面提取**（1cbafb4）：解析管线里从 EPUB 的 OPF 元数据抓封面图，抓不到就靠 `coverGradient` 哈希渐变兜底——「数据优先、算法兜底」的典型。
- **当前书高亮踩过的坑**：早期版本用「命令式激活」（点谁 set 谁的 active 态），改派生比较后少了一整类状态同步 bug——`currentBookId === book.id` 就是全部。
- 面板迭代教训（38662cb → d940bdd → 6711b27，M5 关联）同样适用于书架：**不用时隐藏、只留淡入**——书架页本身没有复杂动画，克制是主题里程碑（M10）之后才追求的事。

## 下一步

进入 [M10 · 主题系统](./M10-themes.md)——六个主题、body class 切换、Canvas 动态特效——书架与阅读器的观感将第一次拥有「皮肤」。
