# 第 11 课 · 解析主流程 parseEpubFile

> 所属阶段 2（EPUB 解析管线 ⭐核心）· 预计时长 90 分钟 · 难度★★★★☆

## 学习目标

- 按执行顺序完整讲清 `parseEpubFile` 从 `File` 对象到 `Book` 对象的每一步变换。
- 解释 `flattenToc` 为什么要做「扁平化 + 按 spine 位置重排」两步处理。
- 说明 `extractText` / `extractCreator` 防御式取值分别防御哪种真实数据形态。
- 描述 `extractCoverFromSpineHtml` 的封面探测策略，以及 blob URL 为什么必须转成 data URL。
- 【新增】把 `parser.ts` 全部 212 行按执行顺序分成 9 段，逐段讲透每一行在做什么、为什么这样写。
- 【新增】对主流程给出复杂度分析：时间 O(总正文大小)、空间峰值、以及每段 Map/数组的选择理由。
- 【新增】掌握「安全取值 + 分层降级」这一可迁移的防御式编程模式。

## 前置检查

- 已完成第 10 课：能说清 container.xml → OPF → spine/manifest/TOC 的引用链。
- 已完成第 6-7 课：知道 Zustand store 与 persist 的存在（解析结果最终会被存进 bookSlice）。
- 建议在浏览器 DevTools 里打开 Sources 面板，边读边给 `parseEpubFile` 打断点。
- 【边学边练】热身两问：① 本文件一共多少行？② 其中 `parseEpubFile` 主函数占多少行？（答案：212 行 / 约 117 行——先建立「这课要啃多大一块」的体感。）

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/lib/epub/parser.ts` | 本课主角：`parseEpubFile` 主流程 + 5 个辅助函数 |
| `src/lib/epub/sentenceSplitter.ts` | 被 `extractPairsFromHtml` 调用（第 12 课深入） |
| `src/lib/epub/pairBuilder.ts` | 被 `extractPairsFromHtml` 调用（第 15 课深入） |
| `src/lib/epub/immersiveTranslate.ts` | 沉浸式翻译格式优先通道（第 15 课深入） |
| `src/types/book.ts` | 解析终点 `Book` / `Chapter` / `SentencePair` 类型 |

## 正文

### 概念讲解

**「解析」到底在做什么？** 输入是浏览器里的一个 `File` 对象（用户拖进来的 `.epub`），输出是一个纯 JSON 化的 `Book` 对象——没有 DOM、没有二进制、可以直接 `JSON.stringify` 存进 localStorage。中间要完成四类变换：

1. **容器解包**：ZIP → 内存中的文件表（交给 `@lingo-reader/epub-parser`）。
2. **结构归一**：EPUB 规范里千奇百怪的结构（TOC 嵌套、spine 与 TOC 顺序不一致、元数据字段形态不定）→ 项目自己的规整模型。
3. **内容提取**：每章 XHTML → 句对数组（本阶段后续课程的主题）。
4. **资源固化**：临时引用（blob URL）→ 可持久化形式（data URL）。

**防御式编程的必要性。** EPUB 是「最不被规范对待」的格式：出版工具五花八门。同一个 `dc:title`，有的书里是纯字符串，有的是 XML 库反序列化出来的 `{ _: '标题', $: { lang: 'ja' } }` 形态；`dc:creator` 有时是字符串、有时是数组、数组元素还可能是对象。所以本项目所有元数据读取都走「安全取值」函数而不是直接点属性。

**库 API 的不确定性。** 注意 parser.ts 顶部的：

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;
```

以及满篇的 `epub.getMetadata?.() ?? epub.metadata ?? {}`——这是对第三方库版本差异的兜底：优先用方法调用，方法不存在就退回属性访问，再不行给空默认值。读这段代码时要理解这不是随手写的 `??`，而是分层降级策略。

### 【新增】全函数分段地图

先把 212 行源码切成 9 段挂一张地图，后面逐段精读：

