# M3 · 从零构筑：状态持久化与阅读进度

> 目标：让书与学习数据活过刷新——引入 Zustand 拆分 store，用 persist 持久化到 localStorage，记录并恢复阅读进度。M1-M2 的局部状态全部迁移为 store 用法。
> 关联课程：L06（Zustand 基础：create/selector/组件外读 store）、L07（slice 模式与 persist 原理）。
> 前置：完成 M2（阅读页能渲染、能编辑译文）；知道 M1 产出的 Book 是纯 JSON 形状。

## 构筑总览（本里程碑结束时的项目结构）

```
src/
├── stores/
│   ├── bookSlice.ts          # 书库 + 阅读位置 + 进度（persist: book-store）
│   └── settingsSlice.ts      # 最小版：showFurigana（persist: settings-store）
├── hooks/
│   └── useEpubParser.ts      # 解析 hook（接 store.addBook，M1 内联逻辑搬家）
├── components/import/
│   └── EpubUploader.tsx      # 改接 useEpubParser，删 onImported prop
├── components/reader/
│   ├── ReadingView.tsx       # 从 store 读书/章 + 进度记录与恢复
│   └── SentencePairCard.tsx  # 注音开关改从 settingsSlice 读
└── App.tsx                   # 从 store 读 currentBook，props 全删
```

> 说明：五个 store 的真实划分（book/bookmark/practice/settings/ui）本阶段只建前两个——practice 是 M5、bookmark 是 M7、ui 是 M9，按需长出来。
> **最终差异说明**：真实 `settingsSlice` 有 version: 2 + migrate 和 AI/TTS 全套字段，本阶段只有 `showFurigana`（provider 相关 M4 加、TTS 参数 M8 加）；`bookSlice` 本阶段即完整最终形态（M7 书签跳转已预留 `scrollToPairId` 信箱字段）。

---

## Step 1 · 确认 zustand 已就位

M0 的 Step 2 就装好了 zustand（「M3 才真正用上，现在装好」）。现在验证并热个身：

```bash
pnpm ls zustand
```

**讲解（L06 核心）：** Zustand 把 Redux 的 action/reducer/dispatch 四件套压缩成一层——**store 就是一个带方法的对象，`set` 直接改**。最小形态：`create<T>()((set, get) => ({ 字段, action }))`。三个关键心智：
- **set 支持函数式更新**：`set((state) => ({...}))`，读取最新状态必须走函数参数，不能闭包旧 state。
- **selector 字段级订阅**：`useBookStore((s) => s.currentChapterIndex)`——只有这个字段变才重渲；不写 selector 拿整个 store 会每次变更都重渲（M2 的注音开关会全页闪）。
- **组件外也能读**：`useBookStore.getState()`——M4 之后 AI client 在非 React 模块里读设置就靠它。

**验证：** `pnpm ls zustand` 能列出版本。之后每建一个 store，`pnpm dev` 的控制台应无报错。

---

## Step 2 · bookSlice.ts：书库 + 阅读位置 + 进度（完整版）

这是全项目最核心的 store。字段设计遵循一个规律：**数组与字典归业务 store**（数据在积累），`Record<id, …>` 是 O(1) 查找且不怕顺序漂移。先建**不带 persist** 的版本（Step 3 再包），逻辑先跑通。

**`src/stores/bookSlice.ts`（Step 2 版）：**

