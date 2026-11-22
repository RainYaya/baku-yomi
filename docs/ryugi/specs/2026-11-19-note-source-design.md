# baku-yomi · note.com 材料源设计

> 日期：2026-11-19
> 状态：待批准（brainstorming 产出的 written design）
> 归属：**材料聚合器 goal 的 M1**——note 是第一个来源适配器，不是整个产品方向。
> 范围：note.com 一个站点；现有 EPUB / 粘贴 / 通用 URL 导入的**行为**不变（只为 note 回退给 `PasteTextDialog` 增加一个可选的 note 上下文）。

---

## 1. 意图与为什么

baku-yomi 现在能读 EPUB、粘贴文本、抓单个 URL，但没有“持续发现日语材料”的地方。每次都要先找到文章、复制链接、再走一遍导入。

note.com 是一个适合补上这块的站点：

- 公开文章多，日语随笔、日记、书评、短篇小说的量足够；
- 有官方 RSS，能按**作者**或**话题**拿到最新文章列表（已实测）；
- 文章页服务端渲染，正文可直接抓取（已实测，现有提取器能读到 1499 字）；
- 文章是单语日语，正好复用现有的“按章 AI 翻译”。

目标不是做 note 客户端，而是：**在 baku-yomi 里有一个独立的 note 区域，能按话题看到值得读的日语文章，点开哪篇才抓哪篇。**

## 2. 目标

1. 新增一个与书架、生词并列的 **note 视图**。
2. 默认带一组适合日语阅读的话题源，打开就有内容，不需要用户先配置。
3. 列表只显示标题、作者、日期、摘要、缩略图；**不抓正文**。
4. 点击文章时才抓正文，清理后作为一章放进一个隐藏的 “note” 书，用现有阅读器打开。
5. 复用现有能力：按章 AI 翻译、划词讲解、生词本、阅读进度、书签。
6. 过滤不想看的内容：政治、选举、战争、宗教、投资等，默认屏蔽，词表可编辑。
7. 支持添加/移除话题源；也支持添加某个 note 作者（未来可能用得上，但默认没有作者）。
8. 刷新失败、单源失败、文章抓取失败都有可见的错误和回退，不静默。

## 3. 非目标 / 反目标

- **不做登录**。付费、关注者限定、会员文章抓不到；遇到时给出提示并允许在 note 打开。
- **不抓 note 首页推荐、搜索、标签页 HTML**：`/api/*` 和 `/search` 被 robots 禁止，首页是 Next.js 内部数据，脆弱。列表只走官方 RSS。
- **不做 note 客户端**：不点赞、不评论、不关注、不发布。
- **不做通用 RSS 阅读器**：只为 note 做适配；以后要加别的站点，另开设计。
- **不做后台定时抓取 / 推送**：进入 note 区域或手动刷新时才拉 RSS。
- **不自动翻译整篇**：翻译仍由阅读器里的「翻译本章」按需触发。
- **不引入新的 UI 组件库**；沿用 `artboard.css` 的 token 和排版。

## 4. 约束

- note RSS：
  - 作者：`https://note.com/{urlname}/rss`
  - 话题：`https://note.com/hashtag/{tag}/rss`（注意不是 `/tag/`，实测 `/tag/.../rss` 是 404）
  - 每个 feed 返回约 25 条；字段含 `title`、`link`、`pubDate`、`description`（HTML，可能是全文也可能只是摘要）、`creatorName`（作者 RSS 是裸标签，话题 RSS 在 `note:` 命名空间）、`media:thumbnail`。
- 文章页：Next.js 服务端渲染；正文在 `#note-body`，元数据在 JSON-LD 的 `BlogPosting`（`headline`、`author.name`、`datePublished`、`keywords`）。
- 文章页可被非浏览器 UA 访问（已用项目 UA 实测 200）。
- robots：`/api/*`、`/search` 禁止；文章页与 RSS 不在禁止列表。**不使用 `/api/*`。**
- localStorage 约 5MB；已打开的正文、译文、生词都进 localStorage，需要沿用 `StorageHealthNotice` 的提示。
- 服务端 Hono 无状态；不落数据库；不持有用户 cookie。
- 复用现有 SSRF 防护思路：只允许 `note.com`，只允许 80/443，限制重定向、大小、超时。
- 测试是 `node --test` + tsx；纯逻辑放可测试的模块，组件保持薄。