| 段号 | 行区间 | 内容 | 一句话职责 |
|---|---|---|---|
| ⓪ | L1-15 | import 与类型声明 | 引入依赖、定义 `TocEntry` 局部类型 |
| ① | L18-27 | `flattenToc` | TOC 树 → 先序扁平列表 |
| ② | L30-37 | `extractText` | 元数据值 → 纯字符串（三种形态） |
| ③ | L40-51 | `extractCreator` | 作者字段 → 字符串（含数组/对象形态） |
| ④ | L54-60 | `extractPairsFromHtml` | HTML 数组 → SentencePair[]（双通道调度） |
| ⑤ | L63-93 | `extractCoverFromSpineHtml` | 封面 URL 探测（manifest 信号 + spine 扫描） |
| ⑥ | L95-104 | 初始化与元数据 | initEpubFile + title/author/description/publisher |
| ⑦ | L106-127 | spine 索引与全量预载 | spineIndex/spineHtml 两个 Map 并行建立 |
| ⑧ | L129-155 | 封面固化 | blob → data URL 的 fetch/FileReader 流水线 |
| ⑨ | L157-211 | 切章、兜底与组装 | TOC×spine 区间切章 → spine 兜底 → 返回 Book |

记忆口诀：**五个辅助函数打头阵（⓪-⑤），主函数六步走（⑥-⑨）**。辅助函数都是纯函数（除 ⑤ 读库句柄），可以独立测试——这是「主流程编排、细节下沉」的经典结构。

### 代码走读

按执行顺序走读 `src/lib/epub/parser.ts`。

#### 【新增·逐行级】段⓪：import 与类型（L1-15）

```ts
import { initEpubFile } from '@lingo-reader/epub-parser';
import type { Book, Chapter } from '../../types';
import { extractSentences } from './sentenceSplitter';
import { buildPairs } from './pairBuilder';
import { extractImmersiveTranslatePairs } from './immersiveTranslate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubFile = any;

interface TocEntry {
  label: unknown;
  href: string;
  id: string;
  children?: TocEntry[];
}
```

三个值得停留的细节：

- **`type EpubFile = any` + eslint-disable**：这是一次明码标价的妥协——库没有导出可用的类型（或导出类型与实际运行时行为不符）。作者选择「局部 any + 注释说明」而不是给整个模块关掉严格检查：污染面被压到一个类型别名上。
- **`label: unknown` 而不是 `string`**：TOC 条目标题和 metadata 一样可能是 `{_, $}` 形态（它同样来自 XML 反序列化）。用 `unknown` 强制所有消费方过一遍 `extractText`，把「脏数据」编码进类型系统——编译器替你记住哪里需要净化。
- **`children?` 可选递归结构**：标准的树定义。`flattenToc` 的输入就是这棵可能 0~3 层的树。

#### 【新增·逐行级】段①：flattenToc（L17-27）

```ts
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
```

逐行看：外层 for 保证多棵顶层子树依次展开；`result.push(entry)` 先放父节点（**先序**）；`entry.children?.length` 同时防 null 和空数组；递归结果用展开运算符一次性并入。示例：

```
输入: [卷一[第一章, 第二章], 卷二[第三章]]
输出: [卷一, 第一章, 第二章, 卷二, 第三章]   ← 先序 = 目录的自然阅读顺序
```

复杂度：每个节点恰好 push 一次，O(n) 时间；递归深度 = TOC 层数（现实中 ≤3），无栈溢出风险。若换成显式栈迭代版可以处理任意深度，但对这个数据规模属于过度设计。

#### 【新增·逐行级】段②：extractText（L29-37）

```ts
/** Safely extract a plain string from metadata values that may be objects like {_, $} */
function extractText(value: unknown): string | null {
  if (value == null) return null;          // 分支1: null/undefined → null
  if (typeof value === 'string') return value;  // 分支2: 字符串原样返回
  if (typeof value === 'object' && '_' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)._);  // 分支3: xml2js 形态取 _
  }
  return String(value);                    // 分支4: 其余强行字符串化兜底
}
```

四种输入对应四种真实书源：

| 输入 | 来源场景 | 输出 |
|---|---|---|
| `undefined` | 库版本差异导致字段缺失 | `null`（让调用方走默认值） |
| `'吾輩は猫である'` | 规矩的书 | 原样 |
| `{ _: '吾輩は猫である', $: { lang: 'ja' } }` | xml2js 系反序列化产物 | `'吾輩は猫である'` |
| `123` / 其他对象 | 极端脏数据 | `'123'` / `'[object Object]'` |

注意分支 4 的双刃性：它保证永不抛异常，但 `[object Object]` 这种垃圾值会静默流入 UI。这是「可用性优先于纯净性」的取舍——对标题字段合理，对参与逻辑判断的字段就要三思。

