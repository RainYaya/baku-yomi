# M1 · 从零构筑：EPUB 导入与解析管线

> 目标：从 M0 的空壳开始，把一本双语 EPUB 变成「句子对数组」——拖一个 `.epub` 进页面，浏览器端解析出 `Book` 对象（标题/作者/章节/句对），全程无后端。这是项目的第一个核心功能。
> 关联课程：L10（EPUB 格式原理）、L11（parseEpubFile 主流程）、L12（sentenceSplitter 句段提取）、L13（ruby 净化与 XSS）、L14（languageDetector）、L15（pairBuilder）。
> 前置：完成 M0（`pnpm dev` 双进程能跑）；手头有一本双语 EPUB（日语小说最佳）。

## 构筑总览（本里程碑结束时的项目结构）

```
baku-yomi/
├── package.json                  # 新增依赖 @lingo-reader/epub-parser
└── src/
    ├── types/
    │   ├── book.ts               # Book / Chapter / SentencePair（最小字段）
    │   └── index.ts              # 类型导出桶
    ├── lib/epub/
    │   ├── sentenceSplitter.ts   # 块级切句 + ruby 剥离 + 净化（基础版）
    │   ├── languageDetector.ts   # ja / zh / unknown 三值判定
    │   ├── pairBuilder.ts        # 相邻配对 + 单语降级
    │   └── parser.ts             # parseEpubFile 主流程（解包/元数据/切章）
    ├── components/import/
    │   └── EpubUploader.tsx      # 文件选择 + 拖拽导入
    └── App.tsx                   # useState 存书，渲染解析结果（列表形式）
```

> 说明：M0 的 `MainLayout` 继续用。**最终差异说明**：真实管线比本阶段多三块——`immersiveTranslate.ts` 捷径通道、`parser.ts` 封面探测（M9 书架页才需要）、`types/book.ts` 的 `coverUrl` 字段。全部留白，差异复盘逐条展开。

---

## Step 1 · 数据模型：src/types/book.ts

先把「最终要产出什么」钉死在类型里。解析管线的终点是**纯 JSON 形状**的 `Book`——没有 DOM、没有二进制，可直接 `JSON.stringify` 进 localStorage（M3 的前提）。

**`src/types/book.ts`：**

```ts
export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  chapters: Chapter[];
  importedAt: number;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  pairs: SentencePair[];
}

export interface SentencePair {
  id: string;
  japanese: string;
  japaneseHtml?: string; // HTML with <ruby> tags preserved for furigana display
  chinese: string;
  chapterIndex: number;
  pairIndex: number;
}
```

**`src/types/index.ts`（导出桶，parser 和组件都从 `../../types` 导入）：**

```ts
export type { Book, Chapter, SentencePair } from './book';
```

**讲解：**
- `title`/`author` 必填、`description`/`publisher` 选填——对应「必填给占位、选填给缺席」两种降级语义（Step 6 会看到）。
- `japaneseHtml?: string` 是**双轨结构**的展示轨：`japanese` 是剥净注音的纯文本（供语言检测、配对、AI、TTS），`japaneseHtml` 只存带 `<ruby>` 的净化 HTML（供界面显示注音）。「only set when ruby exists」是纪律——没注音不背这份存储成本（M3 起全量 persist 进 localStorage）。
- `chapterIndex`/`pairIndex` 是句对坐标，M3 进度、M7 书签都拿它当键。

**验证：** `npx tsc -b` 无报错。

---

## Step 2 · 安装 EPUB 解析库

```bash
pnpm add @lingo-reader/epub-parser
```

**讲解：** 不手写 ZIP/XML 解析，交给 `@lingo-reader/epub-parser`：`initEpubFile(file)` 一步完成「解压 ZIP + 定位 container.xml + 解析 OPF」，之后 `getMetadata()` / `getSpine()` / `getToc()` 是内存查询，`loadChapter(id)` 按需解压 XHTML。库 API 有版本差异，Step 6 做分层降级防御。

