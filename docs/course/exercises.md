# baku-yomi 综合实战练习集（20 题）

> 由易到难。前 10 题是课程作业之外的**新功能**；后 10 题偏**架构与工程化**。
> 每题含：难度 / 涉及文件 / 详细需求 / 验收标准 / 提示（提示引用的符号均来自真实源码）。
> 与《course-outline.md》各课实操作业不重复——作业做过的（如加樱花主题、pairBuilder 四 case 测试、限流阈值可配置）这里不再出现。

---

## A 组 · 新功能开发（1-10）

### 练习 1 · 导出书签为 Anki 卡片 ★★☆☆☆

**涉及文件**：新建 `src/lib/export/anki.ts`、`src/components/reader/BookmarkList.tsx`

**需求**
1. BookmarkList 工具栏加「导出 Anki」按钮，把当前书的书签转成 TSV（Anki 可直接导入）：正面=日文原句（有 `japaneseHtml` 用纯文本轨），背面=`text` 高亮片段 + 中文译文 + 书签备注位置（`${chapterId} ${pairId}`）。
2. 只导出当前书：用 `useBookmarkStore.getBookmarksByChapter` 按章聚合，章节标题从 `useBookStore.getCurrentBook()` 取。
3. 通过 Blob + `URL.createObjectURL` 触发下载，文件名 `{书名}-anki.tsv`。

**验收标准**
- 导出的 TSV 在 Anki「导入文件」中生成正确卡片数（= 书签数）；空书签时按钮禁用并提示。
- 无中文的单语降级句（`chinese === ''`）背面留空但不缺列。

**提示**
- 纯文本取自 `SentencePair.japanese`（ruby 已剥离），不要自己再剥一遍 rt/rp。
- 下载模板参考 parser.ts 里封面 dataURL 的 FileReader/Blob 处理思路，但导出只需 `createObjectURL` + `<a download>`。

---

### 练习 2 · 章节内搜索 ★★★☆☆

**涉及文件**：`src/components/reader/ReadingView.tsx`、新建 `src/hooks/useChapterSearch.ts`

**需求**
1. 按 `/` 呼出搜索框（加入现有 keydown 路由，注意与输入焦点守卫、`giPending` 状态机共存）。
2. 对当前章 `pairs` 做 Japanese/Chinese 子串匹配（大小写不敏感），结果列表显示句号 + 上下文截断；点击结果复用 `scrollToPairId`/`setScrollToPairId` 滚动定位。
3. 显示命中数；Esc 关闭。

**验收标准**
- 千句级章节输入即搜无卡顿（可用 `useMemo` 或 300ms debounce）；命中项点击滚动到位且高亮该卡。
- 输入框聚焦时 `/` 不应触发搜索框自身。

**提示**
- ReadingView 的 handleKeyDown 里先判断 `isInput` 再分流，照抄 Escape 分支的守卫写法。
- 滚动定位逻辑已有现成通道：bookSlice 的 `setScrollToPairId(pairId)`，别另起炉灶。

---

### 练习 3 · 生词本 ★★★☆☆

**涉及文件**：新建 `src/stores/vocabSlice.ts`、`SelectionPopover.tsx`、新建 `src/components/vocab/VocabPage.tsx`

**需求**
1. 选区弹窗加「收藏生词」按钮：把选中文本 + 所在句对上下文存入新 store（字段：id/pairId/chapterId/term/context/createdAt），persist 键名自定（参考 bookmarkSlice 的 `'baku-yomi-bookmarks'` 命名风格）。
2. 新增生词本页（挂进 uiSlice 的 `AppView` 或侧栏入口），支持删除、按导入时间排序、跳回原句（复用 scrollToPairId）。
3. 「标记已掌握」状态切换，已掌握的折叠显示。

**验收标准**
- 刷新页面数据不丢（persist 生效）；跳回原句在跨章书签场景下也正确（需先切章再滚）。
- store 不持久化临时 UI 态（如筛选开关）——对照 uiSlice 不 persist 的做法。