## 5. 已经决定的（来自对话）

- 用户目前**没有固定追的作者**，所以列表以**话题**为主，不做“关注流”。
- 用户**没有指定想看的话题**，但明确**不想看政治之类**。默认话题由实现方给出，用户可改。
- 用户想要**独立区域**，不是塞进书架的一个筛选。
- 用户想要**按需显示**：列表轻，点进去才加载正文。
- 这是日语材料的第一步；先把 note 做好，不提前做通用多站点框架。

## 6. 我的判断（实现方可以改，但要在交付时说明）

| 决定 | 我的选择 | 理由 |
|---|---|---|
| 默认话题 | `#エッセイ`、`#暮らし`、`#読書`、`#小説` | 实测四个 feed 都有内容；随笔/生活/书评/短篇适合阅读，避开新闻时政。`#日記` 太碎，先不放。 |
| 作者源 | 支持添加，但默认没有 | RSS 解析逻辑与话题源几乎相同；以后用户遇到喜欢的作者可以加。 |
| 列表形态 | 单列信息流，最大宽度约 760px；缩略图可选 | 日语文章标题长，单列比卡片网格好扫读。 |
| 正文缓存 | 打开的文章永久存进隐藏 note 书；列表元数据也缓存 | 译文/生词/进度都依赖稳定的 chapter/pair id，不能每次重新抓。 |
| 隐藏书 | 固定 id `note-book`，标题 `note` | 阅读器、生词、备份都能直接复用；书架默认不显示它。 |
| 已读 | 点开即已读；不做滚动进度判定 | 简单、可预测。 |
| feed 缓存 | 持久化每个源最近 25 条元数据，TTL 15 分钟 | 进入页面先秒开；过期后台刷新。 |
| 屏蔽 | 默认关键词表 + 手动“隐藏这篇” | 话题源本身避开时政；关键词是兜底。 |
| 图片 | 正文只取文字，跳过图片 | 阅读器是文字优先；图片多的文章文字会少，可接受。 |
| 翻译 | 不自动；阅读器里手动触发 | 控制成本，符合现有交互。 |
| 打开上限 | MVP 不自动删除；显示打开篇数，接近配额由现有提示接管 | 不静默删用户数据。 |

## 7. 形态

### 7.1 入口与导航

- `AppView` 增加 `'note'`；`App.tsx` 渲染 `NotePage`。
- 首页、书架页顶栏各加一个 **「note」** 按钮（放在「生词」旁边）。
- note 页顶栏：`baku-yomi`（回首页）· `note · 阅读源`；右侧：刷新、管理来源、设置、主题。
- 移动端 <560px：顶栏折行；来源变成横向 chips；文章单列。

### 7.2 note 页结构

```
┌ 顶栏：baku-yomi | note · 阅读源        刷新  管理来源  设置  主题 ┐
├ 来源条：[全部] [#エッセイ 12] [#暮らし 8] [#読書 5] [#小説 3]  + ┤
├ 信息流：                                                       │
│  缩略图  标题（日语）                                4小时前   │
│          作者 · #エッセイ                                      │
│          摘要两行……                           [隐藏] [打开]     │
│  ……                                                            │
└────────────────────────────────────────────────────────────────┘
```

- **来源条**：`全部` + 每个源，带未读数；点击筛选；末尾 `+` 打开管理来源。
- **条目**：缩略图（可无）、标题、作者、相对时间、来源标签、两行摘要。
- **操作**：整卡点击打开；悬停/聚焦出现「隐藏这篇」。
- **状态**：
  - 首次加载：骨架/“正在读取 note 的更新…”
  - 单源失败：来源条上该源显示错误标记，其他源照常显示；顶部一行“1 个来源读取失败，点击重试”。
  - 全部失败：可见错误 + 重试 + “在 note 打开”说明。
  - 空：没有源时显示推荐话题和“添加来源”；有源但全被过滤时显示“当前话题下没有可读的新文章”。
- **刷新**：手动刷新按钮；进入页面时若缓存超过 15 分钟自动刷新；不做定时轮询。

### 7.3 管理来源

一个对话框（沿用现有 settings/paste 的 dialog 样式）：

- 当前来源列表：`#エッセイ` 等，可停用/移除。
- 添加输入：
  - `note.com/{urlname}` → 作者源；
  - `note.com/hashtag/{tag}` 或直接输入 `#エッセイ` / `エッセイ` → 话题源；
  - 粘贴完整 URL 也可以。