#### 【新增·逐行级】段③：extractCreator（L39-51）

```ts
/** Extract creator name from metadata.creator which is an array of {contributor, fileAs, role} */
function extractCreator(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];                          // 只取第一位作者
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null) {
      return extractText(first.contributor) ?? extractText(first._) ?? null;
    }
  }
  return extractText(value);                         // 复用段②处理剩余形态
}
```

与 `extractText` 相比多处理一层「数组 + 元素为对象」。判定链：数组非空 → 取首元素 → 元素是字符串直接用 → 元素是对象则先试 `.contributor` 再试 `._`。最后一步 `extractText(first.contributor) ?? ...` 的妙处：`.contributor` 本身又可能是 `{_, $}` 形态，交给 extractText 二次净化——**不复制逻辑，组合已有函数**。测试矩阵：

| 输入 | 输出 | 走的分支 |
|---|---|---|
| `'夏目漱石'` | `'夏目漱石'` | 字符串直返 |
| `['夏目漱石', '堀口星眠']` | `'夏目漱石'` | 数组→首元素字符串 |
| `[{ contributor: '夏目漱石', role: 'aut' }]` | `'夏目漱石'` | 数组→对象→contributor |
| `[{ contributor: {_: '夏目漱石'} }]` | `'夏目漱石'` | 数组→对象→contributor→extractText |
| `[]` | `extractText([])` = `'null'`？不——`String([])` 是 `''` | 见下方陷阱分析 |

最后一行值得较真：空数组会落到末尾的 `extractText(value)`，而 `String([]) === ''`，返回的是**空串不是 null**。调用方 `?? 'Unknown'` 对空串无效（`''` 不是 nullish），于是作者显示为空白而非 Unknown。这是一个真实的边界瑕疵——影响极小（空数组作者罕见），但读代码时要看出它，面试里能主动指出这种边界是加分项。

#### 【新增·逐行级】段④：extractPairsFromHtml（L53-60）

```ts
/** Extract pairs from one or more HTML strings combined */
function extractPairsFromHtml(htmlParts: string[], chapterIndex: number) {
  const combined = htmlParts.join('\n');
  return (
    extractImmersiveTranslatePairs(combined, chapterIndex) ??
    buildPairs(extractSentences(combined), chapterIndex)
  );
}
```

五行代码承载了整条内容管线的调度：多个 XHTML 文件先用 `\n` 拼接（保留换行，给 sentenceSplitter 的兜底分行留素材），然后**沉浸式翻译通道优先**（返回 null 表示格式不符才落右侧）、普通管线兜底。这个 `??` 协议在第 15 课展开。

#### 【新增·逐行级】段⑤：extractCoverFromSpineHtml（L62-93）

```ts
/** Try to find a cover image URL from loaded HTML */
function extractCoverFromSpineHtml(
  epub: EpubFile,
  spine: { id: string; href: string }[],
  spineHtml: Map<string, string>,
): string | undefined {
  // Check if manifest declares a cover-image
  const manifest = epub.getManifest?.() ?? {};
  let hasCoverInManifest = false;
  for (const item of Object.values(manifest) as { properties?: string; mediaType?: string }[]) {
    if (item.properties?.includes('cover-image') && item.mediaType?.startsWith('image/')) {
      hasCoverInManifest = true;
      break;
    }
  }

  // Look at first N spine items for an <img> or <image>
  const candidates = spine.slice(0, hasCoverInManifest ? 3 : 1);
  for (const item of candidates) {
    const html = spineHtml.get(item.id);
    if (!html) continue;

    // Match <img src="..."> or <image ... href="..."> (SVG wrapped covers)
    const imgMatch = html.match(
      /(?:<img[^>]+src=["']([^"']+)["'])|(?:<image[^>]+(?:href|xlink:href)=["']([^"']+)["'])/i
    );
    const url = imgMatch?.[1] ?? imgMatch?.[2];
    if (url) return url;
  }

  return undefined;
}
```

策略分两级：OPF manifest 若声明了 `properties="cover-image"` 就信任它，并放宽到扫描前 **3** 个 spine 条目找 `<img>`；没有任何声明时保守地只看**第 1 个** spine 条目（封面页惯例上排第一）。正则里 `(?:<img...src=)|(?:<image...(href|xlink:href)=...)` 用两个捕获组同时覆盖 HTML 封面和 SVG 包裹封面——日文老书常见后者；`imgMatch?.[1] ?? imgMatch?.[2]` 按「哪组匹配到了」取值。

