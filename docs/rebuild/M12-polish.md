# M12 · 从零构筑：首次运行引导与收尾打磨

> 目标：把「能用的应用」打磨成「能交付的产品」。两件事——新用户第一次打开不被界面吓到（markdown 驱动的 WelcomeGuide），以及把一路快跑留下的边角修稳（三处防御性修复），最后做一次全链路回归，和真实仓库做最终对比。
> 关联课程：L30（毕业项目——本卡借它的回归清单方法论，不借它的 generateObject 改造）。
> 前置：M11 完成（Docker 部署可跑通，回归清单里会用）；`react-icons` 已在依赖里（M9 书架页用过）。

## 构筑总览（本里程碑结束时新增/改动的文件）

```
baku-yomi/
├── docs/
│   └── welcome-guide.md          # 新增：引导内容（纯 markdown，产品文案与代码分离）
└── src/
    ├── App.tsx                   # 改动：挂载 <WelcomeGuide />（与 SettingsModal 并列）
    ├── index.css                 # 改动：welcome-guide 全套样式（~170 行）
    ├── components/onboarding/
    │   └── WelcomeGuide.tsx      # 新增：markdown 解析器 + 首次运行弹窗
    ├── components/reader/
    │   └── ReadingView.tsx       # 改动：划选滚动豁免 + 进度写入越界防护
    ├── stores/bookSlice.ts       # 改动：setCurrentChapter 越界校验
    └── components/bookshelf/
        └── BookCard.tsx          # 改动：进度显示钳制（calcProgressPct）
```

**最终差异说明：** WelcomeGuide 与真实仓库（commit `6b06e65`）逐字一致——这是本卡唯一的「照抄最终实现」部分；三处防御性修复中，划选滚动豁免（`0ea6ac1`）也是真实代码，而**进度钳制与越界校验本卡做了比真实仓库更早的拦截**（真实仓库靠显示层钳制与 `?? null` 兜底），差异在 Step 3/4 与复盘里逐条讲清。全链路回归清单是 L30 毕业要求的浓缩版。

---

## Step 1 · WelcomeGuide：markdown 驱动的首次运行引导

**设计决策先行：为什么内容用 markdown？** 引导文案是产品文案，改文案的频率远高于改代码。把内容放进 `docs/welcome-guide.md`、用 `?raw` 导入为字符串、运行时解析渲染——**改文案不碰组件**，不会改坏弹窗逻辑。这是「内容与代码分离」的最小落地形态。

**`docs/welcome-guide.md`**（新增，完整文件）：

```markdown
# 第一次打开时，先记住这几件事

这不是一个必须先把所有配置都填完，才能开始用的工具。
你可以先导入、先读、先练，再慢慢补齐译文、AI 和 TTS。

## 导入什么样的书

- 最理想的是经过"沉浸式翻译"浏览器插件处理过的双语 EPUB。
- 这类书一般会保留日文原文和对应中文，所以导入后体验最好。
- 现在也支持单语小说 EPUB；如果书里没有中文，导入后中文位会留空，不会影响阅读和练习。

> 如果你想得到最完整的双语阅读体验，优先选择由沉浸式翻译生成的双语 EPUB。

## 阅读时最重要的操作

- 用 `j / k` 在句子之间移动。
- 正文会尽量围绕当前句子保持中心，方便连续阅读。
- 选中一句后，按 `gi` 可以直接跳到右侧输入区。
- 按 `Esc` 可以退出输入，或者取消当前句子选中。

> 如果你更习惯鼠标，也可以直接点击句子进入练习面板。

## 右侧练习面板是做什么的

- 点击任意句子，会在右侧打开你的练习工作台。
- 你可以补译文、写自己的回译、拿提示、看分析结果。
- 就算导入的是单语书，也可以在这里一步步把译文补出来。

> 不需要先准备一份完美双语文本，练习可以从空白译文开始。

## 主题和快捷键

- 顶部可以切换主题，默认主题现在是 Snow。
- 快捷键 `N / M / D / S / R / W` 可以切换主题。
- 但在阅读页里，`R` 会优先用于连续朗读，所以如果没切到雨天主题，这是正常的。

> 主题切换最稳妥的方式还是顶部指示器。
```

