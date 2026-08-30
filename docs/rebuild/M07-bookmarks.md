# M7 · 书签系统：划选高亮与跳转回读

> 目标：从「在正文里划重点」出发，走通 划选 → 六色工具条 → 持久化 → 高亮回显 → 列表跳转 的完整闭环。
> 关联课程：L18（书签系统：从划选文字到跳转回读）。
> 前置：完成 M6——ReadingView 里已有 `pairRefs` Map、`scrollPairToCenter`、`handleSelectPair` 与卡片上的 `data-pair-id` 属性（跳转联动的全部基础设施）；M3 已建 bookmark store 骨架（`bookmarks` 数组 + 颜色常量），本卡把行为补全。

## 构筑总览（本里程碑结束时的项目结构）

```
src/
├── stores/
│   └── bookmarkSlice.ts          # 书签数据模型 + 六色板 + persist + 跳转命令字段（补全行为）
├── hooks/
│   └── useTextSelection.ts       # 监听 mouseup/touchend → 把选区换算成卡片内字符偏移
└── components/reader/
    ├── SelectionPopover.tsx      # 选区下方浮出的六色圆点工具条（新建）
    ├── BookmarkList.tsx          # 当前章节书签列表：颜色 + 文本 + 删除 + 点击跳转（新建）
    ├── SentencePairCard.tsx      # JapaneseText 新增书签高亮渲染（改）
    └── ReadingView.tsx           # 接线：弹层挂载、书签按钮/列表、scrollToBookmarkId 跳转 effect（改）
```

> 最终差异说明：真实仓库的书签存储是**扁平数组**（`bookmarks: TextBookmark[]`），每条书签自带 `chapterId` 与 `pairId`——不是「bookId → 书签数组」的嵌套表。扁平化让 persist 序列化更简单，两个查询维度（本章列表、本句高亮）各用一个 getter 收口即可。初版设计（commit 19368db）就是按书分组的嵌套表，重写（227d7dc）时改成了扁平结构。本卡直接按最终形态写。

## Step 1 · bookmarkSlice：数据模型与 CRUD

**做什么：** 定义 `TextBookmark` 八字段模型与 `BOOKMARK_COLORS` 六色板，实现增删改查与「跳转命令字段」，用 persist 持久化到 `baku-yomi-bookmarks`。M3 只建了数组骨架，本步补全全部行为。

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const BOOKMARK_COLORS = [
  { id: 'red', label: '红色', bg: 'rgba(220, 38, 38, 0.25)', border: 'rgba(220, 38, 38, 0.5)', textColor: 'rgb(220, 38, 38)' },
  { id: 'orange', label: '橙色', bg: 'rgba(249, 115, 22, 0.25)', border: 'rgba(249, 115, 22, 0.5)', textColor: 'rgb(249, 115, 22)' },
  { id: 'yellow', label: '黄色', bg: 'rgba(234, 179, 8, 0.25)', border: 'rgba(234, 179, 8, 0.5)', textColor: 'rgb(234, 179, 8)' },
  { id: 'green', label: '绿色', bg: 'rgba(22, 163, 74, 0.25)', border: 'rgba(22, 163, 74, 0.5)', textColor: 'rgb(22, 163, 74)' },
  { id: 'blue', label: '蓝色', bg: 'rgba(37, 99, 235, 0.25)', border: 'rgba(37, 99, 235, 0.5)', textColor: 'rgb(37, 99, 235)' },
  { id: 'purple', label: '紫色', bg: 'rgba(147, 51, 234, 0.25)', border: 'rgba(147, 51, 234, 0.5)', textColor: 'rgb(147, 51, 234)' },
];

export interface TextBookmark {
  id: string;
  pairId: string;        // 定位到哪张卡片
  chapterId: string;     // 定位到哪个章节（列表按章节过滤）
  startOffset: number;   // 相对 pair.japanese 纯文本的起始字符下标
  endOffset: number;
  text: string;          // 划选原文快照（列表直接展示用）
  colorId: string;       // BOOKMARK_COLORS 里的 id
  createdAt: number;
}

interface BookmarkState {
  bookmarks: TextBookmark[];
  scrollToBookmarkId: string | null;