**提示**
- id 生成照抄 bookmarkSlice 的 `` `bm-${Date.now()}-${Math.random().toString(36).slice(2,9)}` `` 模式。
- SelectionPopover 的回调链路：先读 useTextSelection 怎么拿到选区文本，再决定往哪个组件传 props。

---

### 练习 4 · 阅读统计面板 ★★★☆☆

**涉及文件**：`src/stores/bookSlice.ts`（只读消费为主）、新建 `src/components/stats/StatsPage.tsx`

**需求**
1. 展示：书架总书数/总章数/总句对数；每本书最近阅读时间（`lastReadAt`）、读到的进度（`readingProgress` 占该章 pair 数比例）；连续阅读天数（由 lastReadAt 时间戳集合推算）。
2. 全部数据从现有 store 派生，不新增写入点；用 `useMemo` 计算。
3. 提供一个「清空练习数据」入口，调 practiceSlice 已有的 `clearPracticeData(bookId)`。

**验收标准**
- 数字与 DevTools 里 localStorage 的 book-store/practice-store 原始结构一致（可抽查验证）；
- 删除一本书（removeBook）后面板即时更新且不残留其统计。

**提示**
- 进度百分比注意除零：`pairs.length === 0` 时显示 `-`。
- 「连续天数」按自然日聚合时间戳，注意跨月边界用日期字符串比较而非毫秒差。

---

### 练习 5 · EPUB 导入进度条 ★★★☆☆

**涉及文件**：`src/lib/epub/parser.ts`、`src/hooks/useEpubParser.ts`、`src/components/import/EpubUploader.tsx`

**需求**
1. 给 `parseEpubFile(file, onProgress?)` 加可选进度回调，阶段粒度：元数据完成 → spine HTML 加载 i/N（以 spine 总数为分母，逐个 loadChapter 后上报）→ 句对提取章 j/M → 封面处理。
2. EpubUploader 渲染分阶段进度条与阶段文案；解析期间禁用重复上传。
3. 支持取消：AbortSignal 贯传，用户中止后在 spine 循环检查点抛出并清理 UI 态。

**验收标准**
- 导入大部头（>100 spine）能看到平滑推进的进度而非一次跳完；取消后 books 列表无半成品残留。
- 不传 onProgress 时行为与现在完全一致（向后兼容）。

**提示**
- 进度循环天然落点：parser.ts 第 117-127 行预载 spineHtml 的 for 循环。
- 若想更进一步，可把解析挪进 Web Worker（加分项，注意 DOMParser 在 Worker 不可用的兜底——extractSentences 依赖它）。

---

### 练习 6 · 多颜色书签管理增强（筛选 + 图例 + 统计） ★★☆☆☆

**涉及文件**：`src/components/reader/BookmarkList.tsx`、`src/stores/bookmarkSlice.ts`

**需求**
1. BookmarkList 顶部加一排 BOOKMARK_COLORS 六色图例，点击某色筛选列表（再点取消）；显示各色计数。
2. 支持按颜色批量删除（带确认）。
3. 新增 slice 选择器 `getBookmarkCountByColor(): Record<colorId, number>`，避免组件内手写 filter 链。

**验收标准**
- 筛选是视图态：刷新后回到全部（不要把 filter persist 进去，对照 uiSlice 处理方式）；
- 批量删除只影响对应色，其余书签与滚动定位不受影响。

**提示**
- 六色常量直接 import `BOOKMARK_COLORS`（bookmarkSlice.ts 第 4-11 行），label 字段现成（红色/橙色/…/紫色）。
- 批量操作建议在 slice 加一个 action 而不是组件里循环调用 removeBookmark（减少 N 次 set）。

---

### 练习 7 · AI 生成分句译文回填 ★★★★☆

**涉及文件**：新建 `src/lib/ai/backfill.ts`、`src/components/reader/ReadingView.tsx`、`src/lib/ai/client.ts`