```ts
import { create } from 'zustand';
import type { Book, Chapter } from '../types';

interface BookState {
  books: Book[];
  currentBookId: string | null;
  currentChapterIndex: number;
  // chapterId -> pairIndex (last visible pair)
  readingProgress: Record<string, number>;
  // chapterId -> timestamp
  lastReadAt: Record<string, number>;
  // bookId -> last chapter index
  lastChapterIndexByBook: Record<string, number>;
  // 用于书签跳转
  scrollToPairId: string | null;

  addBook: (book: Book) => void;
  removeBook: (id: string) => void;
  renameBook: (id: string, title: string) => void;
  setCurrentBook: (id: string) => void;
  setCurrentChapter: (index: number) => void;
  getLastChapterIndexForBook: (bookId: string) => number;
  getCurrentBook: () => Book | null;
  getCurrentChapter: () => Chapter | null;
  updatePairChinese: (pairId: string, chinese: string) => void;
  setReadingProgress: (chapterId: string, pairIndex: number) => void;
  getReadingProgress: (chapterId: string) => number;
  setScrollToPairId: (pairId: string | null) => void;
}

export const useBookStore = create<BookState>()((set, get) => ({
  books: [],
  currentBookId: null,
  currentChapterIndex: 0,
  readingProgress: {},
  lastReadAt: {},
  lastChapterIndexByBook: {},
  scrollToPairId: null,

  addBook: (book) =>
    set((state) => ({
      books: [...state.books, book],
      currentBookId: book.id,
      currentChapterIndex: 0,
    })),

  removeBook: (id) =>
    set((state) => ({
      books: state.books.filter((b) => b.id !== id),
      currentBookId:
        state.currentBookId === id ? null : state.currentBookId,
    })),

  renameBook: (id, title) =>
    set((state) => ({
      books: state.books.map((b) => (b.id === id ? { ...b, title: title.trim() || b.title } : b)),
    })),

  setCurrentBook: (id) =>
    set((state) => ({
      currentBookId: id,
      currentChapterIndex: Math.max(0, state.lastChapterIndexByBook[id] ?? 0),
    })),

  setCurrentChapter: (index) =>
    set((state) => {
      const currentBook = state.books.find((b) => b.id === state.currentBookId);
      if (!currentBook) {
        return { currentChapterIndex: index };
      }
      return {
        currentChapterIndex: index,
        lastChapterIndexByBook: {
          ...state.lastChapterIndexByBook,
          [currentBook.id]: index,
        },
      };
    }),

  getLastChapterIndexForBook: (bookId) =>
    Math.max(0, get().lastChapterIndexByBook[bookId] ?? 0),

  getCurrentBook: () => {
    const { books, currentBookId } = get();
    return books.find((b) => b.id === currentBookId) ?? null;
  },

  getCurrentChapter: () => {
    const book = get().getCurrentBook();
    if (!book) return null;
    return book.chapters[get().currentChapterIndex] ?? null;
  },

  updatePairChinese: (pairId, chinese) =>
    set((state) => ({
      books: state.books.map((book) => ({
        ...book,
        chapters: book.chapters.map((ch) => ({
          ...ch,
          pairs: ch.pairs.map((p) =>
            p.id === pairId ? { ...p, chinese } : p
          ),
        })),
      })),
    })),

  setReadingProgress: (chapterId, pairIndex) =>
    set((state) => ({
      readingProgress: {
        ...state.readingProgress,
        [chapterId]: pairIndex,
      },
      lastReadAt: {
        ...state.lastReadAt,
        [chapterId]: Date.now(),
      },
    })),

  getReadingProgress: (chapterId) =>
    get().readingProgress[chapterId] ?? 0,

  setScrollToPairId: (pairId) =>
    set({ scrollToPairId: pairId }),
}));
```

**逐行讲解（重点 action）：**
- **字段七个**：`books` 内容资产；`currentBookId`/`currentChapterIndex` 当前位置；三个 Record 字典（进度/时间戳/上次章号）；`scrollToPairId` 是**一次性消费的信箱字段**——M7 书签列表只负责 set 它，ReadingView 消费后清空。
- `addBook` **一次 set 做三件事**（追加 + 切当前书 + 章号归零）——原子性收益大于耦合代价，这是刻意的合并（L07 复盘第 5 条）。
- `setCurrentBook`：切换书时从 `lastChapterIndexByBook` **恢复**该书上次章号；`Math.max(0, …)` 防负数脏数据。
- `setCurrentChapter`：把章号**写回** `lastChapterIndexByBook`——恢复与记忆互为逆操作，写回内聚在 action 里（对比「组件里连调两个 action」：漏掉第二个调用就是 bug）。
- `updatePairChinese`：M2 的 `handleUpdateChinese` 四行原样搬进 store——三层 map 不可变更新，pairId 只按 id 匹配，调用方零心智。
- `setReadingProgress` **一次写两个字典**（进度 + 时间戳原子绑定）——分开写中途崩溃会留下「有进度没时间」的不一致。
- **读方法内聚兜底**：`getReadingProgress` 的 `?? 0`、`getLastChapterIndexForBook` 的 `Math.max(0, …)`——组件拿到的永远是干净值，兜底放 store 不放组件（一处兜底 vs 处处兜底）。
- **不可变更新铁律**：没有任何一行原地修改——数组用 `filter/map/[...展开]`、对象用 `{...old, key}`。这是整条链路（Zustand 变更检测、React 重渲、useMemo）靠引用比较工作的物理前提：`state.books.push(book)` 之后引用没变，订阅者被跳过、界面纹丝不动，而且是静默失败。
- `create<BookState>()(...)` 双括号：TS 泛型推断需要（第一个括号传类型、第二个是中间件/实现），去掉一层在 persist 场景下类型会烂。