  addBookmark: (bookmark: Omit<TextBookmark, 'id' | 'createdAt'>) => string;
  removeBookmark: (id: string) => void;
  updateBookmarkColor: (id: string, colorId: string) => void;
  getBookmarksByPair: (pairId: string) => TextBookmark[];
  getBookmarksByChapter: (chapterId: string) => TextBookmark[];
  getBookmarkById: (id: string) => TextBookmark | undefined;
  setScrollToBookmarkId: (id: string | null) => void;
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      scrollToBookmarkId: null,

      addBookmark: (bookmark) => {
        const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          bookmarks: [...state.bookmarks, { ...bookmark, id, createdAt: Date.now() }],
        }));
        return id;
      },

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter(b => b.id !== id),
        })),

      updateBookmarkColor: (id, colorId) =>
        set((state) => ({
          bookmarks: state.bookmarks.map(b =>
            b.id === id ? { ...b, colorId } : b
          ),
        })),

      getBookmarksByPair: (pairId) => get().bookmarks.filter(b => b.pairId === pairId),

      getBookmarksByChapter: (chapterId) => get().bookmarks.filter(b => b.chapterId === chapterId),

      getBookmarkById: (id) => get().bookmarks.find(b => b.id === id),

      setScrollToBookmarkId: (id) => set({ scrollToBookmarkId: id }),
    }),
    { name: 'baku-yomi-bookmarks' }
  )
);
```

**逐行讲解：**
- `TextBookmark.startOffset/endOffset` 是**相对 `pair.japanese` 纯文本**的字符下标，不是 DOM 节点偏移——段落重排（比如切换注音开关导致 ruby 标签增删）时纯文本不动，坐标永远有效。这是整个书签系统能持久化的地基决策。
- `BOOKMARK_COLORS` 把颜色三元组集中定义：`bg` 是半透明背景（要叠在纸张色上）、`border` 是下划线色、`textColor` 留给将来扩展。组件层只存 `colorId`，不复制颜色值——配色改动只动这一处。
- `addBookmark` 的 id 用 `时间戳 + 随机后缀`——同一毫秒内连画两条书签也不会撞。它**返回 id**，为将来「创建后立刻滚动到新书签」留了入口。
- 三个 getter 都是即席 `filter`/`find`——书签量级小，不值得建索引结构；「命令字段」`scrollToBookmarkId` 是跨组件一次性命令（Step 5 讲），M3 的 book store 里 `scrollToPairId` 同源。
- `persist(..., { name: 'baku-yomi-bookmarks' })`——M3 定下的可辨识键名，DevTools 里直接能看到。

**验证：** `npx tsc -b` 通过。浏览器控制台 `useBookmarkStore.getState().addBookmark({...})` 手动造一条书签 → Application → Local Storage 出现 `baku-yomi-bookmarks`，刷新后仍在。此步先用假数据验证存储层，真正的创建入口在 Step 3。

## Step 2 · useTextSelection：把浏览器选区换算成卡片内偏移

**做什么：** 新建 `src/hooks/useTextSelection.ts`。监听文档级 `mouseup`/`touchend`，把用户选区过滤、换算成「哪张卡片 + 卡片内字符起止 + 选区包围盒」，存进 state 供弹层消费。

```ts
import { useState, useEffect, useCallback, useRef } from 'react';