注意这份文案本身就是**产品文档**：它在告诉新用户「可以先用起来，配置后补」「R 键冲突是设计不是 bug」——写引导文案时心里要有「第一次打开的人」。

**`src/components/onboarding/WelcomeGuide.tsx`**（新增，完整文件——与最终实现一致）：

```tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FiBookOpen, FiFeather, FiLayers, FiMoon, FiX } from 'react-icons/fi';
import guideMarkdown from '../../../docs/welcome-guide.md?raw';

const GUIDE_STORAGE_KEY = 'baku-yomi-welcome-guide-seen-v1';

type GuideSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
  notes: string[];
};

type ParsedGuide = {
  title: string;
  intro: string[];
  sections: GuideSection[];
};

function appendParagraph(target: string[], line: string) {
  const previous = target[target.length - 1];
  if (!previous) {
    target.push(line);
    return;
  }
  target[target.length - 1] = `${previous} ${line}`;
}

function parseGuide(markdown: string): ParsedGuide {
  const lines = markdown.split(/\r?\n/);
  const intro: string[] = [];
  const sections: GuideSection[] = [];
  let title = '欢迎来到 Baku-yomi';
  let currentSection: GuideSection | null = null;

  const commitSection = () => {
    if (currentSection) {
      sections.push(currentSection);
      currentSection = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ')) {
      commitSection();
      currentSection = { title: line.slice(3).trim(), paragraphs: [], bullets: [], notes: [] };
      continue;
    }
    if (line.startsWith('- ')) {
      if (currentSection) currentSection.bullets.push(line.slice(2).trim());
      else intro.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith('> ')) {
      if (currentSection) currentSection.notes.push(line.slice(2).trim());
      else appendParagraph(intro, line.slice(2).trim());
      continue;
    }
    if (currentSection) appendParagraph(currentSection.paragraphs, line);
    else appendParagraph(intro, line);
  }

  commitSection();

  return { title, intro, sections };
}

function getSectionEyebrow(title: string): string {
  if (title.includes('导入')) return 'Import';
  if (title.includes('阅读') || title.includes('操作')) return 'Navigate';
  if (title.includes('练习')) return 'Practice';
  if (title.includes('主题') || title.includes('快捷键')) return 'Atmosphere';
  return 'Guide';
}

function getSectionIcon(title: string): ReactNode {
  if (title.includes('导入')) return <FiBookOpen size={18} />;
  if (title.includes('阅读') || title.includes('操作')) return <FiFeather size={18} />;
  if (title.includes('练习')) return <FiLayers size={18} />;
  return <FiMoon size={18} />;
}

export function WelcomeGuide() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const guide = useMemo(() => parseGuide(guideMarkdown), []);

  const dismissGuide = useCallback(() => {
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage write failures and just close the guide.
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(GUIDE_STORAGE_KEY);
      setOpen(seen !== 'true');
    } catch {
      setOpen(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissGuide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismissGuide, open]);

  if (!ready || !open) {
    return null;
  }

  return (
    <div className="welcome-guide-overlay" onClick={dismissGuide}>
      <section
        className="welcome-guide-dialog animate-fade-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-guide-title"
      >
        <div className="welcome-guide-header">
          <div className="welcome-guide-kicker">First Session</div>
          <button type="button" className="welcome-guide-close" onClick={dismissGuide} aria-label="关闭首次指南">
            <FiX size={16} />
          </button>
        </div>

        <div className="welcome-guide-hero">
          <p className="welcome-guide-brand">BAKU-YOMI</p>
          <h2 id="welcome-guide-title" className="welcome-guide-title">
            {guide.title}
          </h2>
          <div className="welcome-guide-copy-stack">
            {guide.intro.map((paragraph) => (
              <p key={paragraph} className="welcome-guide-copy">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="welcome-guide-grid">
          {guide.sections.map((section) => (
            <article key={section.title} className="welcome-guide-card">
              <div className="welcome-guide-card-top">
                <span className="welcome-guide-icon">{getSectionIcon(section.title)}</span>
                <span className="welcome-guide-eyebrow">{getSectionEyebrow(section.title)}</span>
              </div>
              <h3 className="welcome-guide-card-title">{section.title}</h3>

              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="welcome-guide-card-body">{paragraph}</p>
              ))}

              {section.bullets.length > 0 ? (
                <ul className="welcome-guide-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}

              {section.notes.map((note) => (
                <p key={note} className="welcome-guide-meta">{note}</p>
              ))}
            </article>
          ))}
        </div>

        <div className="welcome-guide-footer">
          <p className="welcome-guide-footnote">以后你只需要编辑 `docs/welcome-guide.md`，这里的内容就会一起变。</p>
          <button type="button" className="btn btn-primary welcome-guide-action" onClick={dismissGuide}>
            开始使用
          </button>
        </div>
      </section>
    </div>
  );
}
```