**验证：** `npx tsc -b` 无报错（store 还没被引用，纯类型检查）。

---

## Step 3 · persist 中间件：localStorage 键名 book-store

包上 persist，每次任何 `set` 之后自动把 state 序列化写进 `localStorage[name]`，应用启动时水合回来。**函数不入库**（JSON.stringify 自动丢弃函数字段，恢复时用的是代码里现定义的 action），**数据全量入库**。

**修改 `src/stores/bookSlice.ts` 三处：**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';            // ① 新增 import
import type { Book, Chapter } from '../types';

// …interface 不变…

export const useBookStore = create<BookState>()(
  persist(                                              // ② 包一层 persist
    (set, get) => ({
      // …Step 2 的全部 state 和 action 原样搬进这里…
    }),
    { name: 'book-store' }                              // ③ 键名
  )
);
```

**逐行讲解：**
- **键名 `book-store` 可辨识**：DevTools → Application → Local Storage 里一眼看出是哪个 store；也避免与其它项目的 key 撞车。settings 用 `settings-store`（Step 4 建）。
- persist 包住后做三件事：每次 set 后序列化全 state 写存储；启动读回该 key 合并进初始 state（水合）；提供 version/migrate 钩子（L07 的 settings v1→v2 案例，M4 会用到）。
- 水合失败（被用户/插件清空、JSON 损坏）时回退默认值——`books: []` 等初始值就是兜底，不抛错不白屏。
- 本阶段**全量持久化**、不用 partialize：`books` 原文体积大是已知隐患（5MB 配额），等真实超限再优化——「存储格式每字节都要问谁消费它」是 L13 的纪律，现在还没到优化时机。

**验证（水合闭环）：**
1. `pnpm dev` → 导入一本书（需要先完成 Step 4 的 App 迁移，否则先看 Step 4）
2. DevTools → Application → Local Storage → `localhost:5174` → 看到 `book-store` 键，展开 JSON：`books`/`currentBookId`/`readingProgress` 等字段名清晰可读，**没有函数**
3. 手改该键的 JSON（比如把 `currentBookId` 改成 null）→ 刷新 → 应用按新值渲染——证明水合真的在读存储
4. 手写一段非法 JSON 覆盖 `book-store` → 刷新 → 应用不崩、回到默认状态（错误容忍）

---

## Step 4 · 迁移：M1-M2 的局部状态全部改接 store

L06 的「从 useState 迁移到 store 标准动作清单」：定归属 → 扩接口（已在 Step 2/3）→ 换订阅 → 扫残留 → 验链路。下面四个文件按依赖顺序改。

**① `src/hooks/useEpubParser.ts`（新建，M1 的 EpubUploader 内联逻辑搬家）：**

```ts
import { useState, useCallback } from 'react';
import { parseEpubFile } from '../lib/epub/parser';
import { useBookStore } from '../stores/bookSlice';
import type { Book } from '../types';