- 推荐话题 chips。
- **不想看的话题/关键词**：多行文本，一行一个；默认表见 §8.3。保存后立即过滤列表。
- **已隐藏的文章**：列出 `hiddenUrls`，可逐条恢复或清空；点「隐藏这篇」时先给一个带「撤销」的 toast。
- **来源上限**：最多同时启用 8 个来源；达到上限时提示先停用一个。总来源数最多 20。
- 说明文字：只支持公开文章；付费/限定文章打不开，遇到时会给出明确提示。

### 7.4 打开一篇文章

1. 点击条目 → 条目进入 loading（其他条目仍可点）。
2. 客户端调用 `POST /api/note/article { url }`。
3. 服务端校验 URL 必须是 `note.com/{urlname}/n/{key}`；抓取、清理正文、返回 `{ title, author, publishedAt, tags, paragraphs, text }`。
4. 客户端确保隐藏 note 书存在；按 `sourceUrl` 查重：
   - 已存在 → 直接打开那一章；
   - 不存在 → 追加一章（复用 `paragraphsFromText` / `buildPairs` / `scopePairIds`），记录 `Chapter.note` 元数据。
5. `setCurrentBook(noteBookId)`、`setCurrentChapter(index)`、`setCurrentView('reader')`。
6. 标记该 URL 已读。
7. 失败与半公开文章：
   - HTTP 401/403 → “这篇需要登录或权限，去 note 打开”；给外链，不建章。
   - HTTP 200 但页面出现付费/限定标记（`有料`、`ここから先は有料`、paywall 容器），或 `#note-body` 文本异常短 → 服务端返回 `status: 'partial'` 和已取到的正文；客户端提示“这篇可能只公开了一部分”，给两个选择：**仍然导入可见部分** / **去 note 打开**。默认不自动写入，避免把半篇文章当成全文。
   - 正文为空 → `status: 'empty'`，提示“没有读到公开正文，可能是付费/限定文章”。
   - 网络/解析失败 → 可见错误 + 重试 + “手动粘贴正文”回退。
   - **回退是 note-aware 的**：给现有 `PasteTextDialog` 增加可选 `note` 上下文（url/title/author/publishedAt/sourceKind/sourceKey）。带该上下文时走 `appendNoteChapter` 并按 URL 查重，跳过“目标书”选择器；不带时行为与现在完全一致。这样不会产生没有 `note.url` 的孤儿章节，也不会在之后成功抓取时重复建章。

### 7.5 阅读器里的 note 章节

- 章节标题 = 文章标题；`chapter.sourceUrl` = 原文链接；`chapter.note` 存作者、发布时间、来源话题/作者。
- 章头显示来源行：`note · 作者 · 2026-11-17`，可点外链。
- 「翻译本章」、划词讲解、生词、书签、进度全部照常工作，因为 note 章就是普通 `Chapter`。
- 隐藏书不出现在书架列表；如果用户从首页“继续阅读”进入，也能正常打开。
- 生词条目里的 `source.bookId` 指向 `note-book`，不影响“回到原文”。

## 8. 数据与逻辑

### 8.1 类型

```ts
export type NoteSourceKind = 'hashtag' | 'author';

export interface NoteSource {
  id: string;                 // stable: `hashtag:エッセイ` / `author:onniilgi`
  kind: NoteSourceKind;
  key: string;                // tag or urlname
  label: string;              // `#エッセイ` / `seoyun`
  enabled: boolean;
  addedAt: number;
}

export interface NoteFeedItem {
  url: string;                // canonical article URL
  title: string;
  author: string;
  publishedAt: number;
  excerpt: string;
  thumbnail?: string;
  sourceId: string;           // which source surfaced it
}