**逐段讲解：**

- **`import guideMarkdown from '../../../docs/welcome-guide.md?raw'`——Vite 的 `?raw` 后缀**把文件内容作为字符串导入，不走打包管线。`tsconfig.app.json` 的 `types: ["vite/client"]`（M0 配的）为 `*?raw` 提供类型声明，无需额外 d.ts。
- **`parseGuide` 是 60 行的迷你解析器**，只认五种行：`# `、`## `、`- `、`> `、普通行。绝不引入 markdown 库——内容是自己写的、格式受控，零依赖足够。两个细节：
  - `appendParagraph` 把连续普通行**合并成一段**（空格拼接），对应 markdown「换行即同一段落」；
  - `commitSection` 在遇新 `## ` 和文件末尾时把当前 section 落盘——`currentSection` 是可变指针，`sections` 存已提交快照。
- **`useMemo(() => parseGuide(guideMarkdown), [])`**——解析只做一次；`guideMarkdown` 是编译期常量，空依赖也安全。
- **`ready` 与 `open` 双状态**：`ready` 保证 localStorage 读取完才渲染（避免首帧闪现弹窗）；`open` 是显示开关。读取包 try/catch——隐私模式下 `setItem` 抛错，读取异常默认弹窗，写入失败只静默关闭。
- **「看过一次」的语义**：`seen !== 'true'` 才弹——key 是 `baku-yomi-welcome-guide-seen-v1`，**带版本号**：将来想给老用户重新弹（如大版本更新），换 v2 即可，不清用户数据。
- **三路关闭都走 `dismissGuide`**（Escape / 遮罩 / 按钮）——单一路径保证「已读」只在真正关闭时写入。`event.stopPropagation()` 让点对话框内部不触发遮罩 onClick。
- **无障碍**：`role="dialog"` + `aria-modal` + `aria-labelledby`；装饰图标按钮带 `aria-label`。

**`src/App.tsx`**（改动后）：

```tsx
import { MainLayout } from './components/layout/MainLayout';
import { ReadingView } from './components/reader/ReadingView';
import { SettingsModal } from './components/settings/SettingsModal';
import { BookshelfPage } from './components/bookshelf/BookshelfPage';
import { WelcomeGuide } from './components/onboarding/WelcomeGuide';
import { useUIStore } from './stores/uiSlice';

export default function App() {
  const currentView = useUIStore((s) => s.currentView);

  return (
    <MainLayout>
      {currentView === 'bookshelf' ? <BookshelfPage /> : <ReadingView />}
      <WelcomeGuide />
      <SettingsModal />
    </MainLayout>
  );
}
```

挂载在 `MainLayout` 内部、视图切换之后——弹窗是覆盖层，与当前视图无关。

**CSS**（追加到 index.css 的 welcome-guide 样式段，渲染必需；单行规则与最终仓库展开格式等价）：