export function useEpubParser() {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addBook = useBookStore((s) => s.addBook);

  const parseFile = useCallback(
    async (file: File): Promise<Book | null> => {
      setParsing(true);
      setError(null);
      try {
        const book = await parseEpubFile(file);
        if (book.chapters.length === 0) {
          setError('未能从EPUB中提取到日中句对。请确认文件格式正确。');
          return null;
        }
        addBook(book);
        return book;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'EPUB解析失败';
        setError(msg);
        return null;
      } finally {
        setParsing(false);
      }
    },
    [addBook]
  );

  return { parseFile, parsing, error };
}
```

**讲解：** `parseFile` 的骨架与 M1 的 `handleFile` 逐字相同，差异只有两处——`onImported(book)` 变成 `addBook(book)`（store action），错误分支 `return null`（让调用方知道失败）。返回 `{ parseFile, parsing, error }` 是 hook 的标准形状，组件不再自己管解析逻辑。

**② `src/components/import/EpubUploader.tsx`（改接 hook，删 onImported prop；先 `pnpm add react-icons`——图标库，最终项目用它）：**

```tsx
import { useCallback, useState } from 'react';
import { useEpubParser } from '../../hooks/useEpubParser';
import { FiUpload } from 'react-icons/fi';

export function EpubUploader() {
  const { parseFile, parsing, error } = useEpubParser();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (file.name.endsWith('.epub')) {
        parseFile(file);
      }
    },
    [parseFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="uploader-page">
      <div className="uploader-copy">
        <div className="uploader-kicker">IMPORT</div>
        <h2 className="uploader-title">把第一本双语 EPUB 放进书架。</h2>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById('epub-input')?.click()}
        className="uploader-dropzone"
        style={{ borderColor: dragOver ? 'var(--accent)' : 'var(--line)' }}
      >
        <FiUpload size={40} className="mx-auto mb-4" style={{ color: 'var(--ink-muted)' }} />
        <p style={{ fontWeight: 500, color: 'var(--ink-secondary)' }}>导入双语 EPUB</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>拖拽文件到此处，或点击选择</p>
        <input id="epub-input" type="file" accept=".epub" onChange={handleInput} className="hidden" />
      </div>

      {parsing && <div className="uploader-status">正在解析 EPUB 文件...</div>}
      {error && <div className="uploader-error">{error}</div>}
    </div>
  );
}
```

**讲解：** 组件瘦身为纯 UI：解析逻辑全在 hook，`parseFile` 成功即 `addBook`（store 自动切当前书 + persist 落盘）。`FiUpload` 图标是 M1 差异复盘里留白的装饰，现在补上。这个文件至此与最终版一致。

**③ `src/stores/settingsSlice.ts`（新建，最小版）：**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  showFurigana: boolean;
  toggleFurigana: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showFurigana: true,
      toggleFurigana: () =>
        set((state) => ({ showFurigana: !state.showFurigana })),
    }),
    { name: 'settings-store' }
  )
);
```

**讲解：** M2 的注音开关 state 从 ReadingView 迁到这里——偏好（低频修改、跨会话保留）归 settings。action 命名为 `toggleFurigana`（动词开头是命名纪律）。真实 settingsSlice 有 version: 2 + migrate 和 AI/TTS 全套字段，**M4 加 provider 相关、M8 加 TTS 参数时再引入 version 迁移**——现在不提前建。

**④ `src/App.tsx`（从 store 读书，props 全删）：**

```tsx
import { MainLayout } from './components/layout/MainLayout';
import { ReadingView } from './components/reader/ReadingView';
import { EpubUploader } from './components/import/EpubUploader';
import { useBookStore } from './stores/bookSlice';

export default function App() {
  const currentBook = useBookStore((s) => s.getCurrentBook());

  return (
    <MainLayout>
      {currentBook ? <ReadingView /> : <EpubUploader />}
    </MainLayout>
  );
}
```

**讲解：** `book`/`chapterIndex`/`handleUpdateChinese` 三个局部状态全部消失——`getCurrentBook` 是 selector 订阅，store 一变（addBook/removeBook）App 自动重渲。ReadingView 不再收任何 props。

**⑤ `src/components/reader/ReadingView.tsx`（store 版，无进度）：**