export interface SelectionInfo {
  pairId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  rect: DOMRect;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const justSelectedRef = useRef(false);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);

    // 检查是否在 SentencePairCard 内
    const container = range.commonAncestorContainer;
    const pairCard = (container instanceof Element ? container : container.parentElement)
      ?.closest('[data-pair-id]');

    if (!pairCard) {
      setSelection(null);
      return;
    }

    const pairId = pairCard.getAttribute('data-pair-id');
    if (!pairId) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    // 计算相对于文本内容的偏移
    const preRange = document.createRange();
    preRange.selectNodeContents(pairCard);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + text.length;

    justSelectedRef.current = true;
    setSelection({
      pairId,
      startOffset,
      endOffset,
      text,
      rect,
    });

    // 500ms 后重置标记
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 500);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseUp]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // 导出标记，供外部判断
  const hasJustSelected = () => justSelectedRef.current;

  return { selection, clearSelection, hasJustSelected };
}
```

**逐行讲解：**
- **为什么监听 `mouseup` 而不是 `selectionchange`：** selectionchange 在拖选过程中持续触发（每移一个字符触发多次），我们要的是「松手定稿」的那一次选区。mouseup 是拖选的自然终点，触屏对应 `touchend`。想用 selectionchange 就得做防抖 + 判 `isCollapsed`，反而更绕。
- **四个防御分支**依次过滤：① 折叠选区（`isCollapsed`——普通单击）；② 空白选区（`trim()` 后为空）；③ 选区不在任何卡片内（`closest('[data-pair-id]')` 返回 null，比如划选了侧栏文字）；④ 拿不到 `pairId` 属性。任一分支失败都 `setSelection(null)`——**弹层的显隐完全由这个 state 驱动，清 state 就是关弹窗**。
- **`container instanceof Element ? container : container.parentElement`**：`commonAncestorContainer` 可能是文本节点（选中文字时几乎总是），文本节点没有 `closest()`，先升位到元素节点再找卡片。
- **坐标换算**是核心：构造辅助 Range，起点在卡片内容开头、终点在选区起点，`toString().length` 就是「卡片开头到选区起点有多少个字符」。`endOffset = startOffset + text.length` 成立的前提是 `preRange.toString()` 与 `sel.toString()` 拼接的是同一套 DOM 文本节点。
- **`justSelectedRef` + 500ms 定时器**：mouseup 之后浏览器还会补发一次 `click`。这个标记让 click 处理器（卡片选中、面板关闭）能识别「这是划选的收尾动作，别当普通点击」。用 ref 而非 state，因为标记不驱动渲染，且必须在同步代码里立即可读。
- `clearSelection` 里 `window.getSelection()?.removeAllRanges()`——真正清掉浏览器选区，防止残留高亮。

**已知边界（面试谈资）：** 从第一张卡片拖到第二张卡片时，`commonAncestorContainer` 是共同父级 `.reader-stage-inner`，`closest('[data-pair-id]')` 返回 null——**跨卡片划选被静默丢弃**，这是有意的取舍。

**验证：** 临时在 ReadingView 里 `console.log(useTextSelection().selection)` 划选一段文字，确认输出含正确的 pairId 与 offset（**反向拖选也正确**——Range 的 start/end 是规范化后的逻辑边界，与拖动方向无关）。确认后移除调试代码。

## Step 3 · SelectionPopover：六色工具条

**做什么：** 新建 `src/components/reader/SelectionPopover.tsx`。把选区包围盒换算成 fixed 定位，弹出六个色块按钮，点击即创建书签并关闭。

```tsx
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import type { SelectionInfo } from '../../hooks/useTextSelection';

interface Props {
  selection: SelectionInfo;
  chapterId: string;
  onClose: () => void;
}

