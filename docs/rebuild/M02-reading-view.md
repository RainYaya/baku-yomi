# M2 · 从零构筑：阅读视图

> 目标：把 M1 产出的 `Chapter.pairs` 渲染成可读、可交互的句对卡片流——日语+中文对照、注音开关、内联编辑译文、划选不打扰。M1 的临时列表视图到此退役。
> 关联课程：L16（ReadingView 精读）、L13（ruby 净化与 XSS 边界）、L12（句段结构来源）、L04（React 基础）。
> 前置：完成 M1（能导入一本书并看到句对列表）。

## 构筑总览（本里程碑结束时的项目结构）

```
src/
├── components/reader/
│   ├── ReadingView.tsx       # 阅读主视图：卡片流 + 选中 + 注音开关 + 内联编辑区
│   └── SentencePairCard.tsx  # 句对卡片：注音渲染 + 划选豁免 + ref 登记
├── components/import/
│   └── EpubUploader.tsx      # M1 的，继续用
└── App.tsx                   # 持有 book/chapterIndex 局部状态，按有无书切换视图
```

> 说明：M2 继续用**局部状态**——`book`/`chapterIndex` 在 App、`selectedPairId`/`showFurigana` 在 ReadingView。M3 才引入 Zustand 把书/进度/偏好迁进 store，本阶段不要提前建 store。
> **最终差异说明**：真实 `ReadingView` 有 546 行、8 个 useRef、6 个 useCallback、8 个 effect——TTS 连续朗读（M8）、键盘导航（M6）、书签（M7）、练习面板（M5）都还没长出来。本阶段它只有「渲染 + 选中 + 编辑」三件事，刻意保持小。

---

## Step 1 · SentencePairCard.tsx：句对卡片组件

先建子组件。一张卡 = 日语原文（大字号）+ 中文译文（缩进弱化、无译文不渲染）。日语文本区是**独立子组件** `JapaneseText`——渲染安全与注音开关都收在这一层。

**`src/components/reader/SentencePairCard.tsx`（M2 版）：**

```tsx
import { forwardRef } from 'react';
import type { SentencePair as SentencePairType } from '../../types';

interface Props {
  pair: SentencePairType;
  showFurigana: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function JapaneseText({
  pair,
  showFurigana,
  className,
  style,
}: {
  pair: SentencePairType;
  showFurigana: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  // 渲染优先级（三档，M7 的书签高亮会插到最前面）：
  // 1. 书签 <mark> 高亮（M7 加）
  // 2. 注音开启且有 japaneseHtml → 渲染净化 HTML
  // 3. 纯文本
  const renderedContent = (() => {
    if (showFurigana && pair.japaneseHtml) {
      return <span dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }} />;
    }
    return pair.japanese;
  })();

  return (
    <p className={className} style={style}>
      {renderedContent}
    </p>
  );
}

export const SentencePairCard = forwardRef<HTMLElement, Props>(function SentencePairCard(
  { pair, showFurigana, isSelected, onSelect },
  ref
) {
  const hasChinese = pair.chinese.trim().length > 0;

  const handleClick = () => {
    // 划选文字时不触发选中（M7 的书签划选依赖同一道闸）
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText) return;
    onSelect();
  };

  return (
    <article
      ref={ref}
      data-pair-id={pair.id}
      className="reader-sentence-card"
      style={{
        borderBottom: '1px solid var(--border-light)',
        padding: '1.25rem 0',
        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
      }}
      onClick={handleClick}
    >
      {isSelected && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />
      )}

      <div className="reader-sentence-text">
        <JapaneseText
          pair={pair}
          showFurigana={showFurigana}
          className="text-reading mb-2"
          style={{ lineHeight: '1.9' }}
        />

        {hasChinese && (
          <div style={{ paddingLeft: '1.25rem', borderLeft: '2px solid var(--accent-subtle)' }}>
            <p className="text-reading" style={{ fontSize: '0.9em', opacity: 0.65 }}>
              {pair.chinese}
            </p>
          </div>
        )}
      </div>
    </article>
  );
});
```