为什么用正则而不是 DOMParser？此处只需要第一个 img 标签的 src，正则一次扫描即可；DOMParser 要构建整棵 DOM 树。对单页封面探测来说正则更快也更宽容（半残 HTML 也能匹配）。代价是无法处理转义变体——但封面探测失败只是没封面，可接受的降级。

#### 【逐行级】段⑥：初始化与元数据（L95-104）

```ts
export async function parseEpubFile(file: File): Promise<Book> {
  const epub: EpubFile = await initEpubFile(file);

  const metadata = epub.getMetadata?.() ?? epub.metadata ?? {};
  const title = extractText(metadata.title) ?? file.name.replace(/\.epub$/i, '');
  const author = extractCreator(metadata.creator) ?? 'Unknown';
  const description = extractText(metadata.description) ?? undefined;
  const publisher = extractText(metadata.publisher) ?? undefined;
  const bookId = `book-${Date.now()}`;
```

`initEpubFile(file)` 接收原始 File，内部完成解压和 OPF 解析（第 10 课时序图的全部重活）。title 取不到时退化为文件名去后缀——保证 UI 上永远有名字可显示。注意四个字段的降级方向不同：title/author 降级到占位文本（必填展示），description/publisher 降级到 `undefined`（可选字段直接省略）。「必填给占位、选填给缺席」，两种降级语义不要混。

#### 【逐行级】段⑦：spine 索引与全量预载（L106-127）

```ts
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
```

两个 Map 并行建立：`spineIndex`（id → 顺序号）用于后面切章边界；`spineHtml`（id → HTML 字符串）缓存全部章节内容。单章加载失败只跳过、不中断整本书——坏章不应毁掉导入。

三个细节：其一，`ch?.html?.trim()` 双重可选链 + trim 判空，把「加载成功但内容空白」也归入跳过（空 XHTML 进管线只会产出零句对，提前过滤更干净）；其二，循环内 `await` 是顺序加载，全书章节串行拉取——简单可靠，代价是没有并发加速（浏览器 File API 场景下瓶颈通常不在 IO，可接受）；其三，catch 里连日志都没有，坏章完全静默——工具型产品的取舍，调试期你可以临时加 `console.warn`。

#### 【逐行级】段⑧：封面固化（L129-155）

```ts
let coverUrl: string | undefined;
try {
  const rawCoverUrl = extractCoverFromSpineHtml(epub, spine, spineHtml);
  if (rawCoverUrl) {
    // Convert blob URL to data URL so it survives localStorage persistence
    if (rawCoverUrl.startsWith('blob:')) {
      const resp = await fetch(rawCoverUrl);
      const blob = await resp.blob();
      coverUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } else if (rawCoverUrl.startsWith('data:')) {
      coverUrl = rawCoverUrl;
    }
  }
} catch {
  // best-effort
}
```

拿到 URL 后还有关键一步：blob URL 是内存级临时引用，刷新页面即失效，而 Book 要 persist 进 localStorage，所以必须 `fetch` 回来经 `FileReader.readAsDataURL` 转成自包含的 data URL。三种 URL 形态三分支处理：

| rawCoverUrl 形态 | 处理 | 理由 |
|---|---|---|
| `blob:` 开头 | fetch → blob → FileReader → data URL | 会话内有效，刷新即死链 |
| `data:` 开头 | 直接采用 | 已是自包含形式 |
| 其他（http:/相对路径） | 忽略（coverUrl 保持 undefined） | 无法保证持久化后可达 |

整段包 try/catch 且注释 best-effort：封面失败绝不阻断导入。`new Promise` 包 FileReader 回调是把回调式 API 适配成 async/await 的标准手法（onloadend 在成功/失败时都触发，resolve(undefined 转 string) —— 失败时 reader.result 为 null，会被上游当 falsy 处理，又一个静默降级点）。

#### 【逐行级】段⑨：切章、兜底与组装（L157-211）

```ts
const chapters: Chapter[] = [];

if (flatToc.length > 0) {
  // Sort TOC entries by their spine position to ensure correct order
  const tocWithSpinePos = flatToc
    .filter((e) => e.id && spineIndex.has(e.id))          // 只留能映射回 spine 的条目
    .map((e) => ({ entry: e, spinePos: spineIndex.get(e.id)! }))
    .sort((a, b) => a.spinePos - b.spinePos);             // 按 spine 实际顺序重排

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
  coverUrl,
  chapters,
  importedAt: Date.now(),
};
```