```css
.welcome-guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: clamp(18px, 3vw, 32px);
  background:
    radial-gradient(circle at 50% 16%, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 38%),
    color-mix(in srgb, var(--bg) 74%, transparent);
  backdrop-filter: blur(12px);
}

.welcome-guide-dialog {
  width: min(920px, 100%);
  max-height: min(92svh, 920px);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--line) 88%, var(--text) 12%);
  border-radius: 18px;
  padding: clamp(20px, 3vw, 30px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 86%, white 14%) 0%, color-mix(in srgb, var(--bg) 93%, transparent) 100%);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32), inset 0 1px 0 color-mix(in srgb, var(--text) 10%, transparent);
}

.welcome-guide-header, .welcome-guide-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.welcome-guide-header { margin-bottom: 28px; }

.welcome-guide-kicker, .welcome-guide-eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-muted); }

.welcome-guide-close { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 999px; border: 1px solid var(--border-light); background: transparent; color: var(--ink-muted); }
.welcome-guide-close:hover { border-color: var(--mid); color: var(--ink-primary); }

.welcome-guide-hero { max-width: 42rem; margin-bottom: 28px; }

.welcome-guide-brand { margin: 0 0 10px; font-size: clamp(14px, 2vw, 18px); letter-spacing: 0.3em; color: var(--accent-primary); }

.welcome-guide-title { margin: 0; font-size: clamp(2rem, 3.8vw, 3.4rem); line-height: 0.98; max-width: 12ch; }

.welcome-guide-copy { margin: 16px 0 0; max-width: 34rem; font-size: 0.98rem; color: var(--ink-secondary); }
.welcome-guide-copy-stack { display: flex; flex-direction: column; }

.welcome-guide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 26px; }

.welcome-guide-card { min-height: 188px; padding: 16px 16px 18px; border: 1px solid var(--border-light); border-radius: 14px; background: color-mix(in srgb, var(--bg) 68%, transparent); }
.welcome-guide-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }

.welcome-guide-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border-light); color: var(--accent-primary); background: color-mix(in srgb, var(--accent) 10%, transparent); }

.welcome-guide-card-title { margin: 0 0 10px; font-size: 1.02rem; line-height: 1.35; }
.welcome-guide-card-body, .welcome-guide-meta, .welcome-guide-footnote { margin: 0; color: var(--ink-secondary); }
.welcome-guide-card-body { font-size: 0.95rem; }

.welcome-guide-list { margin: 12px 0 0; padding-left: 1.1rem; color: var(--ink-secondary); display: grid; gap: 8px; }
.welcome-guide-list li::marker { color: var(--accent-primary); }
.welcome-guide-meta { margin-top: 14px; font-size: 0.84rem; color: var(--ink-muted); }

.welcome-guide-footer { padding-top: 18px; border-top: 1px solid var(--border-light); }
.welcome-guide-footnote { font-size: 0.86rem; }
.welcome-guide-action { flex-shrink: 0; }

.animate-fade-in { animation: fadeIn 0.2s ease-out; }

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**讲解：** 整套样式只引用 M10 的语义变量（`--bg`/`--accent`/`--ink-*`）——**弹窗自动跟随主题**，这是变量体系复利的又一个例子。`z-index: 70` 压在设置抽屉（60）之上；`backdrop-filter: blur(12px)` 虚化背后的书架/阅读视图，产生「模态」视觉；`max-height: min(92svh, 920px)` + `overflow: auto` 保证小屏可滚动。

**验证：** DevTools → Application → Local Storage → 删除 `baku-yomi-welcome-guide-seen-v1` → 刷新 → 弹窗出现；点「开始使用」→ 关闭且 localStorage 写入 `true`，再刷新不弹；改一行 `docs/welcome-guide.md` → 刷新 → 内容跟着变（组件零改动）。

---

## Step 2 · 防御性修复①：划选滚动豁免（真实 commit `0ea6ac1`）

**问题场景：** M6 的居中滚动（`scrollPairToCenter`）与 M7 的划选功能打架。用户在正文里**拖动鼠标选中文字**准备划书签时，选区会经过 `SentencePairCard` 的点击区域 → 触发 `onSelect` → `setSelectedPairId` → 滚动 effect 把句子滚到屏幕中央 → **选区被滚动破坏，选中的文字瞬间消失**。这不是偶发，是每次划选必现。

**解法：把「鼠标划选产生的选中」与「键盘/点击导航产生的选中」区分开，划选的那次禁止滚动。**

**`src/hooks/useTextSelection.ts`**——已有 `justSelectedRef`（M7 划选时置 true，500ms 后复位）：

```ts
justSelectedRef.current = true;
setSelection({ pairId, startOffset, endOffset, text, rect });
// 500ms 后重置标记
setTimeout(() => {
  justSelectedRef.current = false;
}, 500);
```

**`src/components/reader/ReadingView.tsx`** 三处配合（改动后）：

```tsx
const skipNextScrollRef = useRef(false);
const { selection, clearSelection, hasJustSelected } = useTextSelection();