export function SelectionPopover({ selection, chapterId, onClose }: Props) {
  const addBookmark = useBookmarkStore((s) => s.addBookmark);

  const handleSelectColor = (colorId: string) => {
    addBookmark({
      pairId: selection.pairId,
      chapterId,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      text: selection.text,
      colorId,
    });
    onClose();
  };

  return (
    <div
      className="fixed z-50 animate-fade-in"
      style={{
        left: selection.rect.left + selection.rect.width / 2,
        top: selection.rect.bottom + 8,
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-lg"
        style={{
          backgroundColor: 'var(--bg-paper)',
          border: '1px solid var(--border-light)',
        }}
      >
        {BOOKMARK_COLORS.map((color) => (
          <button
            key={color.id}
            onClick={() => handleSelectColor(color.id)}
            className="w-6 h-6 rounded-full transition-transform hover:scale-125"
            style={{
              backgroundColor: color.bg,
              border: `2px solid ${color.border}`,
            }}
            title={color.label}
          />
        ))}
      </div>
    </div>
  );
}
```

**逐行讲解：**
- **定位公式**：`left = rect.left + rect.width / 2` 水平居中于选区，配合 `translateX(-50%)` 把弹层自身宽度回拉一半；`top = rect.bottom + 8` 垂直贴在选区下方 8px。`rect` 来自 `range.getBoundingClientRect()`，是**视口坐标系**，而 `fixed` 定位也是视口坐标系——所以位置当场正确，跨行选区也一样（包围盒已包住多行）。
- 点击色块 → `addBookmark`（Step 2 算好的偏移原样透传，不做二次计算）→ `onClose()`。`onClose` 由 ReadingView 传入 `clearSelection`，一条链路同时关弹层、清浏览器选区。
- 已知小瑕疵：页面滚动后弹窗不跟着选区走（rect 是快照）。好在划选后用户通常立刻点色，且任何 mouseup 都会重算。

**验证：** 本步依赖 ReadingView 挂载，统一见 Step 5 的行为级验证。

## Step 4 · SentencePairCard：高亮回显（JapaneseText 逆切片）

**做什么：** 改 `src/components/reader/SentencePairCard.tsx`。M6 版本里 `JapaneseText` 只有注音分支；本步插入书签分支——按书签把 `pair.japanese` 切片包 `<mark>`，**从后往前**处理保证偏移不失准。

```tsx
function JapaneseText({
  pair,
  className,
  style,
}: {
  pair: SentencePairType;
  className?: string;
  style?: React.CSSProperties;
}) {
  const showFurigana = useSettingsStore((s) => s.showFurigana);
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const bookmarks = useMemo(
    () => allBookmarks.filter((b) => b.pairId === pair.id),
    [allBookmarks, pair.id]
  );

  const renderedContent = useMemo(() => {
    if (bookmarks.length > 0) {
      const sorted = [...bookmarks].sort((a, b) => b.endOffset - a.endOffset);
      let text = pair.japanese;

      for (const bm of sorted) {
        const before = text.slice(0, bm.startOffset);
        const marked = text.slice(bm.startOffset, bm.endOffset);
        const after = text.slice(bm.endOffset);
        const color = BOOKMARK_COLORS.find((c) => c.id === bm.colorId);
        text = `${before}<mark style="background-color: ${color?.bg || 'transparent'}; border-bottom: 2px solid ${color?.border || 'transparent'};">${marked}</mark>${after}`;
      }

      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    }

    if (showFurigana && pair.japaneseHtml) {
      return <span dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />;
    }

    return pair.japanese;
  }, [
    pair.japanese,
    pair.japaneseHtml,
    showFurigana,
    bookmarks,
  ]);

  return (
    <p className={className} style={style}>
      {renderedContent}
    </p>
  );
}
```

**逐行讲解：**
- **为什么按 `endOffset` 降序（从后往前）处理：** 插入 `<mark>` 标签后字符串变长，靠前书签的数值 offset 会指向错位。从最靠后的书签开始改，前面未处理区域不受影响——和「从后往前删数组元素」是同一个不变量思维。两个重叠书签仍有瑕疵，这是简化实现的已知边界。
- **高亮切片用 `pair.japanese` 而非 `bm.text` 快照**：`marked` 永远取自当前正文，即使 localStorage 被篡改塞进 `<script>`，也只污染列表展示（React 文本节点自动转义），高亮路径无注入面。
- **书签优先于注音**：有书签的句子不再走 `japaneseHtml` 注音渲染（两个 `dangerouslySetInnerHTML` 二选一，不叠加）。这正是偏移坐标系必须建立在**不含 ruby 的纯文本**上的原因——`japaneseHtml` 里的 `<rt>` 注音会污染字符计数。
- `bookmarks` 的 `useMemo` 依赖 `[allBookmarks, pair.id]`——任何书签增删都会让每张有书签的卡片重算重注入，数据量大时这是第一个优化点（面试可谈）。

**验证：** 配合 Step 5——创建书签后原文对应文字立即变底色 + 下划线，且高亮位置与划选内容一致。

## Step 5 · BookmarkList + ReadingView 接线：跳转闭环

**做什么：** 新建 `BookmarkList.tsx`（本章书签列表），并在 ReadingView 里挂三样东西：划选弹层、书签按钮（带徽标）+ 列表浮层、`scrollToBookmarkId` 跳转 effect。

**`src/components/reader/BookmarkList.tsx`（新建）：**

```tsx
import { useBookStore } from '../../stores/bookSlice';
import { useBookmarkStore, BOOKMARK_COLORS } from '../../stores/bookmarkSlice';
import { FiBookmark, FiTrash2 } from 'react-icons/fi';

interface Props {
  onClose: () => void;
}

export function BookmarkList({ onClose }: Props) {
  const currentChapterId = useBookStore((s) => s.getCurrentChapter()?.id ?? null);
  const currentChapterPairs = useBookStore((s) => s.getCurrentChapter()?.pairs ?? []);
  const allBookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);

  const bookmarks = currentChapterId
    ? allBookmarks.filter((b) => b.chapterId === currentChapterId)
    : [];

  if (bookmarks.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--ink-muted)' }}>
        <FiBookmark size={24} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm opacity-50">选中文字添加书签</p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {bookmarks.map((bookmark) => {
        const color = BOOKMARK_COLORS.find((c) => c.id === bookmark.colorId);
        const pair = currentChapterPairs.find((p) => p.id === bookmark.pairId);

        return (
          <div
            key={bookmark.id}
            className="group flex items-start gap-2 p-3 cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              borderBottom: '1px solid var(--border-light)',
              backgroundColor: color?.bg || 'transparent',
            }}
            onClick={() => {
              setScrollToBookmarkId(bookmark.id);
              onClose();
            }}
          >
            <div
              className="mt-1 flex-shrink-0"
              style={{ color: color?.border || 'var(--ink-muted)' }}
            >
              <FiBookmark size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm truncate"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink-primary)',
                  borderLeft: color ? `2px solid ${color.border}` : 'none',
                  paddingLeft: '0.5rem',
                }}
              >
                {bookmark.text}
              </p>
              {pair && (
                <p
                  className="text-xs truncate opacity-50 mt-0.5"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {pair.japanese.slice(0, 30)}...
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeBookmark(bookmark.id);
              }}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 p-1 transition-opacity"
              style={{ color: 'var(--error-color)' }}
            >
              <FiTrash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