**验证：** `pnpm ls @lingo-reader/epub-parser` 能列出版本。

---

## Step 3 · sentenceSplitter.ts：块级切句 + ruby 剥离（基础版）

EPUB 正文是 XHTML 字符串。本项目不按标点断句（日语断句正则正确率极低），而是**信任出版物的段落结构**：一个段落标签 = 一个句段单元。

**`src/lib/epub/sentenceSplitter.ts`（基础版）：**

```ts
export interface ExtractedSentence {
  text: string;
  html?: string; // HTML with ruby tags preserved, only set when ruby exists
}

/** Extract text segments from chapter HTML content. Strips <rt>/<rp> from plain text
 *  but preserves ruby HTML for furigana display. */
export function extractSentences(html: string): ExtractedSentence[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sentences: ExtractedSentence[] = [];

  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li');

  for (const block of blocks) {
    if (block.querySelector('p, div')) continue;

    const text = getTextWithoutRuby(block);
    if (text.length === 0) continue;

    const rubyHtml = block.querySelector('ruby')
      ? sanitizeRubyHtml(block.innerHTML)
      : undefined;

    sentences.push({ text, html: rubyHtml });
  }

  return sentences;
}

function getTextWithoutRuby(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const rt of clone.querySelectorAll('rt, rp')) {
    rt.remove();
  }
  return clone.textContent?.trim() ?? '';
}

function sanitizeRubyHtml(html: string): string {
  return html
    .replace(/<(\/?)ruby([^>]*)>/gi, '\x01$1ruby$2\x02')
    .replace(/<(\/?)rt([^>]*)>/gi, '\x01$1rt$2\x02')
    .replace(/<(\/?)rp([^>]*)>/gi, '\x01$1rp$2\x02')
    .replace(/<[^>]+>/g, '')
    .replace(/\x01/g, '<')
    .replace(/\x02/g, '>');
}
```

**逐行讲解：**
- `DOMParser.parseFromString(html, 'text/html')`——**离屏解析**：不执行 `<script>`、不发图片请求、不触发交互，是处理不可信 HTML 的安全起点（L12 有完整对照表）。Node 没有此 API——纯浏览器端解析的技术前提。
- 块级选择器 `'p, h1-h6, div, li'`：`div` 在列因网文平台爱用 div 排版；`h1-h6` 收章节标题；`li` 收目录/角色表。
- **过滤①（核心技巧）**：`block.querySelector('p, div')` 命中说明「我是外壳，真段落在里面」，跳过——`<div><p>甲。</p></div>` 不会重复收。querySelectorAll 返回文档顺序，外壳必然先于内壳被访问，一次前瞻就够。
- **过滤②**：`getTextWithoutRuby` 深克隆、删 `rt/rp`（注音读音，不是正文）、取 `textContent.trim()`——「漢字」绝不能变「漢字かんじ」，否则语言检测被假名污染。空段丢弃。
- **双轨生成**：`text` 永远有；`html` 仅当块内真有 `<ruby>` 时才由 `sanitizeRubyHtml(block.innerHTML)` 生成。`innerHTML` 取原始树（rt 存活）——展示轨需要注音。
- **净化器（占位符替换法）**：先把允许保留的 ruby/rt/rp 换成 `\x01…\x02` 控制字符包裹的占位，此时剩下的所有尖括号标签必然非法，`/<[^>]+>/g` 一刀全删（`<script>`、`<img onerror=...>` 阵亡，剥壳不剥内容），再还原占位符。`\x01`/`\x02` 是 SOH/STX 控制字符，正文出现概率为零——用 `[RUBY]` 可见字符串做占位会被正文误碰撞。`$1` 捕闭标签斜杠、`$2` 保留属性（L13 指出已知边界：`onclick` 类属性会透传，本地 BYOK 工具威胁模型下可接受）。

**验证（DevTools Console）：**