这是全函数最精妙的部分：**一章 ≠ 一个文件**。以相邻 TOC 条目的 spine 位置为边界取区间，区间内的多个 XHTML 合并成一个章节。逐步拆：

1. **filter-map-sort 三连**：filter 砍掉无法映射回 spine 的目录条目（如指向锚点的子条目、损坏条目）；map 把 `spineIndex.get()` 的查表结果固化进对象（避免 sort 比较器里反复查 Map）；sort 保证后续区间计算的单调性——**如果 TOC 自身顺序是乱的，没有这一步排序，startPos > nextPos 会出现负区间**。
2. **区间收集**：`nextPos = 下一条件目的 spinePos ?? spine.length`，最后一个条目没有后继就用 spine 总长收尾。`[startPos, nextPos)` 左闭右开保证相邻区间无缝不重叠。
3. **两个 continue**：`htmlParts.length === 0` 跳过「目录里有但内容加载失败/为空」的幽灵章节；`pairs.length === 0` 跳过解析不出任何句对的空章。两者都用 `continue` 而不是 push 空章——UI 不该显示翻不开的目录项。
4. **`chapters.length` 当索引**：只有成功产出句对的分支才会 push，所以当前长度天然是下一个连续编号，无空洞。chapter.title 同样三层降级：`extractText(entry.label) || 第N章`——注意这里是 `||` 不是 `??`，空字符串标题也会触发默认值（比 `??` 更激进，对标题而言正确）。
5. **spine-per-chapter 兜底**：TOC 一无所获时（`flatToc.length === 0` 或全部 filter 光），退化为「每个 spine 文件算一章」，标题尽力从 flatToc 里找回（`find` 大概率找不到 → 默认「第N章」）。遍历 `spineHtml` 这个 Map 时顺序即插入顺序 = spine 顺序，章节顺序依然正确——这依赖 JS Map 的规范保证（插入序迭代），是个容易被忽视的语言知识点。
6. **最终组装**：`importedAt: Date.now()` 记录导入时间戳，Book 成型返回。此后它进入 Zustand → persist → localStorage（第 7 课的世界）。

### 【新增】复杂度总结

设书有 S 个 spine 文件、T 个 TOC 条目（扁平化后）、正文总字节量 B：

| 步骤 | 时间 | 空间 |
|---|---|---|
| flattenToc | O(T) | O(T) |
| spineIndex 构建 | O(S) | O(S) |
| loadChapter 循环 | O(S) 次库调用，解码成本 ∝ B | O(B)（全部正文驻内存） |
| 封面探测 | O(manifest + 3 页扫描) | O(1) |
| TOC 排序 | O(T log T) | O(T) |
| 切章循环 | O(T + S)，每块 HTML 只进一个区间 | 产出 chapters ≈ O(B) |
| **总计** | **O(B + T log T)**，B 主导 | **O(B)** 峰值（spineHtml + chapters 双份引用） |

空间峰值值得注意：`spineHtml` 和 `chapters[].pairs` 实际共享同一批字符串吗？不——`buildPairs` 产出的新字符串来自 textContent 提取，是拷贝。所以峰值接近 2B。对一本 5MB 正文的书约 10MB 内存瞬时占用，浏览器完全无压力；这也是「不做流式解析」决策的成本核算依据。

### 边学边练（检查点）

**检查点 ①**：盖住上文，说出 9 个段落各自的职责关键词。（提示：辅助五件套 = 扁平化/取文本/取作者/调度/封面；主流程四步 = 初始化/预载/固化/切章组装。）

<details><summary>参考答案</summary>

⓪ import+TocEntry 类型；① flattenToc 先序拍平；② extractText 四分支安全取值；③ extractCreator 数组/对象形态作者提取；④ 双通道句对调度（沉浸式翻译 ?? buildPairs）；⑤ 封面探测（manifest 信号定扫描宽度）；⑥ initEpubFile+元数据降级；⑦ spineIndex+spineHtml 两 Map 预载；⑧ blob→data URL 固化；⑨ TOC×spine 区间切章 + spine 兜底 + Book 组装。
</details>

**检查点 ②**：`tocWithSpinePos` 的 `.filter().map().sort()` 三步各删掉会发生什么？