**讲解：** 列表按 `chapterId` 过滤（只显示本章书签）；条目配色取自 `BOOKMARK_COLORS`（条目底色 + 左边条 + 图标色三处同源）；点击条目写入 `scrollToBookmarkId` 并 `onClose()`——**列表自己不滚动任何东西**，滚动由 ReadingView 的 effect 消费命令完成。删除按钮 `e.stopPropagation()` 防止触发跳转；`opacity-0 group-hover:opacity-50` 实现「默认隐藏、悬停浮现」，避免误触。

**ReadingView 新增接线（在 M6 版本上追加）：**

```tsx
// —— hooks / store 新增 ——
const { selection, clearSelection, hasJustSelected } = useTextSelection();
const allBookmarks = useBookmarkStore((s) => s.bookmarks);
const scrollToBookmarkId = useBookmarkStore((s) => s.scrollToBookmarkId);
const setScrollToBookmarkId = useBookmarkStore((s) => s.setScrollToBookmarkId);
const getBookmarkById = useBookmarkStore((s) => s.getBookmarkById);

const [showBookmarkList, setShowBookmarkList] = useState(false);
const chapterBookmarkCount = currentChapter
  ? allBookmarks.filter((b) => b.chapterId === currentChapter.id).length
  : 0;

// —— 书签跳转：命令字段的一次性消费 ——
useEffect(() => {
  if (!scrollToBookmarkId || !scrollHostRef.current) return;

  const bookmark = getBookmarkById(scrollToBookmarkId);
  if (!bookmark) {
    setScrollToBookmarkId(null);   // 书签已被删：静默退出
    return;
  }

  const element = pairRefs.current.get(bookmark.pairId);
  if (element) {
    handleSelectPair(bookmark.pairId);          // 选中该句 → 练习面板随之打开
    requestAnimationFrame(() => {
      scrollPairToCenter(bookmark.pairId);      // DOM 就绪后再滚动居中
    });
  }
  setScrollToBookmarkId(null);                  // 消费完立即复位（命令模式）
}, [scrollToBookmarkId, getBookmarkById, setScrollToBookmarkId, scrollPairToCenter]);

// —— 划选与点击的互斥：划选收尾的 click 不关面板不清选中 ——
const handleReadingAreaClick = (e: React.MouseEvent) => {
  if (hasJustSelected()) return;
  if (selectedPairId && e.target === e.currentTarget) {
    setSelectedPairId(null);
  }
  clearSelection();
};
```