**需求**
1. 对当前章中 `chinese === ''` 的日语行（单语降级或未配对保留句），提供「AI 回填本章译文」按钮：逐句构造翻译 prompt（复用 buildAnalysisPrompt 的格式风格但换成纯翻译指令），经 `/api/analyze` 获取译文。
2. 结果通过 bookSlice 现成的 `updatePairChinese(pairId, chinese)` 写回；回填过程中逐条显示已完成 n/m。
3. 并发上限 2（顺序或小并发池均可），失败的单句跳过并在完成后汇报，不中断整批。

**验收标准**
- 回填后句子立即显示译文（zustand 响应式生效）；刷新后仍在（persist 于 book-store）。
- 中途关闭面板/切章不产生脏写：只写发起时快照里的 pairId 集合。

**提示**
- 这正是 pairBuilder 注释里"未配对日语保留以便回填"的设计兑现；updatePairChinese 已实现好定位逻辑，别绕过它直改数组。
- 注意限流 30 次/分/IP：一章未配对句超过 30 会吃 429——实现批间 sleep 或把并发压到安全水位，这本身就是题目的一部分。

---

### 练习 8 · 微软 TTS 语速调节 ★★★☆☆

**涉及文件**：`src/stores/settingsSlice.ts`、新建/扩展 `src/lib/tts/client.ts`、`VoiceSettingsPanel.tsx`、`server/tts/microsoft.ts`（只读确认）

**需求**
1. settings 增加 microsoftSpeed 字段（范围 0.5~2.0，clamp 写法照抄 voicevoxSpeed 的 Math.max/min 模式）+ setter + VoiceSettingsPanel 滑杆。
2. 播放微软引擎时把 speedScale 放进 options 传给 `POST /api/tts/:provider`；服务端 makeCacheKey 已把 speed 编进键——验证不同语速各自缓存、互不污染。
3. 连续朗读中途改速：下一句生效即可（当前句不强切）。

**验收标准**
- 同一句两个语速请求返回不同音频且 `/api/tts/cache/stats` 的 items 增长 2；
- X-TTS-Cache 第二次同参数请求为 HIT。

**提示**
- 服务端契约：body `{text, speaker, options:{speedScale}}`（server/tts/index.ts 第 113-145 行），Content-Type 为 audio/mpeg。
- 客户端播放入口在 voicevox.ts 的 playVoicevox/ensureVoiceUrl 一族，注意它读 provider 用的是模块内 `getCurrentTtsProvider()`，你的分支要挂在同一判定点上。

---

### 练习 9 · 深浅色跟随系统 ★★☆☆☆

**涉及文件**：`src/theme/themeStore.ts`、`ThemeProvider.tsx`

**需求**
1. ThemeMode 增加 `'auto'`：监听 `matchMedia('(prefers-color-scheme: dark)')`，dark 映射 night、light 映射 day；系统变化实时跟随。
2. 快捷键循环切换时 auto 视为一个档位插入序列；applyBodyClass 收到 auto 时按当前系统解析后再落 class。
3. 主题指示器显示「自动（夜/日）」。

**验收标准**
- 系统切换深浅色时无需刷新页面主题跟着变；persist 键 `baku-yomi-theme` 里能存住 'auto' 且旧版本数据兼容（读到旧值不崩）。
- Canvas overlay 也随解析后的实际模式走，而不是停在 auto。

**提示**
- applyBodyClass 的 switch（themeStore.ts 第 59-81 行）是唯一落 class 的地方，从这里做映射最小侵入。
- matchMedia 监听用 addEventListener('change')，记得 cleanup；SSR 无 window 的守卫本项目不需要（纯 SPA）但要养成习惯。

---

### 练习 10 · PWA 离线可用 ★★★★☆

**涉及文件**：`vite.config.ts`、新建 `src/sw.ts`（或 vite-plugin-pwa 配置）、`index.html`

**需求**
1. 接入 PWA：manifest（名称/图标/standalone）+ Service Worker，静态资源（dist 产物）precache，`/api/*` 不缓存。
2. 二次访问断网时可浏览已导入书籍并继续阅读（数据本就在 localStorage）；TTS/AI 功能离线给出明确禁用态提示而非报错白屏。
3. SW 更新策略：新版本发布后有「发现新版本，点击刷新」提示。

