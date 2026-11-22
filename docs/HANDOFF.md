# 交接文档

> 写给「换一台电脑继续开发」的自己。目标是：读完这一份，装好环境，就能接上上下文。
> 最后更新：2026-11-20（main 分支，材料聚合器 M0–M6）

---

## 1. 这是什么

baku-yomi 是给中文母语者的日语阅读器：导入双语材料，逐句读日文原文和中文译文，可选回译练习、AI 讲解、TTS 朗读。2026-11 新增了**语境生词本**——读到哪个词就存哪个词，句例优先，不做事先批量抽词。

阅读是主线，练习是第二步。没有强制进度、没有刷题模式、不会自动弹出练习。

## 2. 当前状态（2026-11-20）

main 上已完成：

- **材料聚合器**：材料库按来源筛选（书 / 链接 / AI 情景 / 字幕），书卡带来源徽章；「添加材料」统一收 EPUB、粘贴/URL、字幕、AI 情景、note。
- **UI v2**：paper（纸页）/ night（夜读）两个主题，同一结构换皮；桌面 ≥1100px 是纸页内嵌 + 翻页双栏，手机/平板单栏。
- **六个页面**：首页（桌面）、书架、阅读器（活页夹）、note 阅读源、练习记录、生词本。
- **note 源**：默认话题 RSS，也可加作者/话题；点文章才抓正文，存进隐藏的 `note-book`，按 URL 去重；付费/空正文有明确状态；支持屏蔽词。
- **AI 情景材料**：描述情景 → 生成双语对话/短文 → 预览可编辑 → 保存成普通书（`source.kind = 'ai'`，徽章「AI 情景」）。
- **字幕导入**：`.srt` / `.vtt`，支持双语配对、单语日语、脏标签清理；一个文件一本书（一章）。
- **练习记录**：全局记录所有材料的批改；`attempts` 保存每次回译，展开可看历史；可按材料/来源/分数/错误/时间筛选并搜索。
- **随机练习**：从全部或筛选后的材料随机抽一句，避开最近 20 次；空池给出原因；批改后可「再抽一句」。
- **材料导入**：EPUB、粘贴文本、URL 抓取；粘贴时可选择目标书/合集，把新文章追加成章节。天声人语这类每日文章：建一个合集，每天把 URL 或正文追加进去。
- **阅读辅助**：划词标记颜色、划词「讲解」（读懂/拆句/用法/语感）、划词「生词」、TTS 连续朗读、书签跳转。
- **生词本**：划词加入、AI 补全、紧凑/卡片两种列表、搜索筛选、ref 格式导出。
- **数据**：全部存 localStorage，可导出/恢复 JSON 备份；练习数据 v1 会自动迁移到 attempts v2。

测试 191 条通过，`tsc -b` 与 `pnpm build` 通过。

## 3. 跑起来

要求 Node >= 22、pnpm。

```bash
pnpm install
pnpm dev
```

- 前端 `http://localhost:5174`（被占用时 Vite 会自动顺延，看终端输出）
- API `http://localhost:3003`（Vite 把 `/api` 代理过去）

首次使用：设置里选 AI 供应商。默认是「B站免费」（无需 key），也可以填 OpenAI / Anthropic / Google 的 key，key 只存在浏览器 localStorage，不会上传。

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 前端 + API 一起起 |
| `pnpm test` | `node --import tsx --test tests/*.test.ts` |
| `pnpm exec tsc -b` | 类型检查 |
| `pnpm lint` | ESLint |
| `pnpm build` | 类型检查 + Vite 构建到 `dist/` |
| `pnpm start` | 生产模式，Hono 同时服务 `dist/` 和 API，端口 3003 |
| `pnpm import:wechat` | 抓公众号专辑，生成默认书库数据（见第 10 节） |
| `pnpm seed:local` | 安装本地默认书库 |

> `pnpm start` 里用了 `NODE_ENV=production node ...` 的内联写法，在 Git Bash / WSL 里正常，在 cmd 里会失败。

## 4. 代码地图