```js
const sanitize = (html) => html
  .replace(/<(\/?)ruby([^>]*)>/gi, '\x01$1ruby$2\x02')
  .replace(/<(\/?)rt([^>]*)>/gi, '\x01$1rt$2\x02')
  .replace(/<(\/?)rp([^>]*)>/gi, '\x01$1rp$2\x02')
  .replace(/<[^>]+>/g, '')
  .replace(/\x01/g, '<')
  .replace(/\x02/g, '>');
sanitize('<p><ruby>漢字<rt>かんじ</rt></ruby></p><script>alert(1)</script>')
// → '<ruby>漢字<rt>かんじ</rt></ruby>'：script 连壳消失，ruby 家族幸存
```

---

## Step 4 · languageDetector.ts：ja / zh 判定

中日文共享同一套 CJK 汉字，唯一可靠的字符集信号是**假名**（平假名 U+3040–309F、片假名 U+30A0–30FF 只用于日语）。「有假名 = 日语（强信号）」，「无假名但有汉字 = 倾向中文（弱信号）」——强信号优先短路。

**`src/lib/epub/languageDetector.ts`（即最终版，26 行）：**

```ts
/** Detect if a string is primarily Japanese (contains hiragana or katakana).
 *  Chinese text uses only CJK Unified Ideographs without kana. */
export function isJapanese(text: string): boolean {
  // Match hiragana (3040-309F) or katakana (30A0-30FF)
  const kanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  return kanaRegex.test(text);
}

export function isChinese(text: string): boolean {
  if (isJapanese(text)) return false;
  // Contains CJK Unified Ideographs
  const cjkRegex = /[\u4E00-\u9FFF]/;
  return cjkRegex.test(text);
}

export type Language = 'ja' | 'zh' | 'unknown';

export function detectLanguage(text: string): Language {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';
  if (isJapanese(trimmed)) return 'ja';
  if (isChinese(trimmed)) return 'zh';
  return 'unknown';
}
```

**逐行讲解：**
- `isJapanese` 是「存在性」判断：出现任意一个假名即日语（中文夹「の」会被判日语——刻意的宽松，下游 pairBuilder 吸收单句误判）。
- `isChinese` 第一行先排除日语——否则「私の本」会因含汉字被误判为中文。
- 空串/纯空白显式判 `unknown`——unknown 的下游语义是「不参与配对」。
- 为什么不用 EPUB 的 `lang` 属性：元数据层（全书一个值，双语书注定错一半）、内联标注层（工具批量生成不可信）、证据可信度（声明可撒谎，字符集指纹是物理事实）——L14 完整论证。

**验证（DevTools Console）：** `isJa('私は猫である')` → true；`isJa('我是猫')` → false；`isJa('夜の生活')` → true（刻意宽松）。

---

## Step 5 · pairBuilder.ts：相邻配对 + 单语降级

双语小说有两种形态：机器翻译版（原文后紧跟译文 span，靠 class 识别——那是 immersiveTranslate 通道，M1 不做）和裸双语排版（原文/译文逐行交替，只能靠语言检测猜）。pairBuilder 解决后者。

**`src/lib/epub/pairBuilder.ts`（即最终版）：**