**验收标准**
- Lighthouse PWA 检查通过 installable；DevTools Offline 模式下重载页面完整渲染书架与正文。
- `/api/tts/cache/stats` 等请求不会被 SW 缓存命中。

**提示**
- 生产才有 dist 可缓存，开发模式跳过 SW 注册（isProd 分支思路同 server/index.ts）。
- 音频走 no-store 是服务端明确语义（X-TTS-Cache/no-store 头），SW 对 /api 一律 bypass 即可保持一致。

---

## B 组 · 架构与工程化（11-20）

### 练习 11 · 补测试到覆盖率目标 ★★★★☆

**涉及文件**：新增 `vitest.config.ts`、`src/lib/epub/__tests__/`、`src/lib/tts/__tests__` 等

**需求**
1. Vitest + coverage（v8 provider）。核心域目标：`src/lib/**` 行覆盖 ≥80%，`pairBuilder.ts`/`sentenceSplitter.ts`/`languageDetector.ts` ≥90%。
2. 必测清单：buildPairs 的 JA→ZH/ZH→JA/单语降级/混合丢弃 zh 行四类；extractSentences 的嵌套块去重（`block.querySelector('p, div')` 分支）、ruby 双轨输出、无块级元素换行兜底；sanitizeRubyHtml 的 XSS 样例表（script/onerror/属性存活情况固化为文档化断言）；makeCacheKey 相同 options 归一化命中同一键。
3. CI 能跑 `vitest run --coverage` 并在低于阈值时 fail。

**验收标准**
- 覆盖率报告达到上述阈值；测试全部确定性（无 Date.now 抖动——用 vi.setSystemTime 固定）。
- DOMParser 依赖的测试环境用 jsdom/happy-dom 显式声明。

**提示**
- 课程作业已写过 buildPairs 四 case，本题在其上补齐 extractSentences 与 sanitize 两座山头并加阈值门禁，注意别重复造同样的断言。
- languageDetector 边界：`\u3040-\u309F\u30A0-\u30FF`（假名）与 `\u4E00-\u9FFF`（CJK），拿码点首尾字符当用例最锋利。

---

### 练习 12 · GitHub Actions CI workflow ★★★☆☆

**涉及文件**：新建 `.github/workflows/ci.yml`

**需求**
1. push + PR 触发：Node 22，corepack 启用 pnpm，缓存 pnpm store；job1 lint（eslint .），job2 build（pnpm build 含 tsc -b 类型门禁），job3 test（依赖练习 11 的脚本）。
2. main 分支额外跑 docker build 冒烟（构建成功即可，不必推送）。
3. 失败时 PR 上可见状态检查（默认行为），README 加 CI 徽章。

**验收标准**
- 干净 checkout 上一条命令跑通全流程；lockfile 不一致时 install --frozen-lockfile 如实失败。
- 缓存生效（第二次运行 restore 日志可见）。

**提示**
- 本地等价物：`pnpm lint && pnpm build && vitest run`；CI 只是搬进 ubuntu-latest。
- Dockerfile 用 corepack prepare pnpm@latest，CI 里保持同一启用方式避免包管理器漂移。

---

### 练习 13 · React 错误边界体系 ★★☆☆☆

**涉及文件**：新建 `src/components/ErrorBoundary.tsx`、`MainLayout.tsx`、`AnalysisPanel.tsx`、`EpubUploader.tsx`

**需求**
1. 实现 class ErrorBoundary（getDerivedStateFromError + componentDidCatch 上报到 console/可选上报钩子）。
2. 三处包裹：句对卡片列表（崩溃降级为「本章部分内容无法渲染」）、AnalysisPanel（AI 结果渲染崩溃不影响阅读）、EpubUploader（导入崩溃可重试）。
3. 提供「复制错误详情」按钮（含 componentStack 截断版）。