渲染区追加（M6 的浮动按钮旁）：

```tsx
{/* 划选弹层：挂在布局末尾 */}
{selection && currentChapter && (
  <SelectionPopover
    selection={selection}
    chapterId={currentChapter.id}
    onClose={clearSelection}
  />
)}

{/* 书签按钮：右下角，带本章书签数徽标 */}
<button
  onClick={() => setShowBookmarkList((v) => !v)}
  className="fixed bottom-6 right-6 p-3 rounded-full shadow-lg z-40 transition-all hover:scale-105"
  style={{
    right: floatingButtonRight,   // 沿用朗读按钮的浮动定位（练习面板打开时让位）
    backgroundColor: 'var(--bg-paper)',
    border: '1px solid var(--border-light)',
    color: showBookmarkList ? 'var(--accent-primary)' : 'var(--ink-muted)',
  }}
  title="书签列表"
>
  <div className="relative">
    <FiBookmark size={20} />
    {chapterBookmarkCount > 0 && (
      <span
        className="absolute -top-2 -right-2 text-[10px] leading-none px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--bg-paper)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {chapterBookmarkCount}
      </span>
    )}
  </div>
</button>

{/* 书签列表浮层 */}
{showBookmarkList && (
  <div
    className="fixed bottom-20 right-6 w-72 max-h-80 rounded-lg shadow-xl z-40 animate-slide-up"
    style={{
      right: floatingButtonRight,
      backgroundColor: 'var(--bg-paper)',
      border: '1px solid var(--border-light)',
    }}
  >
    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
      <h3
        className="text-sm font-medium"
        style={{
          fontFamily: 'var(--font-ui)',
          color: 'var(--ink-primary)',
          letterSpacing: '0.08em',
        }}
      >
        书签列表
      </h3>
    </div>
    <BookmarkList onClose={() => setShowBookmarkList(false)} />
  </div>
)}
```

**讲解：** 跳转链路完整画一遍：**BookmarkList 点击 → `setScrollToBookmarkId(id)` → ReadingView 的 effect 醒来 → `getBookmarkById` 查书签 → `pairRefs.current.get(pairId)` 拿卡片 DOM → `handleSelectPair` 选中（练习面板打开）→ `requestAnimationFrame` 后 `scrollPairToCenter` 滚动居中 → 命令字段复位**。用 rAF 是因为选中态改变会触发重渲染，等一帧保证卡片已就位。`handleReadingAreaClick` 的 `hasJustSelected()` 守卫是关键体验细节：划选文字的 mouseup 后面跟着一次 click，没有这个守卫，划选会立刻被当成「点击空白处」清掉选中态。卡片本身的 `handleClick` 另有一个 `window.getSelection()?.toString()` 守卫——划选存在时不触发选中，两条防线互补。

**验证（行为级，`pnpm dev` 后逐条过）：**
- 卡片内划选一段文字松开鼠标 → 六色工具条出现在选区正下方；跨两行划选定位依然正确
- 点红色 → 原文对应文字立即红底 + 红下划线高亮；刷新页面 → 高亮与书签仍在（localStorage 里有 `baku-yomi-bookmarks`）
- 同一句划选两段不同文字分别着色 → 两条高亮同时正确显示、互不覆盖错位
- **从右往左反向划选** → 创建的书签偏移依然正确（高亮位置与划选内容一致）
- 从第一张卡片拖到第二张卡片 → 不弹工具条（跨卡片划选被丢弃）
- 划选后点击空白 → 不误关练习面板、不误清选中态
- 右下角书签按钮出现本章书签数徽标；点击弹出列表，条目显示颜色标识 + 划选文字 + 所在句前 30 字预览
- 点击列表条目 → 列表收起、对应句对选中（右侧面板打开）、滚动到该句垂直居中
- 悬停条目删除按钮浮现；删除后高亮即时消失；删掉后再点该列表条目不报错（静默退出）
- 有书签的句子切换注音开关：高亮切片不依赖注音状态，正常共存