```ts
import type { SentencePair } from '../../types';
import { detectLanguage } from './languageDetector';
import type { ExtractedSentence } from './sentenceSplitter';

/** Build sentence pairs from extracted text lines.
 *  Preserves adjacent JA+ZH / ZH+JA bilingual pairs when present. Falls back to
 *  treating each line as a Japanese source sentence so monolingual novels import cleanly. */
export function buildPairs(
  sentences: ExtractedSentence[],
  chapterIndex: number
): SentencePair[] {
  const tagged = sentences.map((s) => ({
    ...s,
    lang: detectLanguage(s.text),
  }));

  const hasExplicitBilingualPairs = tagged.some((sentence, index) => {
    const next = tagged[index + 1];
    if (!next) return false;
    return (
      (sentence.lang === 'ja' && next.lang === 'zh') ||
      (sentence.lang === 'zh' && next.lang === 'ja')
    );
  });

  if (!hasExplicitBilingualPairs) {
    return tagged.map((sentence, pairIndex) => ({
      id: `ch${chapterIndex}-p${pairIndex}`,
      japanese: sentence.text,
      japaneseHtml: sentence.html,
      chinese: '',
      chapterIndex,
      pairIndex,
    }));
  }

  const pairs: SentencePair[] = [];
  let i = 0;
  let pairIndex = 0;

  while (i < tagged.length) {
    const current = tagged[i];
    const next = tagged[i + 1];

    // Look for JA followed by ZH
    if (current.lang === 'ja' && next?.lang === 'zh') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: current.text,
        japaneseHtml: current.html,
        chinese: next.text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Look for ZH followed by JA (reverse order)
    if (current.lang === 'zh' && next?.lang === 'ja') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: next.text,
        japaneseHtml: next.html,
        chinese: current.text,
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
      i += 2;
      continue;
    }

    // Keep unmatched Japanese lines so partially bilingual / monolingual
    // chapters still remain readable and can be backfilled later.
    if (current.lang === 'ja') {
      pairs.push({
        id: `ch${chapterIndex}-p${pairIndex}`,
        japanese: current.text,
        japaneseHtml: current.html,
        chinese: '',
        chapterIndex,
        pairIndex,
      });
      pairIndex++;
    }

    i++;
  }

  return pairs;
}
```

**逐行讲解：**
- **两阶段设计**：先 `some()` 全局探测「本章是否存在至少一对相邻 ja↔zh」。不存在就整体切单语模式——把**每一句**（连 zh/unknown 也）塞进 japanese、译文留空。为什么不过滤？「整本书没有双语结构」本身就是最强证据，个别误判照收。「存在即双语」的误触发成本（一章夹一句中文引文就进配对模式）是已知取舍。
- **`i += 2` 游标**：配对成功的两句都被消费，O(n) 贪心单遍，无法回头修正（`['中文甲','中文乙','日本語']` 会牺牲「中文甲」），真实书源足够可靠。
- **两个配对分支**：正向（JA→ZH）与反向（ZH→JA，译文在前的排版）。反向分支字段交换：`japanese` 取 **next**、`chinese` 取 current。`next?.lang` 可选链处理数组末尾。
- **不对称保留**：落单 `ja` 保留为 `chinese: ''` 占位——正是后续 AI 回译要**回填**的空位；落单 `zh`/`unknown` 丢弃（孤立中文没有学习价值）。
- **id 规则 `ch${chapterIndex}-p${pairIndex}`**：全章唯一；`japaneseHtml` 从原文透传。

**验证（DevTools Console）：** 对 `['雨が降っていた。','下着雨。','傘を忘れた。','忘了伞。']`（lang 序列 ja,zh,ja,zh）配对产出 2 条：japanese 是日语、chinese 是中文；纯日语书每条 `chinese:''` 不丢句。

---

## Step 6 · parser.ts：解包 → 元数据 → 切章（主流程）

全管线的心脏：把 `File` 变成 `Book`。EPUB 是「最不被规范对待」的格式，同一个 `dc:title` 可能是字符串、可能是 XML 反序列化的 `{ _: '标题', $: { lang: 'ja' } }` 对象——一切元数据读取都走「安全取值」函数。五个辅助函数 + 一个主流程：**主流程编排、细节下沉**。

**`src/lib/epub/parser.ts`（M1 版）：**