**验收标准**
- 人为注入 throw 的子组件验证：边界外 UI 正常交互、边界内显示 fallback；移除注入后自动恢复（重渲染子树）。
- ruby HTML 渲染路径（dangerouslySetInnerHTML）崩溃被卡片层边界接住，不白屏整页。

**提示**
- 边界粒度放在「卡片列表」而不是每个卡片（千卡实例化千个 class 无意义）。
- ErrorBoundary 不捕获事件处理器与异步错误——异步路径靠现有 try/catch（如 useAnalysis 的 rethrow 链），两者互补别混谈。

---

### 练习 14 · 性能预算与产物守护 ★★★☆☆

**涉及文件**：`vite.config.ts`（manualChunks/build 配置）、新建 `.size-limit.json` 或等价配置、`package.json` 脚本

**需求**
1. 定预算：首屏 JS gzip ≤250KB、单 chunk ≤400KB、CSS ≤60KB；用 size-limit 类工具接入 `pnpm check:size`。
2. vite manualChunks 把 react-icons、@lingo-reader/epub-parser、AI 相关仅客户端代码拆离主包；react-icons 改为按需具名导入（tree-shaking 生效验证）。
3. build 输出打印 gzip 体积并与预算比对，超了直接非零退出。

**验收标准**
- 主包不再包含图标全集（对比拆分前后 dist 文件清单）；check:size 在 CI（练习 12）作为独立 job 运行。
- 首屏加载（Network 面板 gzip 总量）实测达标并记录数字。

**提示**
- 先跑 `vite build` 看 rollup 产物基线再定预算数字，拍脑袋预算会立刻翻车。
- epub 解析只在导入时需要：动态 `import()` parseEpubFile 所在模块是最大的一刀。

---

### 练习 15 · UI 文案 i18n ★★★☆☆

**涉及文件**：新建 `src/i18n/`（zh-CN.ts / en.ts / index.ts）、SettingsModal.tsx、ShortcutHelp.tsx、Sidebar.tsx 等

**需求**
1. 轻量方案：context + 字典对象（或 react-i18next），抽设置面板/快捷键帮助/书架/上传四块文案，zh-CN 为基准语言，en 全量翻译。
2. 语言切换入 settings-store（persist version 升 3 + migrate 兜底旧数据——参照 aiProvider→aiProviders 的迁移写法）。
3. 明确分层规则写进 i18n/index.ts 注释：UI 文案可翻；ErrorCategory 的『文法』『助詞』等日文枚举是领域数据不进字典；学习内容永不翻译。

**验收标准**
- 切换语言后四块界面即时切换、无需刷新；localStorage settings-store 版本迁移后旧用户无感。
- 全项目 UI 硬编码文案扫描（grep 中文 JSX 字面量）在指定目录归零并有 eslint 规则防回流。

**提示**
- settingsSlice 已有 version: 2 的 migrate 先例（第 163-195 行），升 3 时 migrate 要同时处理 v0→v3 的链式升级。
- t 函数类型化（keyof typeof zhCN）可获得编译期拼写检查，比裸字符串键稳。

---

### 练习 16 · 书籍数据迁移 IndexedDB ★★★★☆

**涉及文件**：新建 `src/lib/storage/idbStorage.ts`、`src/stores/bookSlice.ts`、practiceSlice.ts

**需求**
1. 实现 zustand persist 自定义 async storage（idb-keyval），仅替换 bookSlice 与 practiceSlice 的存储引擎；小 store（settings/ui/theme/bookmark）留在 localStorage。
2. 写一次性迁移：首次启动检测 localStorage 存在旧 `book-store` 数据 → 搬入 IDB → 校验后清除旧键；persist version bump + migrate 配套。
3. 处理水合时机：暴露 hydration 完成标志，BookshelfPage 在水合前渲染骨架屏而非空书架。

**验收标准**
- 导入超 localStorage 5MB 上限的大书成功保存并重启浏览器后完整恢复；
- 迁移幂等（二次启动不重复搬、不丢数据）；DevTools Application 面板可见 IDB 中的新结构。