```
src/
  App.tsx                 视图路由：home / bookshelf / reader / note / review / vocab
  components/
    home/                 桌面首页
    bookshelf/            书架
    reader/               阅读器（ReadingView 最大，约 58KB，改动要小心）
    explain/              划词讲解内容
    review/               练习记录（全局 journal + 随机练习入口）
    note/                 note 信息流、来源管理、文章行
    vocab/                生词本：列表页、卡片、紧凑行、详情卡
    import/               EPUB、粘贴/URL、AI 情景、字幕导入
    settings/             设置弹窗（AI / 声音 / 数据）
    onboarding/           欢迎引导
    layout/               存储健康提示等
  stores/                 Zustand
    bookSlice.ts          书 / 章 / 句、当前书和章
    practiceSlice.ts      回译练习、讲解缓存、每句 attempts
    noteSlice.ts          note 来源、feed 缓存、已读/屏蔽
    vocabSlice.ts         生词本
    bookmarkSlice.ts      划词书签
    settingsSlice.ts      AI 供应商、TTS、阅读偏好、生词本密度
    uiSlice.ts            当前视图、全局生词详情对话框
  lib/
    ai/                   AI 客户端（analyze、讲解、翻译）
    vocab/                生词本纯逻辑：草稿、去重、提示词、解析、筛选、导出、展示
    explain/              讲解视图选择
    import/               文本材料、粘贴目标书、AI 情景、字幕解析
    note/                 note feed/章节纯逻辑
    practice/             journal 与随机练习纯逻辑
    library/              来源分组、徽章、可见材料
    epub/  seed/  tts/  analysis/
    storage.ts            备份键、容量测量、导入导出
    clipboard.ts          复制（含 HTTP 环境的降级）
    keyboard.ts  pairMigration.ts  debouncedStorage.ts  id.ts
  machines/explain.ts     讲解状态机（idle / streaming / ready / failed）
  theme/                  paper / night 主题
  types/                  Book / Chapter / SentencePair / VocabEntry 等
server/
  index.ts                Hono 入口，生产模式服务 dist/
  routes/                 ai.ts（/analyze）、explain.ts、translate.ts、fetchUrl.ts、note.ts（/api/note/feed、/api/note/article）
  providers.ts            AI 供应商构造
  tts/                    Microsoft / VOICEVOX
```

API：`POST /api/analyze`（通用 AI，返回 `{ text }`，限流 30 次/分）、`POST /api/explain`、`POST /api/translate`、`POST /api/fetch-url`、`/api/tts/*`、`GET /health`。

## 5. 数据模型

```ts
Book { id, title, author, chapters[], source?, demo?, chapterSeq? }
Chapter { id, title, index, pairs[], sourceUrl?, note? }
SentencePair { id, japanese, japaneseHtml?, chinese, chapterIndex, pairIndex,
               translationSource?, translationReviewed?, translatedAt? }

来源（`Book.source.kind`）：

```ts
'epub' | 'text' | 'url' | 'collection' | 'note' | 'ai' | 'subtitle'
```

- `note` 书是隐藏的 `note-book`，打开的文章都是它的章节；`Chapter.note` 存 URL、作者、发布时间、来源话题。
- `ai` 书带 `source.scenario`（用户原始情景）；`subtitle` 书一个文件一章。
```

- `japaneseHtml` 保留 `<ruby>` 假名；划词 offset 一律基于纯文本 `pair.japanese`，忽略 ruby。
- 句子的稳定 id 由 `src/lib/epub/pairId.ts` 生成（`book-chapter-pair`），`pairMigration.ts` 负责把旧数据迁过来。

生词：

```ts
VocabEntry { id, word, reading?, meaning?, synonyms[{word, nuance?}], core?,
             example, exampleTranslation?, exampleSource: 'article'|'ai'|'user',
             source?: { bookId, chapterId, chapterIndex, pairId, startOffset?, endOffset? },
             status: 'new'|'known', createdAt, updatedAt, model? }
```

localStorage 键：