export interface NoteSourceCache {
  sourceId: string;
  items: NoteFeedItem[];
  fetchedAt: number;
  error?: string;
}
```

`BookSourceKind` 增加 `'note'`；`Chapter` 增加可选：

```ts
note?: {
  url: string;
  author: string;
  publishedAt: number;
  sourceKind: NoteSourceKind;
  sourceKey: string;
  tags?: string[];
};
```

### 8.2 状态

新增 `src/stores/noteSlice.ts`（Zustand + persist，key `note-store`，进入备份）：

- `sources: NoteSource[]`（首次运行种入默认 4 个话题，`seededAt` 防重复）
- `caches: Record<string, NoteSourceCache>`
- `readAt: Record<string, number>`（按规范化 URL；只保留最近 500 条）
- `hiddenUrls: string[]`（手动隐藏，最多 500）
- `blockedKeywords: string[]`（默认表，可编辑）
- actions：`addSource`（校验；启用数上限 8、总数上限 20）、`removeSource`、`toggleSource`、`setCache`、`markRead`、`hideItem`、`unhideItem`、`clearHidden`、`setBlockedKeywords`、`ensureDefaultSources`。

隐藏 note 书在 `bookSlice`：

- `ensureNoteBook(): string`：不存在就创建 `{ id: 'note-book', title: 'note', author: 'note.com', chapters: [], source: { kind: 'note' }, chapterSeq: 0 }`。
- `appendNoteChapter({ bookId, title, text, note }): { chapterIndex } | { existingIndex }`：按 `note.url` 查重；新建章节时使用 `chapterSeq`，保证 pair id 不复用。
- 书架/首页的普通书列表过滤 `source.kind === 'note'`；但当前书是 note 书时，“继续阅读”仍显示。
- 备份：`note-store` 加入 `BACKUP_KEYS`；`book-store` 已包含隐藏书。

### 8.3 默认屏蔽词

用户明确不想看政治类。默认表（可编辑，匹配标题 + 摘要，大小写不敏感）：

```
政治 選挙 政権 政府 国会 首相 大臣 外交 戦争 紛争 軍事 宗教
株 投資 FX 仮想通貨 副業 マネー ニュース 時事
政治 选举 战争 宗教 投资
```

- 只按词包含匹配；不做语义判断。
- 被屏蔽的条目不显示；在管理来源里能看到“已屏蔽 N 条”，可清空词表恢复。
- 手动「隐藏这篇」写入 `hiddenUrls`，与屏蔽词分开。隐藏后给带「撤销」的 toast；管理来源里的「已隐藏」可逐条恢复或清空。隐藏状态只存 URL，不删任何正文。

### 8.4 合并与排序（纯函数）

`src/lib/note/feed.ts`：

- `mergeFeeds(caches, sources, prefs): NoteFeedItem[]`
  - 只取 enabled 源；
  - 去掉 `hiddenUrls` 和命中 `blockedKeywords` 的条目；
  - 按 URL 去重（保留最早出现的源标签）；
  - 按 `publishedAt` 降序；
  - 最多 120 条。
- `unreadCount(item, readAt)`、`relativeTime`、`excerptFromHtml`、`normalizeNoteUrl`。
- 全部有测试。

### 8.5 服务端解析（纯函数）

`server/note/rss.ts`：

- `parseNoteRss(xml, source): NoteFeedItem[]`
  - 支持裸标签和 `note:` 命名空间的 `creatorName`；
  - 支持 CDATA 和实体；
  - `description` 去标签得到摘要，保留前 180 字；
  - 缺字段时降级，不抛整源错误；
  - 上限 25 条/源。

`server/note/article.ts`：

- `extractNoteArticle(html, url): NoteArticle`
  - JSON-LD 取 `headline`、`author.name`、`datePublished`、`keywords`；
  - `#note-body` 取正文；按 `<p>`、`<h1..h3>`、`<li>`、`<br>` 转成段落；
  - 去掉脚本/样式/图片/嵌入/脚注按钮；
  - 没有 `#note-body` 时回退到通用 `<article>` 提取；
  - 返回 `status`：
  - `'ok'`：正常公开文章；
  - `'partial'`：页面有付费/限定标记（`有料`、`ここから先は有料`、paywall 容器）或正文明显短于正常文章；
  - `'empty'`：没有 `#note-body`、回退也没有正文，或正文 < 40 字。
- 路由把 `partial` / `empty` 映射成不同错误码和文案，由客户端决定“仍然导入可见部分”还是“去 note 打开”。

### 8.6 服务端路由

`server/routes/note.ts`：

- `POST /api/note/feed`
  - body `{ sources: [{ kind, key }], force?: boolean }`，最多 8 个启用源；
  - 逐个抓 RSS（超时 10s、上限 2MB、重定向最多 3 次）；
  - 每个源独立返回 `{ sourceId, items, error? }`，一个源失败不影响其他源；
  - 内存缓存 10 分钟，key 为 `kind:key`；**只缓存成功响应，不缓存错误**；
  - `force: true` 绕过缓存（手动刷新和“重试”都发送它；自动刷新不发送）；
  - 只允许 `note.com`。