// ① 卡片 onSelect：划选刚结束时不处理，且标记「下一次选中不要滚动」
onSelect={() => {
  if (hasJustSelected()) return;
  skipNextScrollRef.current = true;
  handleSelectPair(pair.id === selectedPairId ? null : pair.id);
}}

// ② 选中变化时的滚动 effect：被标记的那次直接跳过
useEffect(() => {
  if (!selectedPairId) return;
  if (skipNextScrollRef.current) {
    skipNextScrollRef.current = false;
    return;
  }
  scrollPairToCenter(selectedPairId);
}, [selectedPairId, scrollPairToCenter]);

// ③ 阅读区点击：划选刚结束时不走「点击空白关闭面板」逻辑
const handleReadingAreaClick = (e: React.MouseEvent) => {
  if (hasJustSelected()) return;
  if (selectedPairId && e.target === e.currentTarget) {
    setSelectedPairId(null);
  }
  clearSelection();
};
```

**逐行讲解（一套「一次性豁免」模式）：**
- **`hasJustSelected()` 是查询不是状态**——`justSelectedRef` 是真值，导出成函数读当前值。500ms 窗口覆盖「鼠标抬起 → Popover 弹出」的完整交互，窗口外点击句子照常进面板。
- **`skipNextScrollRef` 是「下一次滚动时自我消费」的标记**：onSelect 置 true，滚动 effect **读到就置回 false 并 return**——只豁免这一次，之后 j/k 导航的滚动不受影响。用 ref 不用 state：它**不需要触发渲染**，只是跨回调传递一次性标记。
- 为什么 onSelect 已有 `hasJustSelected()` 检查还要 skipNextScrollRef？两个触发源不同：划选鼠标抬起会触发 card 的 click（onSelect），**也会**触发阅读区的 click（handleReadingAreaClick）。三处各自豁免自己负责的路径，划选全程才无干扰。
- 顺带修好的隐藏 bug：划选结束前鼠标移出句子、mouseup 落在空白区，`hasJustSelected()` 让 ③ 不关闭已选中的句子——M7「划选误触面板」修复（`41b5709`）的延伸。

**验证（行为级）：** 拖动选中一段日文 → 选区保持、文字不跳动、Popover 正常弹出；选完放手点句子 → 进面板且居中；按 j/k → 居中滚动正常。三种操作互不干扰即通过。

---

## Step 3 · 防御性修复②：阅读进度精确化（写入防护 + 显示钳制）

**问题场景：** `readingProgress` 是持久化数据，存的是「chapterId → 句子序号」。它有两个隐患：写入侧——滚动监听算出的序号可能越界（滚动容器高度计算误差、极端缩放）；读取侧——老数据可能超过当前章节的句子数（书被重新导入、章节被裁剪）。两处都要兜。

**① 写入防护（`ReadingView.tsx` 的滚动跟踪 effect，改动后）：**

```tsx
// Simple scroll tracking
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