| 键 | 内容 | 进备份 |
| --- | --- | --- |
| `book-store` | 书、章、句、当前书 | 是 |
| `note-store` | note 来源、feed 缓存、已读/屏蔽 | 是 |
| `practice-store` | 回译练习、讲解缓存、attempts | 是 |
| `vocab-store` | 生词本 | 是 |
| `baku-yomi-bookmarks` | 划词书签 | 是 |
| `settings-store` | AI 供应商（含 key）、TTS、偏好 | 否（避免备份泄漏 key） |
| `baku-yomi-theme` | paper / night | 否 |

备份逻辑在 `src/lib/storage.ts`：`BACKUP_KEYS` 决定导出内容；容量上限按 5MB 计，超过 3.5MB 时 `StorageHealthNotice` 会提示。

## 6. 设计系统

- 两个主题：`body.paper` / `body.night`，同时写 `body.dataset.theme`。切换不改结构，只换 token。
- token 定义在 `src/index.css`：`--bg --text --mid --paper --paper-2 --paper-3 --muted --rule --rule-strong --red --red-soft --font-*`。
- 组件样式在 `src/artboard.css`（主体，约 4600 行）和 `src/ui-v2.css`。Tailwind 装了但基本没用于布局，新样式优先写进 artboard.css 并复用 token。
- 字体：阅读 `Zen Maru Gothic`，UI `IBM Plex Sans`，小标签/出处 `IBM Plex Mono`。
- 桌面 ≥1100px：纸页内嵌（左右 24px、上下 18px）+ 双栏翻页（CSS multi-column，一次翻一跨页，320ms 滑动，滚轮/← →/翻页按钮）。手机和平板保持单栏。
- 设计方向（2026-11-10 定）：两档练习都保留（句内随手练 + 整页练习桌），讲解是同一表面的兄弟标签；B 方案（译者校样双栏）已否决。不要回到旧的六主题天气皮肤。

## 7. 生词本（本次重点）

**入口**

- 阅读器里选中词 → 划词条「生词」。
- 首页 / 书架顶栏「生词」。
- 生词本页「添加生词」。

**流程**

1. 划词生成草稿：词 = 选中文本，例句 = 当前句，例句来源 `article`，带上书/章/句和 offset。
2. 详情卡打开后自动调 AI 补读音、释义、類、CORE；只填空字段，**原文例句永远不被覆盖**。
3. 手动添加：输入词后失焦或回车触发 AI，AI 若给例句则来源标 `ai`。
4. 保存前查重：同词 + 同句 → 提示「已经在本句存过了」并打开已有记录；同词不同句允许并存。
5. 详情卡可编辑全部字段、删除（两步确认）、标记已掌握、「回到原文」跳回原书原章并定位到那一句。

**列表**

- 默认**紧凑**：一条两行，按 ref 的顺序——
  `例文（目标词朱色）` / `単語【かな】〔释义〕 :: 類：… :: CORE：…`，每行约 50px。
- **卡片**：大卡片，句例 + 词 + CORE + 出处。
- 切换在筛选栏末尾「紧凑 / 卡片」，选择存在 `settings-store.vocabDensity`，刷新保持。
- 搜索覆盖词、读音、释义、CORE、例句；按书、章、未掌握/已掌握筛选。
- 手机 400px：紧凑行只留例文 + 词 + 释义，類 / CORE / 出处收进详情卡。

**导出**：复制为 ref 格式，兼容旧的 A4 工具：

```
仕事だと[[割り切る]]ことにした。 :: 割り切る【わりきる】 :: 類：受け入れる（纳得） :: CORE：感情に区切りをつける
```

**关键文件**：`src/lib/vocab/*`（纯逻辑，全部有测试）、`src/components/vocab/*`、`src/hooks/useVocabFill.ts`、`src/lib/ai/vocabClient.ts`、`src/stores/vocabSlice.ts`。

## 8. 踩过的坑