**逐行讲解：**
- `JapaneseText` 的三档优先级是**代码结构上的承诺**：书签档（M7）插到最前面，注音档中间，纯文本兜底。M2 只实现后两档，但顺序不能乱——M7 的 `<mark>` 高亮建立在 `japanese` 纯文本偏移上，若与注音 HTML 叠加会错位。
- `dangerouslySetInnerHTML={{ __html: pair.japaneseHtml }}`——React 的唯一逃生舱口，从此一字节不改地交给浏览器。安全责任在 M1 净化器（入库前已把白名单外标签全剥）；**每个渲染口都要能回答「这段 HTML 的每个字节从哪来」**——这里来自 `sanitizeRubyHtml` 的产物。中文译文和标题**绝不**走这个口（React 插值默认转义，天然安全）。
- `handleClick` 的划选豁免：`window.getSelection()?.toString().trim()` 非空说明用户在划字，`return` 不触发选中。`?.` 处理无选区返回 null 的情况。这是 M2 的「初始处理」，M7 会加第二道闸（父组件 `hasJustSelected()` 标记）。
- `forwardRef` + `data-pair-id`：把卡片根节点 `<article>` 的引用交回父组件，登记进 `ReadingView` 的 Map——M6 的 j/k 导航与居中滚动、M7 的划选定位都靠它。ref 回调在挂载时收到节点、卸载时收到 null。
- `isSelected` 是**从父组件传来的 prop**（对比得出），卡片自己不存选中态——数据归父组件、渲染归卡片。
- 选中视觉：背景色 + 左侧高亮竖条。颜色全用 `var(--...)` 主题变量——M10 主题系统的前置纪律（M10 前这些变量未定义，样式静默不生效但不报错，结构先行）。
- `hasChinese` 用 `trim()` 判断：M1 单语降级产出的 `chinese: ''` 不渲染中文区。

**验证：** `pnpm dev` 后组件暂未被引用也能编译通过（`npx tsc -b` 无报错）。

---

## Step 2 · ReadingView.tsx：卡片流 + 选中 + 空态（并接入 App）

阅读主视图：章节切换条（M9 会换成 Sidebar 目录）+ 注音开关按钮 + 卡片列表 + 选中逻辑 + 空态判断。

**`src/components/reader/ReadingView.tsx`（M2 版）：**