**提示**
- persist 的 storage 选项接受 `{getItem,setItem,removeItem}` 返回 Promise 的实现——官方文档 pattern，照实现即可。
- 水合竞态的经典症状就是"刷新瞬间书架闪空"，用 onRehydrateStorage 回调打标志。

---

### 练习 17 · monorepo 拆分 ★★★★☆

**涉及文件**：根 `pnpm-workspace.yaml`、`packages/{web,server,shared}/`、各 package.json/tsconfig

**需求**
1. 拆三个包：packages/shared（src/types 全部、prompts.ts、领域常量如 DEFAULT_MODELS）、packages/web（现 src 前端）、packages/server（Hono 后端）。web/server 依赖 *shared。
2. 清理跨界引用：server/providers.ts 的 `from '../src/types/settings'` 改为 @baku-yomi/shared；tsconfig project references 重排保证 tsc -b 仍一条命令过。
3. Dockerfile 适配 workspace 结构，镜像体积不劣于现状。

**验收标准**
- `pnpm install && pnpm dev && pnpm build` 在仓库根一条龙通过；shared 无对 web/server 的反向依赖（用依赖检查工具或 eslint 边界规则固化）。
- 镜像构建成功且运行冒烟（/health 200）。

**提示**
- prompts.ts 属于 shared 的理由：它是前后端共享的领域知识（前端拼 prompt、毕业项目 generateObject schema 也要贴着它定义）。
- tsx 直接跑 TS 的 dev 流程在 workspace 下注意 tsconfig paths 与 NODE_PATH 差异，优先用 workspace 协议依赖 `"@baku-yomi/shared": "workspace:*"`。

---

### 练习 18 · WebSocket 多设备同步 ★★★★★

**涉及文件**：server 新建 `routes/sync.ts`、`src/lib/sync/client.ts`、bookSlice/practiceSlice 合并逻辑

**需求**
1. 服务端 ws 服务：连接携带 roomId（=bookId），广播 {field, payload, updatedAt, deviceId} 事件；心跳与断线清理。
2. 客户端同步三类数据：currentChapterIndex/readingProgress（低频标量）、translations/notes（键值增量）、bookmarks（增删事件）。收到远端事件 merge 进 zustand，本地变更防回环（echo 抑制）广播出去。
3. 冲突策略：标量 LWW（updatedAt 比较）；键值类按键 LWW；文档注释说明何时这不够（同句双端编辑）。

**验收标准**
- 双浏览器打开同书：A 滚动/记笔记，B 秒级看到；断网重连后不丢本地增量（简化为重连拉全量也可，需说明取舍）。
- 自己的消息不会触发自己的 setState 死循环（deviceId 过滤）。

**提示**
- Hono on Node 下可用 @hono/node-server 的 ws 适配或独立 ws 库挂到同一 http server；serve({fetch}) 的返回值里有 server 实例可 upgrade。
- 复用现有字段是关键：readingProgress/lastReadAt 本来就是 Record，事件载荷直接对齐，别发明第二套模型。

---

### 练习 19 · AI Provider 插件化 ★★★★☆

**涉及文件**：`server/providers.ts` 重构为注册表、新建 `server/providers/` 目录、settings 相关类型

**需求**
1. createProvider 的 switch 改为 `ProviderRegistry`：register(type, factory) + resolve；内置 openai/anthropic/google/openai-compatible 四家为预装插件，factory 签名统一 `(apiKey, model, baseUrl?) => LanguageModelV1`。
2. 新增一个示例插件证明扩展性（如 deepseek——本质是 openai-compatible 的具名预设，注册一行完成）。
3. 类型收敛：AIProviderType 从四选一字面量改为 string + 内置联合类型保留智能提示；DEFAULT_MODELS 随插件元数据注册而非前端硬编码，提供 `GET /api/providers` 返回可用 type 与默认 model 列表供设置面板渲染。