- **划词 offset**：必须相对 `pair.japanese` 的纯文本，`<ruby>` 的 rt 要跳过，否则高亮会错位。
- **讲解串台**：讲解结果和失败都带 `action`，切换标签时取消旧请求（`src/lib/explain/view.ts`）。
- **AI JSON**：模型可能返回代码围栏、尾逗号、字符串形式的 synonyms。`src/lib/vocab/parse.ts` 统一清洗，别假设是干净 JSON。
- **StrictMode**：开发模式下 effect 会跑两次。`useVocabFill` 的取消逻辑要允许第二次请求，否则会永远 loading。
- **CORE 与例句重复**：提示词里明确要求 `core` 不能等于 `example`。
- **B站免费 provider**：无 key，`/api/analyze` 只需 `{ provider, model, prompt }`；默认模型 `Index-Translate-35B-A3B`。
- **复制**：Ally 是 HTTP，`navigator.clipboard` 可能不可用，`src/lib/clipboard.ts` 有 textarea 降级。

## 9. 测试与验证

- 测试是 `node --test` + tsx，纯逻辑放 `src/lib`，组件保持薄。
- 改生词本逻辑先跑 `tests/vocab*.test.ts`；全量 `pnpm test`。
- 已知 lint 报错：`src/components/reader/ReadingView.tsx` 书签 effect 里的 `react-hooks/set-state-in-effect`（历史遗留，不是新代码引入的）。
- 构建有 chunk > 500kB 的警告（历史遗留）。
- 本机截图：ego 的 `Page.captureScreenshot` 会超时，改用 `Page.printToPDF` + PowerShell WinRT 把 PDF 转 PNG。脚本在 `C:\Users\Neal\ego\vocab-e2e-20261117\`，不进仓库；换电脑后需要重写。
- UI 验证页：`.ryugi/artifacts/artboard/verify-vocab/`（`.ryugi/` 不进 git）。

## 10. 部署到 ROG Ally

- WSL Ubuntu 里 `/home/yaya/baku-yomi`，生产服务 `node --import tsx server/index.ts`，端口 3003，服务 `./dist`。
- SSH 走 `~/.ssh/config` 的 `ally` 别名，命令要在 WSL 里执行：`ssh ally 'wsl -e sh -lc "…"'`。
- 更新：把新的 `dist/index.html` 和 `dist/assets/` 替换进去，**保留 `dist/default-library.*`**（个人书库），服务不用重启。
- 局域网访问：`http://192.168.210.203:3003/`，手机上就是这么读的。
- 细节见 `docs/self-hosting.md`。

## 11. 不要提交的东西

- `local-data/`、`public/default-library.json`、`public/default-library.md`：个人抓取的文章，已在 `.gitignore`。
- `ref/`：旧的 A4 单词本工具（`TEST.html` + `sample.txt`），本地参考，未跟踪。生词本的紧凑格式就是从它来的。
- `.ryugi/`、`.claude/`：工具产物与会话数据。

## 12. 已知问题 / 下一步

- README 还停留在旧功能（六主题、EPUB 为主），与现在的 UI v2 不一致，值得更新。
- 生词本的 A4 打印排版是 phase 2（目前只导出 ref 文本）。
- 没有云同步，数据只在本机浏览器；换设备靠备份 JSON 或默认书库。
- 生词本手机上不显示 類 / CORE / 出处（详情卡里有）。
- 讲解的 lint 报错与构建 chunk 警告待清理。

## 13. 约定

- UI 文案用中文；术语保留日文汉字（生詞、類、CORE）。
- 新逻辑先写失败测试再实现（TDD），纯函数放 `src/lib`。
- 提交信息用英文 conventional（`feat:` / `fix:` / `refactor:`）。
- 每个页面自带 top bar，不共用全局导航。
- 不引入新的 UI 组件库；样式写进 artboard.css 并复用 token。

## 14. 文档索引

- `docs/ryugi/specs/2026-11-11-materials-translation-home-design.md` — 材料导入 / 翻译 / 首页设计
- `docs/design/ui-v2-interaction.md` — UI v2 交互
- `docs/architecture/state-machines.md` — 状态机
- `docs/architecture/reader-navigation.md` — 阅读器导航
- `docs/self-hosting.md` — 部署
- `docs/course/` — 项目学习课程（L01–L30）