## 收尾验收清单

- [ ] 划选 → 六色工具条定位正确（跨行、反向划选都正确）
- [ ] 创建书签 → 高亮即时回显；刷新后仍在（localStorage 键 `baku-yomi-bookmarks`）
- [ ] 同一句多条不同颜色书签同时高亮、互不覆盖错位
- [ ] 书签按钮徽标计数正确；点击列表条目滚动居中且练习面板打开
- [ ] 删除书签 → 高亮消失；已删书签的列表点击不报错（静默退出）
- [ ] 划选不误触练习面板、不误清选中态；跨卡片划选不弹层
- [ ] 高亮与注音显示共存；空态显示「选中文字添加书签」引导
- [ ] 能画出「列表点击 → store 命令字段 → ReadingView effect → 卡片 DOM → 滚动居中」的完整链路
- [ ] 能说出：为什么偏移坐标基于 `pair.japanese` 纯文本 / 为什么高亮按 endOffset 从后往前切片 / 为什么监听 mouseup 而不是 selectionchange

## 与最终代码的差异复盘

1. `bookmarkSlice`——最终版多一个 `updateBookmarkColor` action（颜色管理的 UI 入口最终版也没接，action 先就绪）；`scrollToBookmarkId` 会被 persist 一起序列化（瞬态字段无害但不优雅，可用 `partialize` 排除——最终版也没做，可当改进点）。
2. `SentencePairCard`——本卡只加了高亮分支；M8 还会加 TTS 播放按钮与迷你进度条（`subscribeVoicevoxPlayback` 订阅）。`JapaneseText` 的书签分支到最终版不变。
3. `ReadingView`——本卡新增的跳转 effect 与弹层在最终版不变；M8 会在此基础上接连续朗读（`subscribeVoicevoxEnded`）与预取。
4. 全部组件类名（`app-mini-action`、`reader-sentence-card` 等）在最终版由 index.css 提供——本卡先保证结构与行为，样式在 M10 主题里程碑统一收口（类名已按最终命名写，届时对照最终 index.css 补 CSS 即可）。

## 设计注记（历史弯路）

- **书签系统被完全重写过一次**（19368db → 227d7dc）：初版是「颜色选择器 + 独立书签管理列表」的完整 UI（选中句子后从面板选色、书签集中管理），被推倒重做成「划选即弹六色工具条 + 高亮内联回显」。重写的核心理由：划选高亮的**视觉即时反馈**比管理界面重要得多——书签的价值在阅读现场，不在管理页。复刻时直接做划选版，别走初版弯路。
- **划选误触练习面板**（41b5709 修复）：初版没有 `justSelectedRef` 标记，划选收尾的 click 会触发卡片取消选中/面板关闭，体验割裂。本卡的 `hasJustSelected()` 守卫就是这个修复的最终形态。
- **划选滚动豁免**（0ea6ac1）：划选过程中触发滚动居中会打断文本选择，最终版用 `skipNextScrollRef` 豁免鼠标点击触发的自动滚动——M6 已建该机制，本卡的选择互斥逻辑与它互补。
- **hover 编辑被弃用**（bc96407）：早期想用「悬停句子直接编辑」的隐藏交互，后来全部改成**显式按钮**。书签删除按钮「默认隐藏、悬停浮现」是折中：显式可发现、不占空间。
- 阅读进度「双层记忆」（024b8d5，M3）里的 `scrollToPairId` 命令字段，是书签 `scrollToBookmarkId` 的直接先例——「一次性命令」这个模式在项目里出现两次，说明它是 Zustand 跨组件协作的成熟答案。

## 下一步

进入 [M8 · TTS 朗读](./M08-tts.md)——给句子装上声音：服务端双引擎、双层缓存、连续朗读。朗读与书签将共享同一个卡片与阅读容器。