```tsx
import { useState } from 'react';
import type { Book } from '../../types';
import { SentencePairCard } from './SentencePairCard';

interface Props {
  book: Book;
  chapterIndex: number;
  onChapterChange: (index: number) => void;
  onUpdateChinese: (pairId: string, chinese: string) => void;
}

export function ReadingView({ book, chapterIndex, onChapterChange, onUpdateChinese }: Props) {
  const chapter = book.chapters[chapterIndex];

  // M2 用局部状态：注音开关（M3 迁入 settingsSlice）、选中句（M3 保持组件内）
  const [showFurigana, setShowFurigana] = useState(true);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);

  if (!chapter) {
    return <div className="text-reading opacity-50">没有可显示的章节</div>;
  }

  return (
    <div className="reader-layout">
      <div className="reader-toolbar">
        <select
          value={chapterIndex}
          onChange={(e) => {
            setSelectedPairId(null); // 切章副作用：重置选中
            onChapterChange(Number(e.target.value));
          }}
        >
          {book.chapters.map((ch, i) => (
            <option key={ch.id} value={i}>
              {ch.title}
            </option>
          ))}
        </select>
        <button onClick={() => setShowFurigana((v) => !v)}>
          {showFurigana ? '隐藏注音' : '显示注音'}
        </button>
      </div>

      <div className="reader-stage">
        {chapter.pairs.map((pair) => (
          <SentencePairCard
            key={pair.id}
            pair={pair}
            showFurigana={showFurigana}
            isSelected={selectedPairId === pair.id}
            onSelect={() => setSelectedPairId(pair.id === selectedPairId ? null : pair.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

**逐行讲解：**
- **选中只存 id 不存对象**：`selectedPairId` 是「哪个句对被选中」的唯一事实来源；选中句的完整对象（Step 4 的编辑区需要）在渲染期由 id 从 `pairs` 里 `find` 推导，不另存一份 state——否则两份状态互相打架（同步问题）。
- 选中逻辑是**唯一入口**：`setSelectedPairId(pair.id === selectedPairId ? null : pair.id)`——点中切换、再点取消。这个「切换式」选中在 M6 会被 `handleSelectPair` 收口（要同时维护「上次选中」ref 供 j/k 导航），本阶段先保持简单。
- 切章副作用：select 的 `onChange` 里先 `setSelectedPairId(null)`——旧章的选中不能残留到新章（M2 需求 8）。M3 会把进度恢复/记录做成 effect 挂到章节变化上（本阶段的 select onChange 手动清理届时被 effect 取代）。
- 空态：M2 的 ReadingView 假设有书（App 判断过），但章号可能越界——返回提示文案。
- 注音开关 state 放 ReadingView：M3 迁进 settingsSlice 时只改一处（`useState` → `useSettingsStore` selector），其余不动。
- `key={pair.id}`：M1 的复用纪律，切章/刷新时 React 只更新变化的部分。

**接入 App（`src/App.tsx` M2 版）：**

```tsx
import { useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { EpubUploader } from './components/import/EpubUploader';
import { ReadingView } from './components/reader/ReadingView';
import type { Book } from './types';

export default function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);

  const handleUpdateChinese = (pairId: string, chinese: string) => {
    setBook((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chapters: prev.chapters.map((ch) => ({
          ...ch,
          pairs: ch.pairs.map((p) => (p.id === pairId ? { ...p, chinese } : p)),
        })),
      };
    });
  };

  return (
    <MainLayout>
      {book ? (
        <ReadingView
          book={book}
          chapterIndex={chapterIndex}
          onChapterChange={setChapterIndex}
          onUpdateChinese={handleUpdateChinese}
        />
      ) : (
        <EpubUploader onImported={(b) => { setBook(b); setChapterIndex(0); }} />
      )}
    </MainLayout>
  );
}
```

**讲解：** M1 的临时列表被 `ReadingView` 整段替换；`handleUpdateChinese` 是 M1 列表的编辑能力占位——三层 map 不可变更新（books → chapters → pairs），这正是 M3 `bookSlice.updatePairChinese` 的原型（M3 直接把这四行搬进 store 的 action）。注意这里已经用了**不可变更新纪律**（`...prev` 逐层造新引用）——M3 讲引用比较原理时你会理解为什么必须这样写。

**验证：** `pnpm dev` → 导入书 → 自动进入阅读页，卡片按序渲染；切章下拉切换章节，卡片流正确刷新；点卡片选中/再点取消。

---

## Step 3 · 注音开关：显示 / 隐藏 ruby

开关的 state 在 ReadingView（Step 2 已有），渲染分支在 `JapaneseText`（Step 1 已有）。本步把它们串起来讲透。

**数据流：** `showFurigana`（ReadingView state）→ 作为 prop 传给每张卡 → `JapaneseText` 的 `renderedContent` 二选一：

```
showFurigana && pair.japaneseHtml ? <span dangerouslySetInnerHTML=...>  ← 注音档
                                  : pair.japanese                        ← 纯文本档