**讲解：** `handleScroll` 是滚动高频回调，`{ passive: true }` 告诉浏览器不调用 preventDefault，滚动不被阻塞。**写入前的范围检查**（`currentIndex >= 0 && < pairs.length`）是唯一的防御：越界的序号**根本不会进 store**，脏数据在源头被拦下。注意 `setReadingProgress` 本身是纯写操作（M3 建的），读侧防护在下一处。

**② 显示钳制（`BookCard.tsx` 的 `calcProgressPct`，改动后）：**

```tsx
function calcProgressPct(book: Book, readingProgress: Record<string, number>): number {
  const totalPairs = book.chapters.reduce((sum, ch) => sum + ch.pairs.length, 0);
  if (totalPairs <= 0) return 0;

  const readPairs = book.chapters.reduce((sum, ch) => {
    const idx = readingProgress[ch.id] ?? 0;
    return sum + Math.min(Math.max(idx, 0), ch.pairs.length);
  }, 0);

  return Math.round((readPairs / totalPairs) * 100);
}
```

**讲解：** 每章的已读序号用 `Math.min(Math.max(idx, 0), ch.pairs.length)` **钳制到 [0, 章内句数]** 再累加——持久化数据可能是任何值（旧版本、手改 localStorage），但进度条永远不可能超过 100% 或变成负数。`Math.round` 保证显示整数百分比。真实仓库的进度精度防线就在这一层：**数据可以是脏的，显示必须是干净的**。

**验证：** Console 里把 `localStorage` 的 `book-store` 里某章 `readingProgress` 改成 `99999` → 刷新 → 书架卡片进度条仍是 100%（不是溢出）；把该章滚动到末尾再回顶部 → `readingProgress` 被正常值覆盖（写入侧没有脏数据残留）。

---

## Step 4 · 防御性修复③：setCurrentChapter 越界校验

**问题场景：** `lastChapterIndexByBook`（M3 的双层记忆）是持久化的章节索引。如果书被重新导入、章节列表变短（新版 EPUB 合并了章节），存的是 `3` 而书只剩 `2` 章——`currentChapterIndex: 3` 会指向不存在的章节。

**方案 A（本卡采用：store 层提前拦截，改动 `bookSlice.ts`）：**

```ts
setCurrentChapter: (index) =>
  set((state) => {
    const currentBook = state.books.find((b) => b.id === state.currentBookId);
    if (!currentBook) {
      return { currentChapterIndex: index };
    }
    // 越界校验：章节列表可能比持久化的索引短（书被重新导入/合并章节）
    const clamped = Math.min(Math.max(index, 0), Math.max(0, currentBook.chapters.length - 1));
    return {
      currentChapterIndex: clamped,
      lastChapterIndexByBook: {
        ...state.lastChapterIndexByBook,
        [currentBook.id]: clamped,
      },
    };
  }),
```

**逐行讲解：** `currentBook` 不存在时原样放行（书架页还没选书，索引无意义）；有书时用 `Math.min(Math.max(index, 0), chapters.length - 1)` **双向钳制**——下限 0，上限「章数 - 1」（length 为 0 时由内层 `Math.max(0, -1)` 兜成 0）。写入 `lastChapterIndexByBook` 的也必须是钳制后的值，否则下一轮进入还会越界。

**方案 B（真实仓库的做法：消费侧兜底，不改 store）——必须理解为什么它也行：**

```ts
// bookSlice.ts 原样
getCurrentChapter: () => {
  const book = get().getCurrentBook();
  if (!book) return null;
  return book.chapters[get().currentChapterIndex] ?? null;
},
```

```tsx
// ReadingView.tsx 原样
if (!currentChapter) {
  return (
    <div className="flex items-center justify-center h-full text-reading opacity-50" style={{ color: 'var(--ink-muted)' }}>
      左侧选择章节
    </div>
  );
}
```

真实仓库不钳制索引，而是让 `getCurrentChapter` 返回 `?? null`，ReadingView 渲染「左侧选择章节」的**优雅空状态**——越界不崩溃，只显示提示。方案 B 更省代码，但把「脏索引」留在 store 里（书架排序、侧栏高亮都可能被影响）；方案 A 在源头修数据，副作用面更小。**本卡采用 A 并保留 B 兜底，两层防御。** 差异在复盘里再对一次。