<details><summary>参考答案</summary>

删 filter：无法映射回 spine 的条目（id 缺失或不在 spineIndex 中）会让 `spineIndex.get(e.id)!` 断言出 undefined，区间计算产生 NaN，静默产出错误章节甚至死循环式错排。删 map（预固化 spinePos）：sort 比较器每次比较都要查两次 Map，功能不变性能退化（小书无感，属风格问题）。删 sort：TOC 乱序书上 startPos 可能大于下一条件的 spinePos，区间为空或倒序，章节顺序错乱、内容丢失。
</details>

**检查点 ③**：为什么 `title` 的降级用 `??` 而 `chapter.title` 的降级用 `||`？两者互换会怎样？

<details><summary>参考答案</summary>

`extractText(entry.label) || 第N章` 用 `||` 是刻意的：label 净化后若是空串，`??` 不会触发（空串非 nullish），UI 会出现无名章节；`||` 把空串也算作缺失。顶层 `extractText(metadata.title) ?? 文件名` 用 `??` 则是因为 extractText 的失败出口是 null 而非空串（String(value) 兜底保证了非 null 出口必有内容）。互换的后果：顶层改 `||` 基本无害（null 也触发）；章标题改 `??` 则空标题章节漏网。核心：**降级运算符要与失败值的形态精确匹配**。
</details>

**检查点 ④**：`extractCreator([])` 的返回值是什么？`?? 'Unknown'` 兜底生效吗？

<details><summary>答案</summary>

返回 `String([])` 即 `''`（空数组落到最后的 extractText 兜底分支）。`''` 不是 nullish，所以 `?? 'Unknown'` 不生效，作者显示为空白。这是本函数的一个真实边界瑕疵——不影响主流程，但说明「兜底链的每一环都要核对失败值形态」。
</details>

## 实操作业

### 第一层（基础）：全流程追踪

用 console.log 给一本书做「全流程追踪」。

1. 在 `parseEpubFile` 内的关键节点插入日志（做完记得还原）：
   - `initEpubFile` 之后：打印 `metadata`、`spine.length`、`toc` 原始嵌套结构；
   - `flattenToc` 之后：打印扁平前后长度对比；
   - 每个 TOC 区间确定后：打印 `{ title: entry.label, start: startPos, end: nextPos, files: nextPos - startPos }`；
   - 组装完成后：打印 `book.chapters.map(c => ({ title: c.title, pairs: c.pairs.length }))`。
2. 导入一本日语书，对照控制台输出回答：
   - 这本书的 metadata.title 是字符串还是 `{_, $}` 形态？
   - 有没有一个 chapter 由多个 spine 文件合并而成（`files > 1`）？
   - coverUrl 最终是 `data:` 开头吗？
3. 故意破坏测试：把某本书 OPF 里 `dc:title` 手工改坏后重新打包（或直接在控制台 mock），验证 `extractText` 各分支真的被走到。
4. 把你观察到的「File → Book」变换写成一张自己版本的流程图。

### 第二层（验证）：防御矩阵实测

5. 把 `extractText` / `extractCreator` 原样复制到控制台，构造 8 种畸形输入逐一验证（每种先预测再验证）：
   - `extractText(null)` / `extractText(undefined)`
   - `extractText('普通字符串')`
   - `extractText({ _: 'xml2js形态', $: {} })`
   - `extractText(42)` / `extractText({})`
   - `extractCreator(['甲', '乙'])`
   - `extractCreator([{ contributor: '甲', role: 'aut' }])`
   - `extractCreator([])` ← 重点：验证检查点④的结论
6. 变异实验：把 `extractCreator` 末尾的 `return extractText(value)` 改成 `return null`，重新跑第 8 种输入——现在 `?? 'Unknown'` 生效了吗？思考哪种修法更好（改函数 vs 改调用方），为什么原作者可能保留现状（YAGNI：真实书源空数组作者概率趋近于零）。
7. 封面探测实验：找一本 EPUB 2 老书（无 `properties="cover-image"`），观察日志确认走了「只扫 1 个 spine 条目」路径；再手工往 OPF 里补一行 cover-image 声明重打包，确认扫描宽度变为 3。

### 第三层（综合）：复杂度测量与重构评估