```ts
import { initEpubFile } from '@lingo-reader/epub-parser';
import type { Book, Chapter } from '../../types';
import { extractSentences } from './sentenceSplitter';
import { buildPairs } from './pairBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;

interface TocEntry {
  label: unknown;
  href: string;
  id: string;
  children?: TocEntry[];
}

/** Flatten nested TOC into a flat ordered list */
function flattenToc(toc: TocEntry[]): TocEntry[] {
  const result: TocEntry[] = [];
  for (const entry of toc) {
    result.push(entry);
    if (entry.children?.length) {
      result.push(...flattenToc(entry.children));
    }
  }
  return result;
}

/** Safely extract a plain string from metadata values that may be objects like {_, $} */
function extractText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '_' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)._);
  }
  return String(value);
}

/** Extract creator name from metadata.creator which is an array of {contributor, fileAs, role} */
function extractCreator(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null) {
      return extractText(first.contributor) ?? extractText(first._) ?? null;
    }
  }
  return extractText(value);
}

/** Extract pairs from one or more HTML strings combined */
function extractPairsFromHtml(htmlParts: string[], chapterIndex: number) {
  const combined = htmlParts.join('\n');
  return buildPairs(extractSentences(combined), chapterIndex);
}

export async function parseEpubFile(file: File): Promise<Book> {
  const epub: EpubFile = await initEpubFile(file);

  const metadata = epub.getMetadata?.() ?? epub.metadata ?? {};
  const title = extractText(metadata.title) ?? file.name.replace(/\.epub$/i, '');
  const author = extractCreator(metadata.creator) ?? 'Unknown';
  const description = extractText(metadata.description) ?? undefined;
  const publisher = extractText(metadata.publisher) ?? undefined;
  const bookId = `book-${Date.now()}`;

  const spine: { id: string; href: string }[] =
    epub.getSpine?.() ?? epub.spine ?? [];
  const toc: TocEntry[] = epub.getToc?.() ?? epub.navMap ?? [];
  const flatToc = flattenToc(toc);

  // Build spine index: id -> position in spine order
  const spineIndex = new Map<string, number>();
  for (let i = 0; i < spine.length; i++) {
    spineIndex.set(spine[i].id, i);
  }

  // Pre-load all spine HTML content, keyed by manifest id
  const spineHtml = new Map<string, string>();
  for (const item of spine) {
    try {
      const ch = await epub.loadChapter(item.id);
      if (ch?.html?.trim()) {
        spineHtml.set(item.id, ch.html);
      }
    } catch {
      // skip unloadable items
    }
  }

  const chapters: Chapter[] = [];

  if (flatToc.length > 0) {
    // Sort TOC entries by their spine position to ensure correct order
    const tocWithSpinePos = flatToc
      .filter((e) => e.id && spineIndex.has(e.id))
      .map((e) => ({ entry: e, spinePos: spineIndex.get(e.id)! }))
      .sort((a, b) => a.spinePos - b.spinePos);

    for (let t = 0; t < tocWithSpinePos.length; t++) {
      const { entry, spinePos: startPos } = tocWithSpinePos[t];
      const nextPos = tocWithSpinePos[t + 1]?.spinePos ?? spine.length;

      // Collect HTML from all spine items between this TOC entry and the next
      const htmlParts: string[] = [];
      for (let s = startPos; s < nextPos; s++) {
        const html = spineHtml.get(spine[s].id);
        if (html) htmlParts.push(html);
      }

      if (htmlParts.length === 0) continue;

      const pairs = extractPairsFromHtml(htmlParts, chapters.length);
      if (pairs.length === 0) continue;

      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: extractText(entry.label) || `第${chapters.length + 1}章`,
        index: chapters.length,
        pairs,
      });
    }
  }

  // Fallback: if TOC produced nothing, fall back to spine-per-chapter
  if (chapters.length === 0) {
    for (const [spineId, html] of spineHtml) {
      const pairs = extractPairsFromHtml([html], chapters.length);
      if (pairs.length === 0) continue;

      const tocEntry = flatToc.find((t) => t.id === spineId);
      chapters.push({
        id: `${bookId}-ch${chapters.length}`,
        title: extractText(tocEntry?.label) || `第${chapters.length + 1}章`,
        index: chapters.length,
        pairs,
      });
    }
  }

  return {
    id: bookId,
    title,
    author,
    description,
    publisher,
    chapters,
    importedAt: Date.now(),
  };
}
```