**验证：** Console 里把 `book-store` 的 `lastChapterIndexByBook` 改成 `99` → 刷新 → 打开该书 → 落在最后一章而不是越界空白；侧栏当前章节高亮正常。

---

## Step 5 · 全链路回归清单（L30 方法论落地）

回归不是「到处点点」，而是**按六条业务链路逐条走**，每条都有明确的期望结果。把下面的清单保存下来，每次大改动后照着走一遍：

### 链路 1 · 导入 → 解析
- [ ] 导入沉浸式翻译双语 EPUB：句对（日/中）完整、无乱码、章节数正确
- [ ] 导入单语 EPUB：中文位留空、不报错、可正常阅读
- [ ] 封面图提取成功（书架卡片显示封面）
- [ ] 导入后自动进入阅读，`currentBookId` 与进度正确

### 链路 2 · 阅读与导航
- [ ] j/k 逐句移动，当前句始终居中（scrollPairToCenter 平滑滚动）
- [ ] `gi` 进入回译输入框、`Esc` 退出/取消选中
- [ ] 刷新页面回到章节并恢复滚动位置（双层记忆 + 滚动恢复）
- [ ] 划选文字不触发滚动、不误关面板（Step 2 的修复在真实操作下成立）

### 链路 3 · 回译与 AI
- [ ] 选中句子 → 右侧面板打开 → 回译输入 → 「获取提示」「优化译文」返回内容
- [ ] 「分析」返回评分 + 错误/优点/建议（AI Key 有效时）；无效 Key 报错文案可读而非白屏
- [ ] 分析期间按钮 loading 态、完成后可再次分析

### 链路 4 · TTS
- [ ] 阅读页按 `r` 连续朗读，逐句推进且当前句居中
- [ ] 再按 `r` 停止；切章节/离开阅读页自动停止
- [ ] 预取窗口生效（Network 里看到后续句子提前请求）；缓存命中后重复朗读无网络请求

### 链路 5 · 主题
- [ ] 六主题全切一遍：颜色过渡、粒子正确挂载/卸载（M10 验收项复跑）
- [ ] `r` 在阅读页触发朗读而非 Rain 主题（仲裁仍成立）
- [ ] 刷新后主题保持

### 链路 6 · 书签
- [ ] 划选 → 选颜色 → 高亮出现且可点击
- [ ] 书签列表展示、跳转回正确句子
- [ ] 书签跨章节/跨书持久化（刷新后仍在）

### 收尾三查
- [ ] `pnpm build` 全绿（tsc -b 严格类型检查通过）
- [ ] `docker compose up -d --build` 镜像构建成功、3003 可访问
- [ ] Console 无报错、无 React key 警告

## Step 6 · 与真实仓库对比收尾

最后一步不是写代码，是把你的实现**对照最终仓库**做一次系统性 diff：

1. `git diff` 逐文件过一遍，或按目录对照：`src/theme`、`server`、`src/stores`、`src/components/reader`。
2. 重点核对三处：WelcomeGuide（应逐字一致，除了你也许精简过的 CSS 格式）；ReadingView 的豁免与滚动代码（`skipNextScrollRef` 三件套）；bookSlice 的 setCurrentChapter（你的版本多了 clamp，真实版本没有——想清楚两种方案的取舍，讲得出为什么真实仓库选后者）。
3. **写下至少 3 个「为什么最终代码这么写」**（README 完成标准要求）。候选：为什么 `getCurrentChapter` 返回 `?? null` 而不是抛错？为什么 welcome-guide 的存储 key 带 `v1` 后缀？为什么 `?raw` 导入而不是 fetch？
4. 对照 README 完成标准逐条自检：能不看代码讲清三条核心流程——**解析管线**（EPUB → 章节 → 句对 → 双语判定）、**AI 分析**（BYOK → provider 工厂 → generateText → 限流 → 错误透传）、**TTS 朗读**（双引擎 → 服务端缓存 → 前端播放 → 连续朗读预取）。