```

**要点：**
- 切换即时生效、无闪烁、无重挂载：因为 `JapaneseText` 是纯渲染组件，state 一变 React 重渲，`dangerouslySetInnerHTML` 的输出随 prop 走。注音 HTML 来自 M1 净化器，`<ruby>` 是合法标签，浏览器原生排版注音（rt 自动浮到基线之上）。
- 无 `japaneseHtml` 的句子（没注音的书）两种状态下渲染相同——`&&` 短路保证。
- 为什么 M7 的书签档必须插在注音档**之前**：书签 `<mark>` 是建立在 `japanese` 纯文本上的偏移切片，与注音 HTML 叠加会错位。代码里用「注释 + if 链」预留了位置。

**验证：** 读一本含注音的书 → 点「隐藏注音」→ 所有卡片的注音立即消失、纯文本无变化；点「显示注音」→ 恢复；无 ruby 的句子两种状态都不变。

---

## Step 4 · 内联编辑译文：受控输入，草稿本地化

选中句子后出现编辑区：显式「编辑」→ 受控 textarea（草稿存本地 state）→「保存」写回 →「取消」丢弃草稿。**输入过程不写全局数据**——取消必须能完整还原。真实历史教训：hover 浮现编辑按钮的方案（bc96407）被整个废弃，显式按钮 + 受控输入的确定性高得多。

**在 ReadingView 文件末尾追加（M2 版）：**

```tsx
function PairEditor({
  pair,
  onSave,
  onClose,
}: {
  pair: SentencePairType;
  onSave: (chinese: string) => void;
  onClose: () => void;
}) {
  // 草稿本地化：输入过程不提交，保存才写全局
  const [draft, setDraft] = useState(pair.chinese);

  return (
    <div className="pair-editor">
      <h3>编辑译文</h3>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />
      <div>
        <button onClick={() => onSave(draft.trim())}>保存</button>
        <button onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
```

**先在函数体里加一行派生（选中句对象由 id 推导）：**

```tsx
  // 派生数据不进 state：选中句对象由 id 在渲染期推导
  const selectedPair = chapter?.pairs.find((p) => p.id === selectedPairId) ?? null;
```

**再在 ReadingView 的 JSX 末尾（`</div>` 之前）加渲染：**

```tsx
      {selectedPair && (
        <PairEditor
          pair={selectedPair}
          onSave={(chinese) => {
            onUpdateChinese(selectedPair.id, chinese);
            setSelectedPairId(null);
          }}
          onClose={() => setSelectedPairId(null)}
        />
      )}
```

**逐行讲解：**
- `useState(pair.chinese)` 初始化草稿——进入编辑态那一刻的译文快照；`value={draft}` + `onChange` 全走草稿，**textarea 是受控的**（键盘逐字验证：输入 → 草稿变 → 界面变，但全局 book 未动）。
- 保存：`onSave(draft.trim())` → App 的 `handleUpdateChinese` 不可变更新 → 卡片中文立即变；保存后 `setSelectedPairId(null)` 退出编辑态。
- 取消：`onClose` 直接丢弃草稿（不写任何东西）——因为全局从没被碰过，「还原」天然成立。
- Esc 退出编辑态：草稿丢弃，行为与取消一致（M2 验收项「要一致且无报错」）。
- 本阶段 `PairEditor` 内联在 ReadingView 文件里；M5 会把它抽成 `PracticePanel.tsx`（加 AI 分析、回译练习），差异复盘里再说。

**验证：** 选中句子 → 编辑 → 保存：卡片中文立即更新；编辑 → 取消：卡片不变；输入过程中开 DevTools 看（M3 才有 store，现在可确认的是 App 的 book state 在输入期间不变——通过「取消后原文恢复」间接验证）。

---

## Step 5 · 划选不触发面板的初始处理

用户在句子上划选文字（准备查词/以后做书签）时，**不得**触发卡片选中。M2 先做第一道闸（卡片内判空），M7 会加第二道闸（父组件 `hasJustSelected()`）。

**闸 1（Step 1 已写好，本步拆解）：**

```tsx
const handleClick = () => {
  const selectedText = window.getSelection()?.toString().trim();
  if (selectedText) return;   // 有选区 → 这是划选手势，不是点击手势
  onSelect();
};
```

**要点：**
- `getSelection()` 返回当前浏览器选区；`.trim()` 把「划了但内容纯空白」也归入划选（`<p>　</p>` 全角空格场景）。
- `?.` 防 null：无任何选区时 `getSelection()` 返回空 Selection 对象而非 null（跨元素选区/iframe 场景有边界差异，`.toString()` 的 `trim` 是统一出口）。
- 点击卡片内的播放按钮等子元素时不选中——M2 卡片还没有内部按钮，但 M5/M8 会加，届时用 `stopPropagation` 在按钮容器上拦截；M2 的 `handleClick` 在 `<article>` 上，冒泡天然经过它，所以子按钮必须显式挡。
- 划选后的程序化滚动豁免（真实坑 0ea6ac1）：M2 还没有滚动逻辑，M6 加居中滚动时要用一次性 ref 标记跳过——先记住这个坑。

**验证：** 在句子上拖选一段文字 → 卡片不选中、无高亮变化；紧接着点一下（无选区）→ 正常选中；选中状态下再划选 → 取消选中不触发。

---

## 收尾验收清单

- [ ] 导入书后自动进入阅读页，卡片按序渲染，日语+中文对照清晰；无中文的句子只显示日语
- [ ] 点击卡片选中（背景/竖条高亮），再点取消；切章后旧章的选中不残留
- [ ] 打开注音开关：含 ruby 的句子立即出现注音；关闭立即消失；无 ruby 的句子两种状态不变
- [ ] 用含 `<script>`、`<img onerror=...>` 恶意内容导入：阅读页不执行任何脚本、无报错（M1 净化生效）
- [ ] 选中句子 → 编辑 → 保存：卡片中文立即更新；编辑 → 取消：卡片不变
- [ ] textarea 是受控的（键盘逐字输入验证）；输入过程不写全局数据
- [ ] 划选文字不选中卡片；划选结束后紧接着的无选区点击行为正常
- [ ] 未导入书时显示导入入口；导入后自动进入阅读视图
- [ ] 反复开关注音、连续切换章节：无控制台报错
- [ ] 日语文本渲染结构为书签高亮预留了三档优先级（书签 > 注音 > 纯文本）
- [ ] 能说出 `selectedPair` 为什么不放进 state（派生 vs 状态）
- [ ] 能指出代码里所有 `dangerouslySetInnerHTML` 的位置，并说出输入来源（净化产物）
- [ ] 用含 `<b>`/`<i>` 标签的书导入：标签不生效、文字照常显示（净化剥壳）
- [ ] 编辑时按 Esc 退出编辑态，行为一致、无报错
- [ ] 刷新后回到初始态（本卡不要求持久化，但不报错）

## 与最终代码的差异复盘

1. `ReadingView.tsx`——最终版 546 行，本阶段只有「渲染 + 选中 + 编辑」三件事。后续生长：M3 加进度恢复与滚动监听（store 化）、M6 加 j/k 导航与 `scrollPairToCenter`（`pairRefs` Map 已在本卡铺好）、M7 加书签跳转与选区 popover、M8 加 TTS 控件与连续朗读、M5 的 `PracticePanel` 替换本卡的内联 `PairEditor`。**组件生长靠「等需求出现」，不要预先拆碎。**
2. `SentencePairCard.tsx`——最终版 `JapaneseText` 用 `useMemo` + 从 `useSettingsStore` 直接读 `showFurigana`（M3 迁移时 prop 变 store 订阅）；多了书签 `<mark>` 渲染档（M7）和迷你音频按钮（M8）；`forwardRef` 的 ref 类型从 `HTMLElement` 保持到最终版。
3. `App.tsx`——M3 从 `useBookStore` 读 `currentBook`（props 全删）；M9 按 `uiSlice.currentView` 切换书架/阅读视图；`handleUpdateChinese` 的不可变更新逻辑**原样搬进** `bookSlice.updatePairChinese`。
4. `PairEditor`——最终版不存在这个文件：M5 抽成 `PracticePanel.tsx`（practiceSlice + AI 分析 + 回译练习），本卡的编辑区是其最小雏形。迁移时把草稿 state 逻辑原样带走。
5. 注音开关——M3 迁进 `settingsSlice.showFurigana`（persist 持久化）；M4 后设置面板（SettingsModal）提供正式 UI 入口。
6. 划选豁免——最终版是两道闸：本卡的 `getSelection` 判空 + M7 `useTextSelection` 的 `hasJustSelected()`（划选后紧接着的点击也豁免，且划选后的程序化滚动用 `skipNextScrollRef` 跳过——0ea6ac1 的教训）。

## 设计注记（历史弯路）

- 译文编辑最早是「hover 卡片时浮现编辑按钮」（bc96407），整个废弃，改成显式「编辑」按钮 + 受控 textarea。hover 态在触屏、划选、键盘导航下都不可靠——复刻直接做后者。
- 右侧面板迭代过三轮：常驻（38662cb）→ 不用时隐藏（d940bdd）→ 只留 fade-in（6711b27）。每轮都在删视觉噪音；最终形态是「选中才出现」。M2 的编辑区就是「选中才出现」的雏形，不用走前两轮弯路。
- 早期有独立的 `SentencePair.tsx`（269 行）与 `useKeyboardShortcuts.ts`（134 行），被 1d25db3 清理删除——逻辑收敛进 `SentencePairCard` 与 `ReadingView` 内联。死代码不删，就会变成下一个阅读者「为什么有两份」的困惑来源。
- 划选与滚动打架是真实踩过的坑（0ea6ac1）：拖选文字时选中回调抢走滚动位置。M6 加滚动居中时记得用一次性 ref 豁免。
- 阅读页最终是 500+ 行的「大组件」，但内部有清晰的资产清单（6 useState / 8 useRef / 6 useCallback / 8 effect）。拆分的时机是「等重复出现」而不是「预先拆碎」——本卡只做三件事，为后面几卡留自然生长位置。

## 下一步

进入 [M3 · 状态持久化与阅读进度](./M03-persistence.md)：让书与进度活过刷新——Zustand 拆分 store + persist 到 localStorage，记录并恢复阅读进度。