8. 用 `performance.now()` 给三段计时：initEpubFile 总耗时、loadChapter 循环总耗时、切章+句对提取总耗时。换一本 10 倍厚的书重跑，验证耗时是否随 B 线性增长（对照本课复杂度表）。
9. 写一份 300 字以内的备忘：「如果把 spineHtml 全量预载改成『切章时按需加载』，哪些代码要动、会破坏什么？」（提示：封面探测依赖 spineHtml 已填充；兜底分支遍历的也是 spineHtml；按需化会把 IO 错误处理从集中一点扩散到多处。）
10. （选做挑战）给 `flattenToc` 写一个显式栈的迭代版本，保持输出与递归版逐元素相同（注意先序语义：父节点入栈后要**逆序**压子节点）。用嵌套 TOC 的真书对比两版输出。

**验收标准**

- [ ] 日志能证明你亲眼看到了 flattenToc 前后的结构差异。
- [ ] 能指出至少一处「如果去掉安全取值就会崩/显示 undefined」的真实数据形态。
- [ ] blob → data URL 转换的原因能用自己的话说清（提示：localStorage 持久化）。
- [ ] 自制流程图覆盖了本课图示的全部节点才算过关。
- [ ] 8 种畸形输入的预测与实际一致（至少错 1 次并搞懂为什么错，比全对更有价值）。
- [ ] 三段计时数据齐备，且能用 O(B) 解释厚书的耗时变化。

## 本课与面试

- **复杂度分析现场题**：「设计一个 EPUB 解析器，说说各步骤的时间空间复杂度。」本课给出了完整模板：地图构建 O(S+T)、排序 O(T log T)、正文处理 O(B) 主导、空间峰值 O(B)。加分动作：主动指出「loadChapter 顺序 await 未并发」并提出 `Promise.all` 分批并发方案及其权衡（内存峰值 × 并发度、失败粒度变粗）。
- **防御式编程/脏数据处理**：`extractText` 四分支是绝佳的白板素材。面试话术骨架：先列数据形态清单（来自真实观察）→ 每种形态一条处理分支 → 兜底原则（永不让脏数据抛异常打断主流程）→ 诚实指出兜底的副作用（`[object Object]`、空串逃逸）→ 结论「安全取值函数 + unknown 类型强制消费方净化」。
- **回调转 Promise**：段⑧的 `new Promise((resolve) => { reader.onloadend = ... })` 是高频手写题「把 XHR/FileReader 包装成 Promise」的原型。注意 onloadend vs onload 的差别（前者失败也触发）。
- **Map 的迭代顺序**：兜底分支遍历 `spineHtml` 依赖「Map 按插入序迭代」这一语言规范保证（ECMA-262 §23.1）。对比：普通对象整数键会升序重排、字符串键按插入序但有 prototype 风险。「为什么这里必须用 Map 不能用对象」是好的深挖话题。
- **分层降级模式**：`方法调用 ?? 属性访问 ?? 默认值` 三层链是对「第三方库 API 不稳定」的标准应对。可迁移场景：适配多个 LLM provider 的响应字段、兼容新旧浏览器 API（如 `navigator.clipboard ?? document.execCommand`）。面试中能举一反三地讲「降级链的每一层解决哪一版差异」即可。

## 常见坑

- **以为一章就是一个 XHTML**：出版商经常按大小切文件，一话拆成 part1/part2/part3；本项目靠「相邻 TOC 条目之间的 spine 区间」合并解决，直接按文件数循环会得到碎片化的假章节。
- **忽略 TOC 与 spine 顺序不一致**：有的书 TOC 顺序是错的或故意乱序，代码里 `.sort((a, b) => a.spinePos - b.spinePos)` 不是装饰，删掉它章节会错乱。
- **blob URL 直接入 store**：`createObjectURL` 的结果只在当前页面会话有效，persist 到 localStorage 后刷新就是死链；必须先转 data URL。
- **对库 API 做 `??` 时漏掉空对象**：`epub.getMetadata?.() ?? epub.metadata ?? {}` 三层缺一不可——只写两层，遇到「方法存在但返回 undefined」的老版本库就会在后面 `.title` 处炸掉。
- **【新增】在 catch 里吞掉所有错误还不留痕**：单章 try/catch 是正确的容错粒度，但完全静默会让「这本书少了三章」变成无头公案。生产化的做法是收集 skipped 列表并在导入完成 toast 里提示——记住容错的正确姿势是「降级 + 可观测」，不是「假装没事」。
- **【新增】把 `chapters.length` 当索引的技巧误用到别处**：它成立的前提是「push 与编号严格同步」。如果你给切章循环加了一个「跳过但保留编号」的需求，这个技巧立刻变 bug 源。技巧与不变量绑定，挪用时先核对不变量还在不在。