**验收标准**
- 现有四种 type 行为零变化（回归：真实调用各一次）；新插件不改核心文件即可用 curl 走通 /api/analyze。
- providers.ts 核心 switch 消失，新增厂商 diff 仅一个新文件 + 一行 register。

**提示**
- openai-compatible 已经是"万能插件"雏形（baseURL 直传），插件化的第一课就是把它的通用性显式化为架构。
- 前端 settingsSlice.aiProviders 的 type 字段校验放宽要配 persist version+migrate，老数据里的 'openai' 必须仍然合法。

---

### 练习 20 · 发布 v1.0 完整流程 ★★★☆☆

**涉及文件**：CHANGELOG.md、package.json（version 0.1.0 → 1.0.0）、`.github/workflows/release.yml`、README.md

**需求**
1. 制定并执行 release checklist：消灭 README 的 `<!-- TODO: add screenshot -->`（截图入 docs/screenshot.png）、CHANGELOG 记录 0.1.0→1.0.0 全部特性与破坏性变更、语义化版本定稿。
2. release workflow：main 打 tag `v*` 触发 → 跑全量检查（lint/build/test/size）→ 构建 Docker 镜像打双 tag（v1.0.0 + latest）→ 产出 GitHub Release 附 CHANGELOG 片段。
3. 冒烟清单文档化：docker compose up → 导入样例书 → 回译评分 → 双引擎朗读 → 快捷键遍历，逐项勾选记录在 Release 说明。

**验收标准**
- tag 推送后 workflow 全绿，镜像可 pull 且冒烟清单全过；
- 旧版本 persist 数据（settings-store v2 及以下）在新版本启动正常迁移——这是 1.0 的硬门槛。

**提示**
- 版本号单一事实来源是 package.json，Docker tag 从 git tag 推导，别两处手工维护。
- persist 迁移回归做法：发布前用旧版本造一批数据导出 localStorage JSON，升级后逐键核对（settings-store 的 version/migrate 是你唯一的防线）。

---

## 难度与依赖总览

| # | 主题 | 难度 | 前置 | 主要收获 |
|---|---|---|---|---|
| 1 | Anki 卡片导出 | ★★ | 无 | 数据派生 + 文件下载 |
| 2 | 章节内搜索 | ★★★ | 无 | 键盘路由 + 性能 |
| 3 | 生词本 | ★★★ | 无 | 新 store 设计 |
| 4 | 阅读统计 | ★★★ | 无 | store 只读派生 |
| 5 | 导入进度条 | ★★★ | 无 | 异步流程 UX |
| 6 | 书签管理增强 | ★★ | 无 | slice action 设计 |
| 7 | AI 译文回填 | ★★★★ | 5 更佳 | 批量任务 + 限流共处 |
| 8 | 微软语速调节 | ★★★ | 无 | 全链路参数穿透 |
| 9 | 跟随系统主题 | ★★ | 无 | 媒体查询响应式 |
| 10 | PWA 离线 | ★★★★ | 12 更佳 | SW 缓存策略 |
| 11 | 测试覆盖率门禁 | ★★★★ | 无 | Vitest 工程 |
| 12 | CI workflow | ★★★ | 无 | 流水线基础 |
| 13 | 错误边界 | ★★ | 无 | 故障隔离 |
| 14 | 性能预算 | ★★★ | 无 | 体积治理 |
| 15 | i18n | ★★★ | 无 | 文案分层 |
| 16 | IndexedDB 迁移 | ★★★★ | 无 | 持久层升级 |
| 17 | monorepo | ★★★★ | 11/12 | 包边界 |
| 18 | WebSocket 同步 | ★★★★★ | 16 | 分布式状态 |
| 19 | Provider 插件化 | ★★★★ | 无 | 开闭原则落地 |
| 20 | v1.0 发布 | ★★★ | 11-14 | 交付闭环 |

*基于 2026-08-26 代码库编写；所有符号名（BOOKMARK_COLORS、updatePairChinese、makeCacheKey、setScrollToPairId 等）均可在源码检索验证。*