**逐行讲解（按执行顺序）：**
- `type EpubFile = any` + eslint-disable：库没导出可用类型，把「局部 any」压到一个类型别名。`TocEntry.label: unknown`：TOC 标题和 metadata 一样可能是 `{_, $}`，用 `unknown` 强制消费方过 `extractText`。
- `flattenToc`：**先序**展开嵌套目录（父先子后），`children?.length` 同时防 null 和空数组。O(n)，递归深度 = TOC 层数（≤3）。
- `extractText` **四分支**：null → null；字符串 → 原样；`{_, $}` → 取 `_`（xml2js 产物）；其他 → `String()` 兜底（永不抛异常，代价是可能产出 `[object Object]`，对标题字段可接受）。
- `extractCreator`：数组取首元素；元素是对象先试 `.contributor` 再试 `._`——且 `contributor` 本身可能又是 `{_, $}`，交给 extractText **二次净化**，组合而非复制。
- **分层降级**：`epub.getMetadata?.() ?? epub.metadata ?? {}`——方法调用 → 属性访问 → 空默认值，三级缺一不可（漏中间一级，遇到「方法存在但返回 undefined」的库版本就在 `.title` 处炸）。
- **降级方向不同**：title/author 降级到占位（`?? 文件名去后缀` / `?? 'Unknown'`）；description/publisher 降级到 `undefined`。
- **两个 Map 并行建立**：`spineIndex`（id → 顺序号）供切章边界；`spineHtml`（id → HTML 串）缓存全部章节。单章 `loadChapter` 用 try/catch 包住——坏章只跳过不毁整本书；`ch?.html?.trim()` 把「加载成功但内容空白」也归入跳过。
- **切章 = filter-map-sort 三连**：filter 砍掉无法映射回 spine 的条目；map 预固化 spinePos（避免 sort 反复查 Map）；sort 保证区间单调——TOC 自身乱序的书，没这步会出负区间、章节错乱。
- **区间收集**：`nextPos = 下一条件的 spinePos ?? spine.length`，最后一个条目吃章尾；`[startPos, nextPos)` 左闭右开，相邻区间无缝不重叠。**一章 = 该 TOC 条目到下一个条目之间的所有 spine 文件合并**（出版商按体积切文件，一话拆 part1/2/3）。
- **两个 continue**：`htmlParts.length === 0` 跳过幽灵章节；`pairs.length === 0` 跳过空章——UI 不该显示翻不开的目录项。
- **`chapters.length` 当索引**：只有成功产出句对才 push，当前长度天然是下一个连续编号、无空洞；章标题用 `||` 而非 `??`——空串标题也算缺失。
- **spine 兜底**：TOC 一无所获时一章 = 一个 spine 文件，标题尽力从 flatToc 反查。遍历 `spineHtml` 的迭代序 = 插入序 = spine 顺序（JS 规范保证），章序依然正确。
- **`bookId = book-${Date.now()}`**：不用 `dc:identifier`（真实书源常缺失/重复）；两次导入同一本书互不覆盖。最终 Book 是纯 JSON 形状，可直接 `JSON.stringify`。

> M1 版与最终版差异：`extractPairsFromHtml` 只走单通道（最终版先试沉浸式翻译捷径、null 才回落）；无封面探测。见差异复盘。

**验证：** 无独立验证（输入是 `File`），Step 8 一起验。

---

## Step 7 · EpubUploader.tsx：文件选择 + 拖拽导入

导入入口：点击或拖拽，两条路径收敛到同一个「处理单个 File」函数。M1 用**局部状态**（`parsing`/`error`），M3 抽成 `useEpubParser` hook 接 store。

**`src/components/import/EpubUploader.tsx`（M1 版）：**