- `POST /api/note/article`
  - body `{ url }`；
  - URL 必须是 `https://note.com/{urlname}/n/{key}`（可带 query，规范化时去掉）；
  - 抓取时限制 host、端口、重定向、大小、超时；
  - 不发送 cookie，不使用登录态；
  - 返回 `{ title, author, publishedAt, tags, paragraphs, text, url }`。
- 错误码：400 参数/域名、404 文章不存在、422 正文为空、502 上游失败、504 超时；错误信息用中文，可回退。

### 8.7 安全

- 复用 `fetchUrl.ts` 的私有 IP / hostname / 端口 / 重定向校验；note 路由额外锁死 `note.com`。
- 不代理 note API，不保存 note cookie。
- 抓到的 HTML 只转纯文本，不注入 `dangerouslySetInnerHTML`；标题/摘要按文本渲染。
- RSS 的 `description` 先解码再剥标签，避免把脚本带进 UI。

### 8.8 note 书在现有界面里的可见性

新增共享判断 `isNoteBook(book) = book.source?.kind === 'note'`，各界面按这张表处理：

| 界面 | note 书 | 说明 |
|---|---|---|
| 首页书单 / 书架网格 / 书架 rail / 计数 | 排除单本笔记；材料库的“来源”分组显示一张 note 卡片 | note 不淹没书单，但仍是材料库的一部分 |
| 首页空状态、`books.length === 0` 判断 | 排除 | note 书不应让首页误以为已有书 |
| 首页“继续阅读” | 包含，但只按当前书 / 最近阅读判断，并加 `note` 标记 | 刚读完 note 文章再回来，应该能继续 |
| 首页/书架的书名搜索 | 排除 | 搜索的是书，不是 note 文章 |
| 粘贴对话框的“目标书”选择器 | 排除 | note 回退走自己的 note-aware 路径 |
| 练习回顾（列表与书筛选） | 包含，书筛选里显示 `note` | 练习历史不应丢失 |
| 生词本“回到原文”、书签、备份、阅读器 | 包含 | 依赖稳定的 book/chapter/pair id |

实现时把过滤集中在一个 `visibleBooks` 选择器/辅助函数里，避免每个组件各自写 `filter`。



- 沿用 paper / night 两个主题和 `--bg --text --paper --rule --red` 等 token。
- 顶栏复用 `shelf-topbar` / `shelf-btn` / `shelf-crumb`；来源条用小号 mono 标签。
- 信息流是“纸张上的剪报”：细分割线、标题用阅读字体（`Zen Maru Gothic`），元信息用 `IBM Plex Mono`，来源标签用朱色。
- 不做 note 官方的绿色品牌色；保持 baku-yomi 自己的纸页感。
- 信息流单列，桌面最大 760px；缩略图 96×72，无图时不留空框。
- 移动端 400px：缩略图可隐藏，标题两行，摘要一行，来源标签保留。
- 空状态：一句说明 + 推荐话题 chips + “添加来源”。

本轮没有 artboard；如果实现时对信息流密度或来源条形态有分歧，再单独开一轮 artboard。

## 10. 测试与验收

### 自动测试

- `tests/noteRss.test.ts`
  - 作者 RSS、话题 RSS 各一个 fixture；
  - CDATA/实体/命名空间 `note:creatorName`；
  - 缺 `creatorName`、缺 `description` 不崩；
  - 条目顺序与上限。
- `tests/noteArticle.test.ts`
  - 从 fixture 提取 JSON-LD 标题/作者/日期；
  - 只取 `#note-body`，不把作者栏、标签、相关文章带进来；
  - `<h2>`/`<p>`/`<li>` 转段落；
  - 无 `#note-body` 时回退；正文为空时返回 `empty`。
- `tests/noteFeed.test.ts`
  - 合并、去重、排序、屏蔽词、手动隐藏、未读数、URL 规范化。
- `tests/noteBook.test.ts`
  - `ensureNoteBook` 只创建一次；
  - `appendNoteChapter` 按 URL 查重；
  - `chapterSeq` 递增，pair id 不复用；
  - 两篇文章互不串数据。
- 现有测试全绿。

### 手动验收