```tsx
import { useState, useEffect } from 'react';
import type { SentencePair as SentencePairType } from '../../types';
import { useBookStore } from '../../stores/bookSlice';
import { SentencePairCard } from './SentencePairCard';
import { EpubUploader } from '../import/EpubUploader';

export function ReadingView() {
  const currentBook = useBookStore((s) => s.getCurrentBook());
  const currentChapter = useBookStore((s) => s.getCurrentChapter());
  const currentChapterIndex = useBookStore((s) => s.currentChapterIndex);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const updatePairChinese = useBookStore((s) => s.updatePairChinese);

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);

  // 切章副作用：重置选中态（旧章的选中不残留到新章）
  useEffect(() => {
    setSelectedPairId(null);
  }, [currentChapter?.id]);

  const selectedPair = currentChapter?.pairs.find((p) => p.id === selectedPairId) ?? null;

  if (!currentBook) return <EpubUploader />;

  if (!currentChapter) {
    return <div className="text-reading opacity-50">没有可显示的章节</div>;
  }

  return (
    <div className="reader-layout">
      <div className="reader-toolbar">
        <select
          value={currentChapterIndex}
          onChange={(e) => setCurrentChapter(Number(e.target.value))}
        >
          {currentBook.chapters.map((ch, i) => (
            <option key={ch.id} value={i}>
              {ch.title}
            </option>
          ))}
        </select>
      </div>

      <div className="reader-stage">
        {currentChapter.pairs.map((pair) => (
          <SentencePairCard
            key={pair.id}
            pair={pair}
            isSelected={selectedPairId === pair.id}
            onSelect={() => setSelectedPairId(pair.id === selectedPairId ? null : pair.id)}
          />
        ))}
      </div>

      {selectedPair && (
        <PairEditor
          pair={selectedPair}
          onSave={(chinese) => {
            updatePairChinese(selectedPair.id, chinese);
            setSelectedPairId(null);
          }}
          onClose={() => setSelectedPairId(null)}
        />
      )}
    </div>
  );
}
```

（`PairEditor` 组件与 M2 Step 4 相同，原样保留在文件末尾；`showFurigana` 从 props 删除后，由卡片内部从 store 读。）

**讲解：** 所有 `useBookStore` selector 都是**函数引用订阅**：`getCurrentBook` 是函数本身，响应性来自它内部读到的 `books`/`currentBookId` 变化——L07 复盘点名的微妙处。`setCurrentChapter` 一次完成「换章 + 写回记忆」，切章副作用用 `useEffect` 监听 `currentChapter?.id`（比 M2 的 select onChange 里手动清更稳：任何切章入口都生效）。

**⑥ `SentencePairCard.tsx` 的 `JapaneseText` 小改：**

```tsx
// 删掉 props 里的 showFurigana 透传，组件内部直接订阅：
const showFurigana = useSettingsStore((s) => s.showFurigana);
```

**讲解：** M2 是「父组件传 prop」，现在卡片自己从 store 读——注音开关任何入口（未来的设置面板）修改都即时反映。需要同步改三处：加 `import { useSettingsStore } from '../../stores/settingsSlice';`；`Props` 接口删 `showFurigana`；`JapaneseText` 的 props 解构删 `showFurigana`、函数体内加上面这一行。

**验证（迁移闭环）：**
1. 导入一本书 → 阅读页正常；切章、选中、编辑译文全部照旧
2. 编辑一句译文 → 刷新 → 译文保留（`updatePairChinese` 已随 books 持久化）
3. 开注音 → 刷新 → 注音开关状态保留（settings-store 生效）
4. 打开设置类交互后刷新 → 会话性 UI 状态本就不持久化（本阶段只有编辑器是局部 state，刷新即复位，无报错）

---

## Step 5 · 阅读进度记录与恢复

「记录」与「恢复」必须成对设计。记录：滚动监听按滚动距离估算当前句对下标，写进度；恢复：进入章节时若有进度，滚动到对应位置——**同一章只恢复一次**（防每切一次就跳一次）。

**先更新文件顶部 import（补 `useRef`），再在 ReadingView 顶部补两处订阅与两个 ref：**

```tsx
import { useState, useEffect, useRef } from 'react';
```

```tsx
  const setReadingProgress = useBookStore((s) => s.setReadingProgress);
  const getReadingProgress = useBookStore((s) => s.getReadingProgress);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef<string | null>(null);
```

**给滚动容器加 ref（`reader-stage` div 上 `ref={scrollHostRef}`），并追加两个 effect：**