## 自测题

1. `extractText` 为什么要检查 `'_' in value`？

   <details><summary>答案</summary>

   很多 XML→JS 反序列化器（如 xml2js）把元素文本放在 `_` 属性、属性放在 `$` 属性。EPUB 元数据经过这类转换后 `title` 可能是 `{ _: '吾輩は猫である', $: {...} }`，直接 `String(value)` 会得到 `[object Object]`。
   </details>

2. `flattenToc` 使用的是先序遍历，如果换成后序遍历会有什么后果？

   <details><summary>答案</summary>

   后序会把子条目排在父条目前面，破坏目录的文档顺序；虽然后面还会按 spinePos 重排，但依赖 TOC 兜底路径（spine-per-chapter fallback）里 `flatToc.find(...)` 找标题时顺序语义就不对了，且先序才是符合人类直觉的目录顺序。
   </details>

3. 封面探测中 `hasCoverInManifest` 为 true 时为什么反而扫描更多 spine 条目（3 个 vs 1 个）？

   <details><summary>答案</summary>

   manifest 声明 cover-image 说明这本书遵循规范、大概率有独立封面页，封面可能在第 1~3 个 spine item 中（如 cover 页 + 标题页组合）；而没有声明时无法信任任何位置，只保守地看第一个条目，避免把正文第一段落的插图误当封面。
   </details>

4. 为什么切章要以「相邻 TOC 条目的 spine 位置差」为边界，而不是让每个 TOC 条目对应一个文件？

   <details><summary>答案</summary>

   因为一章可能横跨多个 XHTML 文件（出版商按体积切分），也可能一个文件包含多章开头。spine 区间是唯一可靠的「章节内容范围」定义；区间末尾用 `?? spine.length` 处理最后一个 TOC 条目没有后继的情况。
   </details>

5. `extractPairsFromHtml(htmlParts, chapterIndex)` 中传入的 `chapterIndex` 是 `chapters.length`，这有什么讲究？

   <details><summary>答案</summary>

   只有成功产出句对的分支才会 push 进 `chapters`，所以用当前长度作为下一个索引可以保证 chapterIndex 连续且无空洞（被 `continue` 跳过的空章节不会占用编号）；这个值随后被写入每个 SentencePair 的 id（`ch${chapterIndex}-p${pairIndex}`）与 chapterIndex 字段。
   </details>

6. 【新增】`parseEpubFile` 整体的时间与空间复杂度是多少？瓶颈在哪一段？

   <details><summary>答案</summary>

   时间 O(B + T log T)，其中 B 是正文总字节量（loadChapter 解码与句对提取主导），T 是 TOC 条目数（排序项）；S 个 spine 文件的循环是 O(S) 次。空间峰值 O(B)：spineHtml 全量缓存加 chapters 产出的字符串拷贝接近 2B。瓶颈是正文相关的一切——这也解释了为什么优化方向应聚焦 loadChapter 并发与句对提取效率，而非去抠 T log T 的排序。
   </details>

7. 【新增】封面固化分支里，`rawCoverUrl` 以 `http://` 或相对路径开头时会怎样？为什么这样设计？

   <details><summary>答案</summary>

   两个 if 都不命中，coverUrl 保持 undefined，等于放弃封面。因为这两种引用要么跨域（fetch 可能被 CORS 拒绝且持久化后依赖网络）、要么相对于已不存在的上下文（persist 后相对路径失去基准目录），都无法保证「刷新后仍可显示」。宁可没有封面，不留死链——自包含性优先于覆盖率。
   </details>

8. 【新增】spine-per-chapter 兜底分支遍历 `spineHtml`（一个 Map），为什么章节顺序依然是正确的 spine 顺序？换成普通对象会有什么风险？

   <details><summary>答案</summary>

   JS 规范规定 Map 按插入序迭代，而 spineHtml 是按 spine 顺序插入的，所以迭代序即 spine 序。换成普通对象有两个风险：整数样式的键（如 "1","2"）会按数值升序重排而非插入序；对象原型链上的键（如 "constructor"）可能造成误命中或需要 hasOwnProperty 防御。这正是该处选用 Map 而非对象的隐性理由。
   </details>