1. 打开首页 → 点「note」→ 默认 4 个话题，列表有内容。
2. 切换来源筛选；未读数正确。
3. 点一篇文章 → 进入阅读器；正文是日语，没有作者栏/标签/相关文章。
4. 回到 note → 该条已读；再点同一篇 → 直接打开，不重复建章。
5. 在阅读器点「翻译本章」→ 中文按句出现；刷新后仍在。
6. 划词存一个生词 → 生词本里“回到原文”能跳回 note 章。
7. 在管理来源里加一个作者 URL → 列表出现该作者文章。
8. 在屏蔽词里加一个标题里的词 → 该条消失；清空后恢复。
9. 断网刷新 → 显示缓存列表 + 可见错误；恢复网络后刷新正常。
10. 390×844 和 1100×800 宽度不溢出。
11. `pnpm test`、`pnpm exec tsc -b`、`pnpm build` 通过；lint 不新增错误（当前基线本来就不绿，见 HANDOFF）。

## 11. 分阶段（同一个 goal 内顺序执行）

| 阶段 | 内容 | 自检 |
|---|---|---|
| M1 | RSS 解析、文章正文提取、两个 note 路由、fixture 测试 | 纯函数测试绿；用真实 note URL 手动跑通 |
| M2 | `noteSlice`、feed 合并/过滤/未读纯函数、隐藏 note 书与章节追加 | store/纯函数测试绿 |
| M3 | note 视图、来源条、信息流、管理来源对话框、加载/错误/空状态 | 页面可浏览、可加源、可筛选 |
| M4 | 点文章 → 抓正文 → 建章 → 打开阅读器；已读/查重/回退 | 手动验收 3–7 通过 |
| M5 | 移动端、错误文案、存储提示、文档（HANDOFF/README 的 note 一节） | 验收 8–11 通过 |

每个阶段先过自己的自检再进入下一个；不 mid-goal 停下等确认。M1–M4 是核心，M5 是收尾。

## 12. 留给实现方的

- 具体的 RSS/文章清理边界（哪些标签保留、图片 alt 是否保留）；
- 信息流的视觉细节（缩略图比例、摘要行数、来源条在桌面的宽度）；
- 缓存 TTL、条目上限、屏蔽词表的最终默认值（可微调）；
- 服务端是否加简单限流（个人使用可以先不加，但要说明）；
- 是否在书架给 note 书一个可见入口（默认不显示，只从 note 视图进）。

## 13. 本轮使用的 artifact

- 无 artboard、无外部设计稿。技术探测只用了 curl 读取 note.com 的公开 RSS/文章页；没有保存任何 note 内容进仓库。
- 关键探测结论已写在 §4，不依赖本地临时文件。

---

## 14. 验收一句话

打开 note 区域就能看到一组可读的日语文章；点哪篇才抓哪篇；读的时候翻译、讲解、生词都照常；不想看的内容默认不出现。

## 15. builder check 的处理

独立 reviewer 读完后提了 6 个会改变做法的问题，处理如下（均已并入上文，没有留给用户回答的项）：

| 问题 | 处理 |
|---|---|
| 手动粘贴回退与 note 元数据/查重 | 给 `PasteTextDialog` 加可选 `note` 上下文；带上下文时走 `appendNoteChapter` 并按 URL 查重，不带时行为不变。见 §7.4。 |
| 如何识别付费/限定文章 | 401/403、付费标记、正文过短三种情况分开返回 `blocked` / `partial` / `empty`；`partial` 由用户决定是否只导入可见部分。见 §7.4、§8.5。 |
| 「隐藏这篇」在哪里恢复 | 管理来源增加「已隐藏」列表，可逐条恢复/清空；隐藏时给撤销 toast。见 §7.3、§8.2、§8.3。 |
| 启用源超过 8 个 | 启用上限 8、总数上限 20；达到上限时提示先停用一个，客户端和服务端都校验。见 §7.3、§8.2、§8.6。 |
| 手动刷新与服务端缓存 | 服务端只缓存成功响应；`force: true` 绕过缓存，手动刷新/重试发送，自动刷新不发送。见 §8.6。 |
| note 书在哪些界面可见 | 用统一的 `isNoteBook` 和 §8.8 的可见性表；书单/计数/粘贴目标排除，继续阅读/练习回顾/生词/备份包含。 |

reviewer 明确跳过的、留给实现方的项（清理边界、视觉细节、TTL/上限微调、限流、书架入口）仍在 §12。