```tsx
  // 进入章节时恢复进度（同一章只恢复一次）
  useEffect(() => {
    if (!currentChapter) return;
    if (restoredRef.current === currentChapter.id) return;
    restoredRef.current = currentChapter.id;

    const savedIndex = getReadingProgress(currentChapter.id);
    if (savedIndex > 0) {
      requestAnimationFrame(() => {
        const container = scrollHostRef.current;
        if (container) {
          container.scrollTo({ top: savedIndex * 100, behavior: 'instant' });
        }
      });
    }
  }, [currentChapter, getReadingProgress]);

  // 简单滚动追踪：估算当前可见句对下标
  useEffect(() => {
    if (!currentChapter) return;
    const container = scrollHostRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const currentIndex = Math.floor(scrollTop / 100);
      if (currentIndex >= 0 && currentIndex < currentChapter.pairs.length) {
        setReadingProgress(currentChapter.id, currentIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentChapter, setReadingProgress]);
```

**逐行讲解：**
- **恢复**：`restoredRef` 记录「哪个章节已恢复过」，换章才重置（依赖 `currentChapter` 变化）——没有它，反复切章会每次跳一次滚动，让人崩溃（真实教训 024b8d5 系列）。`requestAnimationFrame` 保证在 DOM 就绪后滚动（切章后首帧渲染完）。`savedIndex * 100` 是估算行高——**粗粒度妥协**：卡片高度不恒定（注音开/关、有无译文都改变高度），精确计算成本高，「回到大致位置」对用户够用。
- **记录**：scroll 监听 `{ passive: true }`（不阻塞滚动线程，无性能告警）；`scrollTop / 100` 向下取整得当前句对下标，写一次 `setReadingProgress` 同时落两个字典（进度 + 时间戳）。监听器在换章/卸载时清理。
- **双层记忆闭环**：章内精确到句对（`readingProgress[chapterId]`）+ 书级记住章号（`lastChapterIndexByBook[bookId]`，Step 2 的 `setCurrentBook`/`setCurrentChapter` 已实现）——「A 书第 3 章读到中段 → 切 B 书 → 切回 A 书」回到第 3 章中段，就是这两个字典的配合。
- 进度估算的已知缺陷（L16 复盘）：行高 100px 是常量假设，注音开启后卡片实际更高，估算下标会偏前。最终代码接受这个精度——用户要的是「别让我从头翻」，不是「精确到第 37.5 句」。M6 会换成按卡片定位（`scrollPairToCenter`），但进度存储格式不变。

**验证（验收核心场景）：**
1. 导入书 → 读到第 3 章中段（滚动一段距离）→ 刷新 → 自动回到第 3 章并滚动到大致位置（同一章只跳一次）
2. A 书第 3 章中段 → 切 B 书 → 切回 A 书 → 落在第 3 章中段
3. A 书第 3 章中段 → 切第 5 章 → 切回第 3 章 → 落回中段
4. DevTools 看 `book-store` 的 `readingProgress`：键是 chapterId、值是数字下标；`lastReadAt` 有对应时间戳
5. 快速滚动长章节 → 滚动不卡顿（passive 监听生效）

---

## 收尾验收清单