## 收尾验收清单

- [ ] 首次打开（清 localStorage）弹出 WelcomeGuide，四张卡片内容与 markdown 对应
- [ ] 点「开始使用」/ 点遮罩 / 按 Esc 都能关闭，且不再弹出（`baku-yomi-welcome-guide-seen-v1` 写入）
- [ ] 改 `docs/welcome-guide.md` 后内容跟着变，组件零改动
- [ ] 划选文字：选区不跳动、Popover 弹出、句子不居中滚动；点击句子照常居中
- [ ] `readingProgress` 写入带范围防护；进度条对脏数据钳制在 0-100%
- [ ] `setCurrentChapter` 对越界索引钳制；越界时阅读视图显示空状态而非崩溃
- [ ] 六条链路回归清单全部勾选通过
- [ ] `pnpm build`、`docker compose up -d --build` 全绿
- [ ] 能讲出至少 3 个「为什么最终代码这么写」

## 与最终代码的差异复盘

1. **WelcomeGuide 与最终实现一致**（`6b06e65`）：内容、解析器、组件、存储 key、三路关闭全对齐。真实 CSS 用展开格式，本卡压缩了换行——diff 时只看属性值。
2. **划选滚动豁免与最终一致**（`0ea6ac1`）：`skipNextScrollRef` + `hasJustSelected()` 三处配合逐字相同。
3. **进度精确化：本卡多做了写入侧防护**。真实仓库只在显示层钳制（BookCard 的 `Math.min/Math.max`），`handleScroll` 没有范围检查——`Math.floor(scrollTop / 100)` 在正常布局下天然在界内。写入防护是「数据源头净化」，行为等价、更稳，属于可选加固。
4. **setCurrentChapter：本卡加了 clamp，真实仓库没有**。真实防御是 `getCurrentChapter` 的 `?? null` + ReadingView 空状态。差异是「修数据源头 vs 兜消费侧」两种哲学——面试被问「为什么不 clamp」就答：索引越界被空状态优雅消化，clamp 会让「调试期想看脏状态」变难，真实仓库选择让数据可见、让 UI 兜底。
5. **回归清单**：真实仓库没有这张表（L30 作业的产物）；Docker 健康检查、pnpm 钉版本也未合入——对照 L29 优化思路判断哪些值得补。

## 设计注记（历史弯路）

- **WelcomeGuide 是 markdown 驱动的（`6b06e65`）。** 初版方案是组件硬编码 JSX 文案——改一个字都要动组件、可能改坏结构。改 `?raw` 导入 + 迷你解析器后，文案维护从「改代码」降级为「改 markdown」，还顺手获得「解析器只认五种行」的格式纪律（越界格式静默丢进段落而不是炸掉弹窗）。
- **划选滚动是真实踩过的坑（`0ea6ac1`）。** 根源是**两个里程碑的功能在同一交互区域叠加**：M6 的「选中即居中」遇到 M7 的「选中即划选」。这类 bug 在单里程碑内测不出来，只有全链路回归（Step 5）才暴露——这是本卡把回归清单放进来的原因。
- **同批修掉的还有布局类问题**：`2f6a7a6`（overflow）、`d31d3ec`（单语 EPUB 解析 + 面板布局）——收尾阶段的提交全是「真实用户场景必现」的小修：**打磨阶段的验收标准是场景不是功能**（「导入单语书能练」而非「导入功能存在」）。
- **30 课课程文档最后一批合入（`6a09578`）。** 功能全绿才写文档——文档的价值在「有人要学」时兑现。你的复刻正好反过来：先有课程（参考书），再有这本手册（习题集）。

## 下一步

回到 [手册首页](./README.md)，对照「完成标准」逐条自检——全部勾选，12 个里程碑的从零构筑到此完结。三条核心流程（解析管线 / AI 分析 / TTS 朗读）能不看代码讲清，你就真正拥有这个项目了。