```tsx
import { useCallback, useState } from 'react';
import { parseEpubFile } from '../../lib/epub/parser';
import type { Book } from '../../types';

interface Props {
  onImported: (book: Book) => void;
}

export function EpubUploader({ onImported }: Props) {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.epub')) return;
      setParsing(true);
      setError(null);
      try {
        const book = await parseEpubFile(file);
        if (book.chapters.length === 0) {
          setError('未能从EPUB中提取到日中句对。请确认文件格式正确。');
          return;
        }
        onImported(book);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'EPUB解析失败';
        setError(msg);
      } finally {
        setParsing(false);
      }
    },
    [onImported]
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
      <h2 className="uploader-title">把第一本双语 EPUB 放进书架。</h2>

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

**讲解：** `handleFile` 是唯一入口：非 `.epub` 后缀静默忽略；解析中置 `parsing`（UI 转圈、防重复导入）；成功且非空书才回调 `onImported(book)`——「没成功就不回调」保证书架无残留；空书给可读错误。错误文案 `e instanceof Error ? e.message : 'EPUB解析失败'`，不把堆栈上屏。`handleDrop`/`handleInput` 都收敛到 `handleFile`；dropzone 的 `onClick` 触发隐藏 input 的 click（整个区域可点）；`onDragOver` 必须 `preventDefault()` 否则浏览器默认打开文件。真实最终版有 `FiUpload` 图标（react-icons），M1 省略装饰。

**验证：** 等 Step 8 一起验证。

---

## Step 8 · App.tsx：接入导入并渲染解析结果

M1 不建完整阅读视图（M2 的事）——App 用 `useState` 存书，有书渲染「章节 → 句对」简单列表，无书渲染导入入口。

**`src/App.tsx`（M1 版）：**

```tsx
import { useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { EpubUploader } from './components/import/EpubUploader';
import type { Book } from './types';

export default function App() {
  const [book, setBook] = useState<Book | null>(null);

  return (
    <MainLayout>
      {book ? (
        <div>
          <h1>{book.title}</h1>
          <p>作者：{book.author}</p>
          {book.chapters.map((chapter) => (
            <section key={chapter.id}>
              <h2>{chapter.title}</h2>
              {chapter.pairs.map((pair) => (
                <div key={pair.id} style={{ margin: '0.5rem 0' }}>
                  <p>{pair.japanese}</p>
                  {pair.chinese && <p style={{ opacity: 0.7 }}>{pair.chinese}</p>}
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <EpubUploader onImported={setBook} />
      )}
    </MainLayout>
  );
}
```

**讲解：** `book ? <列表> : <EpubUploader/>` 按有无书切换视图；`onImported={setBook}` 把解析结果存进局部 state（M3 换 store 的 `addBook`）。列表是**临时调试视图**，使命是让解析产物真实可见，M2 被 `ReadingView` 替换。`key` 用 `chapter.id`/`pair.id` 是列表复用纪律，M2 继承。

**验证（整链路，本里程碑最重要）：**
1. `pnpm dev` → 打开 `http://localhost:5174`
2. 拖一本双语 EPUB 进页面 → 「正在解析」→ 出现书名、作者、章节、句对列表
3. 点击选择走同一路径；拖非 `.epub` 文件 → 无反应不报错
4. F12 Console 无未捕获异常；localStorage 还空着（M3 才持久化）
5. 再导入一本纯日语书 → 每句只有日语行（单语降级生效）

---

## 收尾验收清单

- [ ] 拖拽与点击选择都能导入；非 `.epub` 文件被静默忽略
- [ ] 解析中有「正在解析」反馈；损坏文件显示可读错误
- [ ] 标题/作者来自 EPUB 元数据；`{_, $}` 形态的怪书导入不崩、不显示 `[object Object]`
- [ ] 章节数与书一致、顺序与阅读顺序一致（嵌套 TOC 先序展开；TOC 与 spine 顺序不一致时按阅读顺序排）
- [ ] 一章由多个 spine 文件组成时内容完整合并（区间切章不丢段）
- [ ] 带注音句子：句对纯文本不含注音假名（「漢字」不是「漢字かんじ」）
- [ ] JA→ZH 与 ZH→JA 两种排版都配对正确（字段不反）
- [ ] 纯日语书每句 `chinese` 为空串，不报错、不丢句
- [ ] 无 TOC 的书走 spine 兜底导入，章节不丢
- [ ] 空书（无句对）给出明确错误，不产生空书条目
- [ ] 同一本书导入两次得到两个不同 `bookId`
- [ ] 控制台无未捕获异常
- [ ] 能在 Console 用固定输入复现净化结果（script 死亡、ruby 幸存）
- [ ] 能对着一张真实 EPUB 说出 `getSpine()` / `getToc()` / `loadChapter(id)` 各消费哪个规范部件
- [ ] 产出的 `Book` 与 `types/book.ts` 结构一致（可直接 `JSON.stringify`）

## 与最终代码的差异复盘

1. `types/book.ts`——最终版多 `coverUrl?: string`。封面是 M9 书架页的视觉需求，本阶段无消费方。**M9 加字段 + parser 加探测，两步一起做。**
2. `parser.ts`——最终版 `extractPairsFromHtml` 是 `extractImmersiveTranslatePairs(combined, chapterIndex) ?? buildPairs(extractSentences(combined), chapterIndex)`：沉浸式翻译通道优先、null 才回落通用管线。真实历史后期补的旁路（e6aae37）；`immersiveTranslate.ts` 内部有与 sentenceSplitter 逐字相同的 `getTextWithoutRuby`/`sanitizeRubyHtml` 拷贝（刻意复制而非抽象，两通道互不依赖）。
3. `parser.ts` 无封面探测——最终版 `extractCoverFromSpineHtml` 用 manifest 的 `properties="cover-image"` 决定扫描宽度（有声明看 3 个 spine 条目、无声明看 1 个），正则同时匹配 `<img src>` 与 `<image href>`（SVG 封面），blob URL 经 fetch + FileReader 转 data URL 才能活过持久化。**M9 补。**
4. `sentenceSplitter.ts`——最终版多了**纯文本兜底分支**：块级提取一无所获时，克隆 body、删 rt/rp、按 `\n+` 切纯文本每行一句。基础版对「正文是裸文本/全包在 span 里」的怪书产出空数组。兜底是「全有或全无」触发，加在 `return sentences` 之前即可。
5. `EpubUploader.tsx`——最终版接 `useEpubParser`（内部 `addBook` 进 store）、无 `onImported` prop、有 `FiUpload` 图标。**M3 把 Step 7 内联逻辑抽成 hook。**
6. `App.tsx`——最终版从 `useBookStore` 读书、按 `uiSlice` 的 `currentView` 切换视图。M1 的 useState 版 **M3 被 store 取代、M9 被 uiSlice 取代**；本阶段列表视图 M2 就被 ReadingView 替换。

## 设计注记（历史弯路）

- 切章方式真实历史换过三轮：先用 spine 文件切（f546b6a），改用 TOC navMap 条目切，再补 9a305e7 把「TOC 条目之间的 spine 文件」并入前一章——目录只列大章、中间夹多个小 spine 文件的真实书源，只取单文件会整段丢内容。**TOC 是地图、spine 是正文流，合起来切才对。** 复刻直接按最终形态写，不必重走前两轮。
- 元数据对象防御（0f8f253 / 3685a64）不是未雨绸缪，是真被 `{_, $}` 形态崩过。`extractText` 每个分支对应一种真实书源；与 L10「元数据不可信、内容才可信」同源。
- ruby 剥离（4b25248）与注音开关（14a3c1a）是两次提交：先解决「正文文本必须干净」（注音假名污染语言检测），后来才想到「展示还想看注音」——`text`/`html` 双轨因此成为必然。顺序很重要：先有干净文本的需求，再有展示轨。
- 沉浸式翻译兼容（e6aae37）是后加的旁路：通用配对对插件导出的书对不准，才加 class 结构识别捷径。复刻先走通用管线，遇到真实沉浸式翻译书再补。
- 解析管线是后期才拆成五模块的：首提交 3000+ 行单体把解析与 UI 混在一起。复刻直接按模块写——`parser` 只编排不掺 UI，每模块可独立阅读、独立验证。

## 下一步

进入 [M2 · 阅读视图](./M02-reading-view.md)：把句对数组渲染成可交互阅读页——卡片流、注音开关、内联编辑、划选豁免。M1 的临时列表视图到那时退役。