- [ ] 导入一本书 → 刷新：书还在，无需重新导入，直接回到阅读视图
- [ ] 读到某章某位置 → 刷新：回到同一章并滚动到大致相同位置（同一章只恢复一次）
- [ ] A 书第 3 章中段 → 切 B 书 → 切回 A 书：自动回到第 3 章（不是第 1 章）
- [ ] A 书第 3 章中段 → 切第 5 章 → 切回第 3 章：回到中段位置（不是章首）
- [ ] DevTools → Application → Local Storage 能看到 `book-store` / `settings-store`，字段名可读、无函数
- [ ] 编辑过的译文刷新后保留（updatePairChinese 已持久化）
- [ ] 注音开关状态刷新后保留（settings-store 生效）
- [ ] 手写非法 JSON 覆盖 `book-store` → 刷新 → 不崩、回默认状态（错误容忍）
- [ ] 手改 localStorage 某键值 → 刷新 → 按新值渲染（证明水合在读存储）
- [ ] 全 store 自查：无 `push`/`splice`/属性赋值式修改（不可变更新铁律）
- [ ] 删除当前正在读的书：currentBookId 清空、界面回无书态、不报错
- [ ] 连续快速切章 20 次：无错乱、无崩溃、进度字典一致
- [ ] 能画出五个 store 与 localStorage 键名的对应关系（book-store 等已建；practice/bookmark/ui 是 M5/M7/M9 的）
- [ ] 能说出 persist 持久化了什么、没持久化什么（函数不入库、数据全量入库）
- [ ] 能画出「一次滚动 → 进度写入 → 刷新 → 位置恢复」的完整数据流
- [ ] 能说出 `setCurrentChapter` 把「写回 lastChapterIndexByBook」内聚进 action 的原因
- [ ] 进度估算的缺陷（固定行高 100px）能说出来，并知道 M6 会换按卡片定位

## 与最终代码的差异复盘

1. `settingsSlice.ts`——最终版有 `version: 2` + `migrate`（v1 单供应商 `aiProvider` → v2 多档案 `aiProviders` 的平滑迁移）和 AI/TTS 全套字段。M3 最小版刻意没有 version——**存储结构一旦发布就是接口**，等 M4 加 AI 配置、M8 加 TTS 参数时再一起引入版本化。
2. `bookSlice.ts`——本阶段即最终完整形态（`scrollToPairId` 信箱字段已建，M7 书签跳转直接用）。真实历史中它是演化的：阅读进度从「记住最后章节」演进到「章内精确到句对」（024b8d5 是关键一步），我们一步到位是站在终局设计上。
3. `ReadingView.tsx`——最终版进度恢复后还有 M6 的 `scrollPairToCenter`（按卡片精确定位）替换本卡的 `savedIndex * 100` 估算；scroll 监听在 M6 后依然存在（进度写入不变）。`scrollHostRef`/`restoredRef` 是最终版就有的两个 ref，名字不换。
4. `App.tsx`——最终版还有 `useUIStore` 的 `currentView` 切换（M9 书架页）和 WelcomeGuide/SettingsModal（M12/M5）。M3 的「有书 → ReadingView、无书 → EpubUploader」结构会被 M9 的视图路由吸收。
5. `useEpubParser.ts`——最终版就是这个文件（逐字一致），M3 之后不再变。
6. 进度字典的残留键——删除书后 `readingProgress`/`lastReadAt` 里的旧 chapterId 键不清理：无害垃圾（key 是唯一 id，永不撞车），清理反而增加复杂度——L07 复盘第 13 条的取舍。

## 设计注记（历史弯路）

- 阅读进度不是一版做成的（024b8d5 是其中关键一步）：从「记住最后章节」演进到「章内精确到句对」的双层记忆。早期版本要么刷新回章首、要么切章位置错乱——「记录」与「恢复」必须成对设计，且恢复要防重复。
- 进度估算用滚动距离除以固定行高是妥协：卡片高度不恒定（注音开关、有无译文都改变），精确计算成本高，粗粒度对「回到大致位置」够用。**为人类用户设计，而非为精确性设计。**
- settings 经历过 v1 单供应商 → v2 多供应商的结构升级，靠 persist 的 `version` + `migrate` 平滑迁移。教训：存储结构一旦发布就是接口，变更必须显式版本化。
- 五个 store 的划分是随功能增长逐步拆出来的，不是一次设计蓝图。本手册放 M3 单独做，因为「先有数据、再谈持久化」最不容易返工。
- 书签系统真实历史上完全重写过（19368db 初版「整句收藏」→ 227d7dc「划选任意文字高亮 + 颜色」）：持久化的数据结构一旦定型就难改，M7 之前别为书签建复杂存储模型，等交互形态定了再说——这也是本阶段 bookSlice 只留一个 `scrollToPairId` 信箱字段的原因。

## 下一步

进入 [M4 · 后端与 AI 分析](./M04-ai-backend.md)：给回译练习接上 AI 大脑——Hono 后端、providers 工厂、限流与错误透传。settingsSlice 的 provider 字段在那里长出来。
