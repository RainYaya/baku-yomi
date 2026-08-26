# baku-yomi 分阶段面试题库（100 题）

> 配套《course-outline.md》六个学习阶段使用。每题标注题型：
> **【概念】** 解释类 · **【代码追踪】** 要求说清函数/数据流转路径 · **【批判】** 挑毛病 + 给方案。
> 所有答案要点均基于当前代码库真实实现，引用的符号名可直接在源码中搜到。
> 自测方法：先自己作答，再展开 `<details>` 对照；答不上的回课程对应课重读。

---

## 第一部分 · 全景环境与 React/状态管理（阶段 0-1，第 1-9 课）

**1.【概念】用一分钟讲清 baku-yomi 是什么、整体架构怎么分层。**
<details><summary>答案要点</summary>

- 日语双语阅读器 + 回译练习工具；导入双语 EPUB → 句对对齐显示 → 看中文写日语回译 → AI 打分纠错；附带 TTS 连续朗读、书签、6 个 Canvas 动效主题。
- 分层：React 19 SPA（components/hooks/stores/lib/theme）+ Hono on Node 轻后端（server/，托管 `/api` 与生产静态文件）；核心的 EPUB 解析在浏览器端完成；BYOK 模式用户自带 AI Key。
</details>

**2.【概念】什么是 BYOK？它的威胁模型是什么？**
<details><summary>答案要点</summary>

- BYOK = Bring Your Own Key：AI Key 由用户在设置里填入，存于浏览器 localStorage（settingsSlice persist），每次请求随 body 发给 `/api/analyze`。
- 威胁模型要说精确：Key 从浏览器发到**你自己部署的服务器**再转发给厂商。自托管场景下服务器即用户自己的机器，"Key 不经过第三方"成立；若部署成公网共享实例，Key 会经过你的服务器内存——这是 study-guide 第四节防守点 3 明确要求能讲清的边界。
</details>

**3.【代码追踪】`pnpm dev` 之后系统里跑了哪两个进程？各自的入口和端口是什么？**
<details><summary>答案要点</summary>

- package.json 的 `dev` 脚本用 `concurrently` 并行跑 `dev:client` 和 `dev:server`。
- `dev:client`：Vite dev server，前端 `http://localhost:5174`；`dev:server`：`node --env-file-if-exists=.env --watch --import tsx server/index.ts`，API 在 `http://localhost:3003`。
- 开发时前端通过 Vite 代理访问 API（跨端口），生产则同源。
</details>

**4.【概念】`tsx` 是怎么让 Node 直接跑 TypeScript 后端的？为什么构建前端却用 `tsc -b && vite build`？**
<details><summary>答案要点</summary>

- `--import tsx` 给 Node 注册了 TS 即时转译 loader，运行时逐文件剥离类型，不做完整类型检查——所以开发快但可能带类型错误上线。
- `build` 先跑 `tsc -b`（project references 全量类型检查）再 `vite build` 打包：Vite 只负责产物，类型安全交给 tsc。这也是第 3 课作业观察到的差异来源。
</details>

**5.【概念】项目为什么选 Zustand 而不是 Redux 或 Context？代价是什么？**
<details><summary>答案要点</summary>

- 体积小、无 Provider 包裹、`create` 一行建 store、`persist` 中间件开箱即用直接落 localStorage；组件外可 `useSettingsStore.getState()` 读状态（voicevox.ts 的 `getCurrentTtsProvider` 就是这么干的）。
- 代价：没有 Redux DevTools 的时间旅行/中间件生态；slice 间依赖靠手动 import；selector 写不好会过度重渲染。
</details>

**6.【代码追踪】列出五个 Zustand store 及其 localStorage 持久化键名，哪个不持久化？**
<details><summary>答案要点</summary>

| store | 文件 | persist name |
|---|---|---|
| useBookStore | src/stores/bookSlice.ts | `book-store` |
| useBookmarkStore | src/stores/bookmarkSlice.ts | `baku-yomi-bookmarks` |
| usePracticeStore | src/stores/practiceSlice.ts | `practice-store` |
| useSettingsStore | src/stores/settingsSlice.ts | `settings-store`（version: 2） |
| useUIStore | src/stores/uiSlice.ts | **不持久化**（无 persist 包装） |

主题另有一个独立小 store：themeStore.ts，键名 `baku-yomi-theme`。
</details>

**7.【概念】Zustand 的 persist 中间件做了什么？store 结构升级时怎么办？**
<details><summary>答案要点</summary>

- 每次 set 后把 state 序列化写入 localStorage，启动时读回并合并（浅 merge）。
- 结构升级靠 `version` + `migrate` 函数：settingsSlice 里 `version: 2`，migrate 把旧的单数 `aiProvider` 字段包装成 `aiProviders: [AIProviderProfile]` 数组并补 `activeAIProviderId`（见 settingsSlice.ts 第 166-194 行）。这是回答"版本迁移思路"的标准素材。
</details>

**8.【代码追踪】从 `App.tsx` 到阅读页渲染，视图切换的数据流是什么？**
<details><summary>答案要点</summary>

- uiSlice 定义 `AppView = 'bookshelf' | 'reader'`，`currentView` 存在 useUIStore（非持久化）；`setCurrentView(view)` 切换。
- MainLayout 按 `currentView` 条件渲染 BookshelfPage 或阅读界面；Sidebar 选书调 `useBookStore.setCurrentBook(id)`，选章调 `setCurrentChapter(index)`，ReadingView 订阅这两个值渲染句对卡片。
</details>

**9.【概念】主题系统的实现机制是什么？body class 和 Canvas overlay 各负责什么？**
<details><summary>答案要点</summary>

- themeStore.ts：`ThemeMode = 'night' | 'midnight' | 'day' | 'sunny' | 'rain' | 'snow'`，persist 键 `baku-yomi-theme`，默认 `'snow'`。
- `applyBodyClass(mode)` 往 `document.body` 上加/移除 `midnight/light/sunny/rain/snow` class（注意 day 映射的是 `light`），CSS 变量据此切换配色；ThemeOverlays 再挂 Canvas 动效 overlay（雨滴/雪花等）。
- 快捷键映射表 `KEY_MAP`：n/m/d/s/r/w 六个键。
</details>

**10.【批判】README 的快捷键表和代码里的实际按键绑定有出入吗？**
<details><summary>答案要点</summary>

- 有两处值得指出：① themeStore 的 `MODE_SHORTCUTS` 给 rain 分配了 `'R'` 且 `KEY_MAP` 含 `r: 'rain'`，而 ReadingView.tsx 又监听 `e.key === 'r'` 触发 `toggleAutoRead()`（连续朗读）——同一个键被两个监听者消费，README 只写了 `r` 开关朗读和 `N M D S W` 五个主题键。
- 正确姿势：主动指出冲突并给方案（如把雨主题改成别的键，或加输入焦点守卫统一路由）。
</details>

**11.【代码追踪】`changeFontZoom(direction)` 是如何防抖动的？字号缩放的边界是多少？**
<details><summary>答案要点</summary>

- settingsSlice.ts：`next = fontZoom + direction * 0.1`，再 `Math.round(next * 10) / 10` 消除浮点误差，最后 `Math.max(0.8, Math.min(1.4, ...))` 夹在 0.8~1.4。
- 考点：浮点累加误差处理 + 双边夹取，属于"读代码找细节"题。
</details>

**12.【概念】Tailwind CSS 4 在这个项目里是怎么接入 Vite 的？和 3.x 的配置方式有何不同？**
<details><summary>答案要点</summary>

- 用官方 `@tailwindcss/vite` 插件（vite.config 里挂 plugin），4.x 不再需要 tailwind.config.js 内容扫描配置，CSS 侧一条 `@import "tailwindcss"` 即可；主题色走 CSS 变量与 Tailwind 工具类结合。
- 对比 3.x：不再有 postcss 配置链路，构建更快。
</details>

**13.【代码追踪】书架页展示一本书需要哪些 store 字段？"最近阅读时间"存在哪里？**
<details><summary>答案要点</summary>

- 书列表来自 `useBookStore.books`（Book[]，含 title/author/coverUrl/importedAt/chapters）。
- 时间戳存在 bookSlice 的 `lastReadAt: Record<chapterId, timestamp>` 与 `lastChapterIndexByBook: Record<bookId, number>`；`getLastChapterIndexForBook(bookId)` 提供"继续阅读"定位。
</details>

**14.【概念】受控组件与非受控组件在项目里各举一例。**
<details><summary>答案要点</summary>

- 受控：PracticePanel 的回译输入框，value 绑 `usePracticeStore.translations[pairId]`，onChange 调 `setTranslation`——状态在 store，刷新/换句不丢。
- 非受控倾向：文件导入 EpubUploader 用 `<input type="file">` 拿 File 对象，不需要 React 管 input 内部值。
</details>

**15.【批判】把整本书的句对都放进 persist 到 localStorage 的 Zustand，有什么隐患？**
<details><summary>答案要点</summary>

- localStorage 通常 ~5MB 上限，大部头书（几万句对 + 封面 dataURL）会 QuotaExceededError；同步写主线程序列化大对象造成卡顿；多标签页并发写互相覆盖。
- 改进方向：书籍正文迁 IndexedDB，store 只留元数据/进度；封面 dataURL 可压缩或单独存储（study-guide 防守点 7）。
</details>

---

## 第二部分 · EPUB 解析管线（阶段 2，第 10-15 课）⭐

**16.【概念】EPUB 文件的物理结构和逻辑结构分别是什么？**
<details><summary>答案要点</summary>

- 物理：ZIP 容器，必含 `META-INF/container.xml` 指向 OPF 包文档。
- 逻辑：OPF 里 manifest（所有资源清单）+ spine（阅读顺序）+ metadata（书名/作者）；目录导航由 nav（EPUB3）或 NCX（EPUB2）提供。
</details>

**17.【代码追踪】从 File 对象到屏幕上的中日对照句，`parseEpubFile` 内部经过哪几步？**
<details><summary>答案要点</summary>

1. `initEpubFile(file)`（@lingo-reader/epub-parser）解压得到 EpubFile；
2. `getMetadata()` 取 title/creator/description/publisher，经 `extractText`/`extractCreator` 安全取值；
3. `getSpine()` + `getToc()` → `flattenToc` 拍平嵌套目录，并按 spineIndex 排序保证顺序；
4. 预加载全部 spine HTML（`epub.loadChapter(item.id)`）存入 `spineHtml: Map<string,string>`；
5. 封面探测 `extractCoverFromSpineHtml`，blob: URL 经 FileReader 转 dataURL 以便持久化；
6. 每个 TOC 区间内拼接 HTML → `extractPairsFromHtml` → 存入 chapters；
7. 组装 `Book` 返回，`id = \`book-${Date.now()}\``。
</details>

**18.【代码追踪】`extractPairsFromHtml` 为什么先尝试沉浸式翻译格式？失败后走什么分支？**
<details><summary>答案要点</summary>

- 实现：`extractImmersiveTranslatePairs(combined, chapterIndex) ?? buildPairs(extractSentences(combined), chapterIndex)`。
- 沉浸式翻译格式（原文 `<p>` 内嵌 `immersive-translate-target-wrapper` span，内含 `immersive-translate-target-inner`）自带明确对齐关系，优先消费最可靠；返回 null 表示不是该格式，退回通用管线：切句 → 检测语言 → 相邻配对。
</details>

**19.【概念】`extractSentences` 如何避免"外层 div + 内层 p"造成的重复句子？**
<details><summary>答案要点</summary>

- 选择器取 `p, h1..h6, div, li` 全部块级元素，然后对每个 block 判断 `block.querySelector('p, div')` ——只要内部还嵌着 p/div 就 `continue` 跳过外层容器，只收叶子块。
- 这是典型的"取最深块级节点"去重策略；代价是深层嵌套列表可能整段跳过。
</details>

**20.【代码追踪】ruby 注音是如何做到"纯文本不含注音、界面又能显示注音"的双轨保存的？**
<details><summary>答案要点</summary>

- 纯文本轨：`getTextWithoutRuby` 克隆元素后删掉所有 `rt/rp` 再取 textContent——`<ruby>漢字<rt>かんじ</rt></ruby>` → "漢字"。
- 展示轨：仅当块内有 `ruby` 时，把 `innerHTML` 过一遍 `sanitizeRubyHtml` 存入 `ExtractedSentence.html`，最终落到 `SentencePair.japaneseHtml`，ReadingView 用 dangerouslySetInnerHTML 渲染注音版。
</details>

**21.【概念】讲清 `sanitizeRubyHtml` 的白名单占位符替换法，一步步来。**
<details><summary>答案要点</summary>

1. 把允许的 `ruby/rt/rp` 开闭标签替换成 `\x01...\x02` 占位符（三条正则，忽略大小写、保留属性原样）；
2. `/<[^>]+>/g` 删掉剩余一切标签（script/style/onerror 全没）;
3. `\x01→<`、`\x02→>` 还原白名单标签。
- sentenceSplitter.ts 和 immersiveTranslate.ts 各有一份相同实现（复制粘贴，可指出重构点）。
</details>

**22.【批判】`sanitizeRubyHtml` 之后用 `dangerouslySetInnerHTML` 渲染还有残余风险吗？**
<details><summary>答案要点</summary>

- 有：占位符法只过滤标签，**属性原样保留**——`<ruby onmouseover="...">` 这类事件属性、`style="background:url(...)"` 注入都会存活；`\x01/\x02` 字符本身若出现在原文中也可能被利用做还原混淆。
- 更稳做法：不用字符串正则，改用 DOM API 白名单重建节点（只克隆 ruby/rt/rp 元素及其文本子节点），或上 DOMPurify。
</details>

**23.【概念】日文和中文的语言检测难点在哪？项目的判定规则是什么？**
<details><summary>答案要点</summary>

- 难点：两种语言共享 CJK 统一表意文字（U+4E00-U+9FFF），纯汉字日文句和中文无法靠汉字区分。
- 项目规则（languageDetector.ts）：`isJapanese` 测假名 `/[\u3040-\u309F\u30A0-\u30FF]/`（平假名 3040-309F / 片假名 30A0-30FF）；`isChinese` 先排除日文再测 `[\u4E00-\u9FFF]`；都没有则 `unknown`。
</details>

**24.【批判】纯汉字日文句子（无假名）会被检测成什么？这会造成什么连锁后果？**
<details><summary>答案要点</summary>

- 无假名 → isJapanese=false → 有汉字 → 判为 `zh`。
- 连锁：在 buildPairs 中它会以中文身份参与配对——若前一句是真日文，会配成一对但"日语原文"字段装的可能仍是日文（JA→ZH 配对时 next 当中文），或打断相邻真配对使 i+=2 跳错位置。启发式的固有局限，课程作业就是手测这类边界 case。
</details>

**25.【代码追踪】`buildPairs` 的配对循环怎么写的？"单语降级"的触发条件是什么？**
<details><summary>答案要点</summary>

- 先给每句打 `lang` 标签；`hasExplicitBilingualPairs = tagged.some(...)` 检查是否存在任意相邻 ja/zh 对。
- **没有任何相邻双语结构 → 整章降级**：每行都生成 `{japanese: text, chinese: ''}` 的 pair，保证纯日文书可导入。
- 否则 while 循环：JA→ZH 或 ZH→ZH 相邻即配对并 `i += 2` 跳过两句；没配上但自己是 ja 的行也保留（chinese 空串），zh 未配上的行直接丢弃（i++ 跳过）。pairId 形如 `ch${chapterIndex}-p${pairIndex}`。
</details>

**26.【批判】如果一本书的中日在同一段落内交错（同一 `<p>` 里日中混排），现有管线还能配对吗？**
<details><summary>答案要点</summary>

- 不能。`extractSentences` 以块级元素为单位切分，一个混合段落只会产出**一个**句子，其 textContent 日中连在一起；languageDetector 见到假名判 ja，整段进日语字段。
- 改进方向：切分粒度下沉到行内 `<span>`/`<br>` 或按沉浸式翻译的 span 结构识别；或在句级再做一次子串拆分。study-guide 第六节问题 3 的标准答案。
</details>

**27.【概念】TOC 扁平化和"TOC 排序"分别在解决什么问题？**
<details><summary>答案要点</summary>

- `flattenToc` 递归展开嵌套目录树为一维数组，保序收集。
- 但 TOC 声明顺序不一定等于 spine 物理顺序，所以 parser 又建 `spineIndex: Map<id, 位置>`，把 flatToc 过滤（必须有对应 spine 项）后按 spinePos 升序排序，每个 TOC 章节消费 `[startPos, nextPos)` 区间内的所有 spine HTML——解决"一个章节横跨多个 spine 文件"的合并问题。
</details>

**28.【代码追踪】封面探测的策略是什么？为什么要把它转成 dataURL？**
<details><summary>答案要点</summary>

- `extractCoverFromSpineHtml`：先查 manifest 是否声明 `cover-image` 属性；声明了就看前 3 个 spine 项，否则只看第 1 个（封面页总在最前）；用正则匹配 `<img src>` 或 SVG `<image href/xlink:href>`。
- 浏览器里解出的常是 `blob:` URL，页面刷新就失效，而 Book 要持久化进 localStorage——所以 fetch 成 Blob 后经 FileReader.readAsDataURL 转成自包含的 dataURL。
</details>

**29.【概念】解析放浏览器端而不是服务端，收益和代价各是什么？**
<details><summary>答案要点</summary>

- 收益：服务端零状态零存储、书籍不出浏览器（隐私）、部署简单（静态 dist + 一个轻 API）。
- 代价：localStorage ~5MB 容量天花板；DOMParser + 全 spine 预载在主线程同步执行，大部头书导入会卡 UI；无法利用服务端 CPU/缓存。
</details>

**30.【批判】`parseEpubFile` 一次性 `await epub.loadChapter()` 预载全部 spine，会有什么问题？怎么优化？**
<details><summary>答案要点</summary>

- 问题：几百个 spine 文件的书会长时间阻塞主线程且峰值内存高；任何一个 loadChapter 抛错虽被 catch 跳过，但整体无进度反馈。
- 优化：分批/惰性加载（进入章节再解析该区间）、用 Web Worker 跑解析、上报进度回调（练习集里有对应任务）、requestIdleCallback 分片。
</details>

**31.【概念】`extractText` 为什么要处理 `{ _, $ }` 形状的对象？**
<details><summary>答案要点</summary>

- @lingo-reader/epub-parser 的 metadata 值可能是 XML 解析产物，形如 `{ _: '实际文本', $: {属性} }`（xml2js 风格）。`extractText` 对 string 直接返回、对含 `_` 的对象取 `_`、其余 String() 兜底——防御性取值，防止某本书元数据形状怪异导致崩溃。
</details>

**32.【代码追踪】`updatePairChinese(pairId, chinese)` 是干什么的？它在哪些场景会被调用？**
<details><summary>答案要点</summary>

- bookSlice 提供的方法：遍历 books 找到对应章节，把指定 pair 的 chinese 字段更新（空串即未翻译位）。
- 场景：手工补译、以及"AI 生成分句译文回填"类功能的落点——未配对日语行保留 chinese='' 就是为了之后回填（pairBuilder 注释明说了这一设计意图）。
</details>

**33.【批判】pairBuilder 会丢弃未配对的中文行（只有 ja 行被保留）。这个取舍合理吗？**
<details><summary>答案要点</summary>

- 合理处：本项目日语是阅读主体，孤儿中文多半是版权页/广告，保留反而产生噪音 pair。
- 不合理处：若译文在前、原文缺失（残缺书），信息直接丢失且不可恢复。更稳方案是把未配对 zh 行也保留为单向 pair，UI 标记"缺原文"，配合后续 AI 回填。
</details>

---

## 第三部分 · 阅读器 UI 实战（阶段 3，第 16-19 课）

**34.【代码追踪】ReadingView 的键盘体系是怎么组织的？列出全部按键及行为。**
<details><summary>答案要点</summary>

- 单个 `window.addEventListener('keydown', handleKeyDown)`（ReadingView.tsx 约 254-308 行），先判断焦点是否在 input 里分流。
- 按键：`Escape`（input 里则 blur，否则关面板/清选区）；`j`/`k` 移动选中句（findIndex ± 1）；`g` 置 giPending（500ms 超时防粘滞）后 `i` 进入输入框（经典 vim 风格两段式）；`r` toggleAutoRead 连续朗读；`?` 打开 ShortcutHelp。
- 主题键 N/M/D/S/R/W 由 themeStore 相关组件的另一套监听处理。
</details>

**35.【概念】`giPending` + setTimeout 的设计在解决什么问题？为什么不能直接绑一个组合键监听？**
<details><summary>答案要点</summary>

- 解决"两段式按键"的状态机问题：`g` 只是预备键，500ms 内来的 `i` 才触发聚焦，超时复位防止用户单独按 g 后误触。
- keydown 事件没有原生的序列组合支持，必须自己维护 pending 状态；同时用 `!e.repeat` 防长按重复触发。
</details>

**36.【代码追踪】书签跳转联动是怎么实现的？（从点击书签列表到滚动到位）**
<details><summary>答案要点</summary>

- TextBookmark 带 `pairId`/`chapterId`/`startOffset`/`endOffset`。BookmarkList 点击项调 `setScrollToBookmarkId(id)`。
- ReadingView 订阅 `scrollToBookmarkId`（bookSlice 还有平行的 `scrollToPairId`/`setScrollToPairId`），变化时定位到对应句对卡片滚动；完成后置 null 复位。跨章书签还需先 setCurrentChapter 再滚。
</details>

**37.【概念】TextBookmark 为什么存 offset 而不存"第几个字的高亮 span"？数据完整性依赖什么前提？**
<details><summary>答案要点</summary>

- 存 `startOffset/endOffset`（相对该句纯文本的字符偏移）+ colorId + text 快照：偏移量与渲染结构解耦，换主题/换布局不影响。
- 前提是 japanese 纯文本永不变化；一旦引入 AI 回填改写或重新导入同书（bookId 是 `book-${Date.now()}`，重导即新 id），旧 offset 可能失配——text 快照可用于校验失效书签。
</details>

**38.【代码追踪】`useTextSelection` + SelectionPopover 的交互链路是什么？**
<details><summary>答案要点</summary>

- Hook 监听 document 的 selectionchange/mouseup，拿 `window.getSelection()` 的 range 与位置；仅当选区落在句对卡片文本内才激活 popover。
- popover 渲染 BOOKMARK_COLORS 六色按钮，点击调 `addBookmark({...})`（bookmarkSlice 自动生成 `bm-${Date.now()}-${random36}` id 与 createdAt）。
</details>

**39.【概念】长章节（上千句对）全量渲染会有什么性能问题？虚拟化的基本原理？**
<details><summary>答案要点</summary>

- 问题：数千个 DOM 卡片（每卡还可能带 ruby HTML）导致首屏慢、滚动掉帧、内存高。
- 虚拟化：只渲染视口内 ± 缓冲区的卡片，用总高度撑开滚动容器，滚动时按 scrollTop 换算可见区间替换渲染内容（react-window/react-virtuoso 思路）。难点是与 j/k 定位、scrollToPairId 滚动、书签跳转的协同。
</details>

**40.【代码追踪】PracticePanel 提交分析的完整前端状态流是什么？**
<details><summary>答案要点</summary>

- 输入框 onChange → practiceSlice.setTranslation(pairId, text)；点击提交 → 组件调 useAnalysis().analyze(...)。
- analyze 先校验（无 apiKey 抛「请先在设置中配置AI API Key」、空译文抛错），`setAnalyzing(pairId)` 置 loading，成功 `setAnalysis(pairId, result)`（同时清 analyzing），失败 catch 里 `setAnalyzing(null)` 后 rethrow。
- AnalysisPanel 渲染 analyses[pairId] 的 rawMarkdown + score/errors/strengths/suggestions。
</details>

**41.【概念】AnalysisResult 类型有哪些字段？ErrorCategory 枚举了哪些错误类别？**
<details><summary>答案要点</summary>

- AnalysisResult：pairId、userTranslation、originalJapanese、score、errors: AnalysisError[]、strengths[]、suggestions[]、rawMarkdown、analyzedAt。
- AnalysisError：category/userText/correctText/explanation。
- ErrorCategory：『文法』『語彙』『助詞』『敬語』『時制』『表現』『語順』『その他』八个（注意是日文标签）。
</details>

**42.【批判】practiceSlice 的 translations/anyses 以 pairId 为键，而 pairId 是 `ch0-p3` 这种章内序号。有什么坑？**
<details><summary>答案要点</summary>

- pairId 不含 bookId，两本书的同章同句共用同一个键——练习记录会跨书串台。
- 同一本书删除重导后 bookId 变了但 pairId 格式不变，旧记录仍指向新书的同序号句。
- 改法：键升级为 `${bookId}:${chapterId}:${pairId}` 或给 pair 引入稳定 hash；顺带要写 persist version+migrate（正好复用 settingsSlice 的迁移模式）。
</details>

**43.【概念】SentencePairCard 在 alternating 与 parallel 两种布局下的区别是什么？layoutMode 存在哪？**
<details><summary>答案要点</summary>

- settingsSlice 的 `LayoutMode = 'alternating' | 'parallel'`，持久化于 settings-store。
- alternating：日中上下交替堆叠（阅读动线单一）；parallel：左右并排对照（对比视线快）。同一份 pairs 数据、两种 CSS 组织，体现"数据与视图分离"。
</details>

**44.【代码追踪】blindMode（盲译模式）切换后影响哪些渲染？实现在哪一层？**
<details><summary>答案要点</summary>

- settingsSlice 的布尔字段 + toggleBlindMode；开启后 SentencePairCard 隐藏/遮蔽中文译文，逼你只看日语。
- 实现在展示层而非数据层——pairs 数据不变，只是渲染条件分支，因此随时无损切换。
</details>

**45.【批判】ReadingView 的 keydown effect 依赖数组里有 selectedPairId 等多个值，每次变化都会移除重挂监听器。有什么隐患？更好的组织方式？**
<details><summary>答案要点</summary>

- 隐患：高频重订阅（虽成本低但易漏依赖产生闭包过期值 bug——读到旧 selectedPairId）。
- 更好：监听器只挂一次，内部经 `useRef` 读最新值，或用 `useSyncExternalStore`/zustand getState 在 handler 内现取；也可把快捷键抽成独立 hook 统一路由（giPending 状态机同理收拢）。
</details>

**46.【概念】ShortcutHelp 面板的意义除了帮助用户还有什么工程意义？**
<details><summary>答案要点</summary>

- 它是快捷键的**唯一事实来源展示面**：新增快捷键不同步此面板就会腐化。工程上是"文档即代码"的微缩实践——评审时可要求任何快捷键 PR 必须带上 ShortcutHelp 与 README 两处同步 diff。
</details>

**47.【代码追踪】从选中一句到打开练习面板，涉及哪些组件与 store 字段的接力？**
<details><summary>答案要点</summary>

- 点击句对卡 → ReadingView 更新本地/共享的 selectedPairId（j/k 也只是改它）→ 打开 PracticePanel 并传入当前 pair → 输入内容读写 practiceSlice.translations[pairId] → 分析结果经 setAnalysis 回填 → AnalysisPanel 展示。
- 关键理解：选中态驱动面板开关，pairId 是贯穿 UI/practice/book 三个域的主键。
</details>

---

## 第四部分 · 后端与 AI（阶段 4，第 20-25 课）⭐

**48.【概念】Hono 和 Express 的核心差异？项目为什么选 Hono？**
<details><summary>答案要点</summary>

- Hono 基于 Web 标准 Request/Response/fetch API（`app.fetch` 即是一个 handler），TS 优先、极轻、可跑 Node/Deno/Bun/Workers 多运行时。
- 本项目一个 `serve({ fetch: app.fetch, port })` 同时服务 `/api` 路由和生产 `serveStatic` + SPA fallback；Express 需要 Node 特有 API，迁移云端边缘反而麻烦。
</details>

**49.【代码追踪】从点击「提交分析」到 AI 返回，经过哪些函数？按序说出每一个。**
<details><summary>答案要点</summary>

1. PracticePanel onSubmit → `useAnalysis().analyze(pairId, original, chinese, userTranslation)`；
2. `analyzeTranslation`（lib/ai/client.ts）→ `buildAnalysisPrompt` 拼 prompt → `fetch('/api/analyze', {method:'POST', body:{provider,apiKey,model,prompt}})`；
3. 服务端 routes/ai.ts 的 `ai.post('/analyze')`：限流检查 → `createProvider(provider, apiKey, model, baseUrl)`；
4. Vercel AI SDK `generateText({ model, prompt })` → 厂商 SDK 出网；
5. 返回 `{ text }` → 前端正则 `/【综合评分】\s*(\d+)/` 抠分数（匹配不到 fallback 0）→ `setAnalysis` 入 store → AnalysisPanel 渲染。
</details>

**50.【代码追踪】限流器的完整实现细节：窗口多大、阈值多少、键是什么、怎么清扫？**
<details><summary>答案要点</summary>

- 常量：`RATE_LIMIT_WINDOW_MS = 60_000`，`RATE_LIMIT_MAX = 30`（routes/ai.ts 顶部注释：per-IP, per minute）。
- 存储：`rateBuckets = new Map<string, {count, resetAt}>`，键取 `x-forwarded-for` 第一段（split(',')[0].trim()），缺失用 `'unknown'`。
- 首次或窗口过期则新建桶 `{count:0, resetAt: now+60s}`；`count += 1` 后 >30 返回 429 JSON。
- 清扫：模块级 `setInterval` 每 5 分钟遍历删除 `resetAt <= now` 的桶。
</details>

**51.【批判】这个限流器至少有三个可攻击/可失效的点，请指出并给出改进。**
<details><summary>答案要点</summary>

- ① `x-forwarded-for` 客户端可伪造（除非前面有可信代理覆写）→ 直连时随便换头绕限流；应在可信反代层设置并只信任最后一跳，或直接用 socket 远端地址兜底校验。
- ② 内存 Map：多实例部署各自计数、重启清零 → Redis（INCR+EXPIRE 或滑动窗口 Lua）承载共享计数。
- ③ 固定窗口有边界突发问题（窗口交界可打 2×流量）→ 滑动窗口/令牌桶。
- 附：TTS 路由完全没限流，`/api/tts/:provider` 也能被刷。
</details>

**52.【概念】`createProvider` 的工厂模式体现在哪？四种 type 分别怎么创建？**
<details><summary>答案要点</summary>

- providers.ts：switch(type) 返回统一的 `LanguageModelV1` 接口实例——上层 generateText 不感知厂商差异。
- `openai` → createOpenAI({apiKey}).chat(model)；`anthropic` → createAnthropic；`google` → createGoogleGenerativeAI；`openai-compatible` → createOpenAI 且传 `baseURL: baseUrl`（兼容本地/Ollama 类端点）；default 抛 Unknown provider type。
</details>

**53.【概念】Vercel AI SDK 的 `generateText` 统一了什么？LanguageModelV1 抽象的价值？**
<details><summary>答案要点</summary>

- 统一输入输出：不管哪家 SDK，调用方只给 `{model, prompt}` 拿 `{text}`；LanguageModelV1 是厂商适配器共同实现的接口规范。
- 价值：换厂商零业务改动（只换 createProvider 分支）、便于测试（mock 一个 model 实例）、后续可平滑换 generateObject/streamText 等同族 API。
</details>

**54.【概念】三个 prompt 各自的角色和输出约束是什么？为什么"提示"prompt 强调不给答案？**
<details><summary>答案要点</summary>

- prompts.ts 三函数：`buildHintPrompt`（回译提示：语法结构/语序连接/时态体态等角度，【语法结构】式标记格式，明确"只提示方向，不要给出原文的具体日语表达"——防剧透保训练效果）；`buildBacktranslateHintPrompt`（把机翻腔中文改写成适合回译的自然版本）；`buildAnalysisPrompt`（打分纠错，要求输出含【综合评分】标记，用日语回答）。
- 输出约束技巧：固定标记 + 中文指令 + 示例（few-shot），为前端正则抠分数服务。
</details>

**55.【代码追踪】前端正则是怎么抠分数的？失败时的行为？**
<details><summary>答案要点</summary>

- client.ts：`rawMarkdown.match(/【综合评分】\s*(\d+)/)` → `parseInt(match[1], 10)`；match 为 null 时 `score = 0`。
- 风险：模型输出「综合评分：85」全角冒号变体或标记漏写就静默得 0 分，用户看到误导性低分。改进：generateObject + JSON Schema（毕业项目正题）。
</details>

**56.【批判】`POST /api/analyze` 把 apiKey 放请求体，服务端错误又原样透传（catch 里返回 e.message, 500）。各有什么风险？**
<details><summary>答案要点</summary>

- apiKey 在 body：BYOK 设计使然（key 不落盘、只在内存转发），但要确保不打访问日志、不走会缓存的代理；公网共享实例等于把 key 交给服务器运营者——威胁模型必须讲清。
- 错误透传：厂商 SDK 错误可能含账号/配额/上游 URL 信息，直接回给任意调用方是信息泄露面；应映射成脱敏的错误码 + 通用文案，详细原因只进服务端日志。
</details>

**57.【概念】生产模式不设 CORS_ORIGIN 时为什么反而是"最安全"的？**
<details><summary>答案要点</summary>

- server/index.ts：isProd 且有 CORS_ORIGIN 才挂 cors({origin})；**没配则完全不挂 CORS 中间件**——浏览器同源策略下，其他 origin 的 JS 无法读取响应（简单请求虽能发出但响应被拦截）。
- 自托管场景前端和 API 同源同端口（serveStatic 托管 dist），天然不需要跨域；显式开放 origin 反而是额外攻击面。开发模式则 cors() 全放开方便 5174→3003。
</details>

**58.【代码追踪】SPA fallback 是怎么实现的？为什么刷新 `/reader` 这类路径不会 404？**
<details><summary>答案要点</summary>

- 生产分支两条中间件：`app.use('/*', serveStatic({ root: './dist' }))` 先命中真实文件；未命中的 GET 再走 `app.get('/*', serveStatic({ root: './dist', path: 'index.html' }))` 把 index.html 兜底返回。
- 前端是 SPA（uiSlice.currentView 内部路由，非 URL 路由），任意路径都回到 index.html 由 JS 接管。
</details>

**59.【批判】`/health` 目前只返回 `{status:'ok'}`。对一个要进容器的服务，健康检查还应该暴露什么？**
<details><summary>答案要点</summary>

- 至少：版本号（package.json version 注入）、进程 uptime、内存用量（process.memoryUsage()，尤其挂着 120MB 级 TTS 缓存）、VOICEVOX 依赖可达性探测（可选 deep check 参数区分 liveness/readiness）。
- 课程作业已要求加 version + runtime；进一步可把 ttsCache 统计并入供运维观测。
</details>

**60.【概念】BYOK 下服务端其实持有明文 key 数秒，"密钥只存浏览器本地"这句宣传怎么解释才严谨？**
<details><summary>答案要点</summary>

- 严谨表述：Key **持久化**只在浏览器 localStorage（settings-store）；每次请求经 HTTPS 发给你自己部署的服务器，服务器仅在内存中用它构造厂商请求即丢弃，不写日志不落库。
- 前提是服务器可信且为用户自有；README 英文版 "Keys never leave your browser" 在共享部署语境下不准确——面试主动指出这种措辞偏差是加分项。
</details>

**61.【代码追踪】`generateText` 抛错时用户看到什么？整个错误路径上有几层兜底？**
<details><summary>答案要点</summary>

- 服务端 catch：`e instanceof Error ? e.message : 'Unknown error'` → 500 JSON `{error}`。
- 前端 client.ts 检查 response.ok，非 ok 取 data.error 抛 Error；useAnalysis 的 catch 里 `setAnalyzing(null)` 后 rethrow；PracticePanel 捕获展示错误态。三层：HTTP 状态 → 前端 ok 检查 → 组件 try/catch。
</details>

**62.【批判】`/api/analyze` 对 body 只做了 presence 校验（provider/apiKey/model/prompt 缺一 400），还有什么输入风险？**
<details><summary>答案要点</summary>

- 无长度上限：超大 prompt 直接打爆上游账单/内存；无 provider 白名单外的类型校验（非法 type 由工厂 throw 进 500 而非 400）；baseUrl 完全由客户端指定 → SSRF 面（服务器向任意 URL 发请求）。
- 改法：zod/valibot schema 校验 + prompt 长度上限 + openai-compatible 的 baseUrl 域名白名单。
</details>

**63.【概念】如果把评分改成结构化输出（generateObject），链路上哪些地方要动？**
<details><summary>答案要点</summary>

- 服务端：generateText → generateObject({ model, schema })，schema 定义 score(number)/errors/strengths/suggestions 等（毕业项目题目）。
- 前端：client.ts 不再正则抠分，response 直接是符合 AnalysisResult 形状的 JSON；prompt 里的格式约束段落可删；practiceSlice.setAnalysis 数据源不变——体现接口收敛的好处。
</details>

**64.【概念】为什么 prompt 全部用中文写、却要求分析结果用日语回答？多语言 prompt 有什么注意点？**
<details><summary>答案要点</summary>

- 指令用中文贴合目标用户心智、便于迭代措辞；纠错示例/解释用日语保证学习者看到地道日语输出（buildAnalysisPrompt 结尾明确"请使用日语回答"）。
- 注意点：混语言时明确分段标注"以下为输出语言要求"、给输出格式样例锚定、避免中文习惯词干扰日语助词纠错。
</details>

**65.【批判】限流的 429 响应没有 Retry-After 头，也没有区分"差多少次恢复"。客户端体验该怎么补？**
<details><summary>答案要点</summary>

- 服务端：429 时附 `Retry-After: <秒>`（bucket.resetAt - now 换算）。
- 前端：捕获 429 显示倒计时禁用提交按钮，而非通用报错；可选指数退避自动重试一次。体现"限流不只服务端的事"。
</details>

---

## 第五部分 · TTS 语音系统（阶段 5，第 26-28 课）

**66.【概念】双引擎 msedge-tts 和 VOICEVOX 的定位差异？Docker 里怎么按需启用后者？**
<details><summary>答案要点</summary>

- MicrosoftTTSProvider：免配置走 Edge 接口，返回 audio/mpeg，适合开箱即用；VoicevoxProvider：本地引擎（音质/角色丰富），需独立服务，返回 audio/wav。
- docker-compose.yml 里 voicevox 是独立 service，挂在 `profiles: [voicevox]` 下——`docker compose --profile voicevox up` 才启动；app 通过 `VOICEVOX_ENGINE_URL=http://voicevox:50021` 连它，depends_on 设 `required: false` 保证默认 profile 不被阻塞。
</details>

**67.【概念】TTSProvider 接口长什么样？策略模式注册表怎么实现的？**
<details><summary>答案要点</summary>

- server/tts/types.ts：`interface TTSProvider { readonly name: string; synthesize(text, speaker, options?): Promise<Buffer>; getSpeakers(): Promise<Speaker[]> }`；SynthesisOptions 含 speedScale/pitchScale/volumeScale；Speaker 含 styles 数组（{id, name}）。
- index.ts：`providers = new Map<string, TTSProvider>()` 注册 'voicevox'/'microsoft' 两实例；getProvider(name) 缺省回落 `TTS_DEFAULT_PROVIDER ?? 'microsoft'`，未知名 throw。新增引擎=实现接口+一行 set，路由层零改动。
</details>

**68.【代码追踪】服务端 TTS 缓存的键是怎么设计的？为什么要把 options 编进 key？**
<details><summary>答案要点</summary>

- `makeCacheKey`：`sha1(\`${provider}::${speaker}::${speed}::${pitch}::${volume}::${text}\`)` hex。
- 同一文本不同语速/音高产出不同音频，不编进 key 会错误命中；编进去则天然区分。sha1 十六进制避免超长文本做 Map 键的开销与歧义。
</details>

**69.【代码追踪】缓存满了怎么淘汰？写出 evictIfNeeded 的算法和统计字段。**
<details><summary>答案要点</summary>

- `ttsCacheBytes > max` 时把 `ttsCache.values()` 按 `lastAccessAt` 升序排序逐个 delete、扣减 bytes、`ttsCacheEvictions += 1`，直到 ≤ max。
- LRU 触碰：readCache/writeCache 命中或写入都刷新 lastAccessAt。统计五件套：items/totalBytes/maxBytes/hits/misses/evictions，经 `GET /api/tts/cache/stats` 暴露。
</details>

**70.【概念】缓存响应头 `Cache-Control: no-store` 和 `X-TTS-Cache: HIT/MISS` 各起什么作用？**
<details><summary>答案要点</summary>

- no-store：音频按 text+speaker+options 寻址，浏览器/代理再缓存一层会导致统计失真且占双份内存，明确禁止二级缓存。
- X-TTS-Cache 自定义头让客户端（和调试 curl）一眼区分命中与否，配合 stats 接口观测命中率。
</details>

**71.【代码追踪】`POST /api/tts/:provider` 的请求/响应契约是什么？microsoft 和 voicevox 的 Content-Type 差异在哪处理？**
<details><summary>答案要点</summary>

- 请求 body：`{ text（必填 string，缺失 400）, speaker = 1, options? }`。
- 响应：Buffer 音频直出；`contentType = provider.name === 'microsoft' ? 'audio/mpeg' : 'audio/wav'`；命中带 X-TTS-Cache: HIT，否则合成后 writeCache 再 MISS 返回；异常 500 透传 message。
- 细节：`/cache/stats`、`/cache/clear` 必须注册在 `/:provider` 之前，否则 "cache" 会被当成 provider 名吃掉（代码注释明示）。
</details>

**72.【概念】客户端 voicevox.ts 的缓存和服务端缓存是什么关系？默认容量各多少？**
<details><summary>答案要点</summary>

- 两层独立缓存：服务端 Buffer 缓存省合成计算与出网；客户端 Blob URL 缓存（`DEFAULT_MAX_CACHE_BYTES = 80 * 1024 * 1024`，可 setVoicevoxCacheLimitMB 调 16~512MB）省 HTTP 往返，播放零延迟。
- 命中路径：客户端命中 → 直接播；未命中 → 服务端命中 → 仅网络传输；双双未命中 → 真合成。设置里 voicevoxCacheLimitMB 默认 80，与服务端 120MB（TTS_CACHE_MAX_BYTES 默认 120*1024*1024 = 125829120）呼应。
</details>

**73.【代码追踪】预取是怎么消除连续朗读卡顿的？`voicePending` Map 又是防什么的？**
<details><summary>答案要点</summary>

- `prefetchVoicevox(text, speaker, options)` = `ensureVoiceUrl(...).then(()=>undefined)`：提前把下一句（settings 里 voicevoxPrefetchWindow 默认提前 4 句，范围 1~10）合成的 URL 备好；播放结束回调触发下一句时 ensureVoiceUrl 直接命中本地缓存。
- `voicePending: Map<string, Promise<string>>` 做请求去重/合并：同一 key 的并发调用共享同一个 Promise，防止重复合成与竞态覆盖。
</details>

**74.【概念】为什么要用单例 HTMLAudioElement？cleanupCurrentAudio 都清理什么？**
<details><summary>答案要点</summary>

- 单例避免多 Audio 对象叠加播放、便于暂停/seek/事件绑定管理（toggleVoicevoxPause/seekVoicevox/stopVoicevoxPlayback 都操作它）。
- cleanupCurrentAudio：pause、移除 ended 等事件监听、`URL.revokeObjectURL(currentAudioUrl)` 释放 Blob 内存（Blob 不 revoke 会泄漏），置空引用。
</details>

**75.【代码追踪】播放状态是如何通知到 React 组件的？为什么说这是"React 外读 store"的技巧？**
<details><summary>答案要点</summary>

- voicevox.ts 维护模块级 playbackState + `listeners: Set<PlaybackListener>`，subscribeVoicevoxPlayback/subscribeVoicevoxEnded 返回取消函数；组件 useEffect 订阅后 setState。
- 反向：`getCurrentTtsProvider()` 直接 `useSettingsStore.getState().ttsProvider` 在非 React 模块里读 store——普通 JS 模块依赖 React 库的 store 单例，避免把 provider 一层层参数穿透。两种方向都是 zustand 常规用法。
</details>

**76.【批判】客户端缓存淘汰也是 lastAccessAt LRU，但两个缓存（80MB 客户端 + 120MB 服务端）加起来 200MB 内存预算合理吗？怎么权衡？**
<details><summary>答案要点</summary>

- 服务端是所有用户共享一份（自托管通常单人/家庭，尚可）；客户端 80MB 直接吃浏览设备内存，移动端可能引发标签页回收。
- 权衡点：按句长估算典型音频大小（一句 2-4s wav 约 100-300KB），80MB ≈ 数百句，一本一章足够；可改为按"当前章节滑动窗口保留"、wav 转 opus/aac 压缩 5-10 倍、或 IndexedDB 存音频把内存换成磁盘。
</details>

**77.【概念】speedScale 默认值是多少？为什么 pitch 默认 0 而 speed/volume 默认 1？**
<details><summary>答案要点</summary>

- makeCacheKey 与 SynthesisOptions 的缺省：`speed ?? 1, pitch ?? 0, volume ?? 1`——VOICEVOX 引擎参数语义里 pitch 以 0 为中性（相对基准音高偏移），speed/volume 以 1 为倍率中性。缓存键用同样的缺省归一化，保证"不传 options"和"传默认值 options"命中同一缓存项。
</details>

**78.【批判】TTS 合成路由没有任何鉴权与限流，公网部署会发生什么？最小改动方案？**
<details><summary>答案要点</summary>

- 任何人可无限刷 `POST /api/tts/:provider`：微软接口被滥用可能封 IP，VOICEVOX 则耗尽本机 CPU；缓存虽挡住重复文本，随机文本绕过。
- 最小改动：复用 ai.ts 的桶模式抽成 hono middleware 挂到 tts 子应用（顺手修掉"限流只在 analyze"的不一致）；再加 text 最大长度校验。
</details>

**79.【概念】speakers 列表的获取链路是什么？客户端怎么缓存它？**
<details><summary>答案要点</summary>

- `GET /api/tts/:provider/speakers` → provider.getSpeakers()（VOICEVOX 转发引擎 /speakers，微软提供内置风格表）。
- 客户端 getVoicevoxSpeakers 用模块级 `cachedSpeakers` + `speakersRequest`（Promise 缓存）做单飞，多组件同时要也只发一次请求。
</details>

**80.【批判】settingsSlice 默认 `ttsProvider: 'voicevox'`，而服务端 `TTS_DEFAULT_PROVIDER ?? 'microsoft'`。这个不一致会怎样？**
<details><summary>答案要点</summary>

- 前端默认想用 voicevox：若用户没启 voicevox 引擎（docker 默认 profile 只有 microsoft），合成请求打到 `/api/tts/voicevox` 直接 500，新用户体验断裂；服务端默认 microsoft 只在"没人指定 provider"时生效，实际总是被前端指定覆盖。
- 修法：默认对齐为 microsoft（免费可用），或前端在 voicevox 失败时自动降级 microsoft 并提示。
</details>

---

## 第六部分 · 部署工程化与毕业（阶段 6，第 29-30 课）

**81.【概念】Dockerfile 的两个阶段各自做什么？为什么运行镜像还要拷 src/types？**
<details><summary>答案要点</summary>

- builder（node:22-alpine）：corepack 启用 pnpm → 装依赖 → `pnpm run build` 产 dist。
- runtime：只拷 dist、server/、src/types、package.json+lockfile、tsconfig*，`pnpm install --frozen-lockfile --prod` 装生产依赖，EXPOSE 3003，CMD `pnpm start`。
- 拷 src/types：server/providers.ts 顶部 `import type { AIProviderType } from '../src/types/settings'`——类型虽编译期擦除，但 tsx 运行时 import 解析需要文件存在（type-only import 实际会被剥除，拷贝更多是保险；能讲出这层辨析最好）。
</details>

**82.【概念】`pnpm start` 的完整命令是什么？NODE_ENV 在哪里生效、影响什么？**
<details><summary>答案要点</summary>

- `"start": "NODE_ENV=production node --env-file-if-exists=.env --import tsx server/index.ts"`。
- index.ts 读 `process.env.NODE_ENV === 'production'` 得 isProd → 决定是否挂受限 CORS、是否 serveStatic + SPA fallback；PORT 缺省 3003。`--env-file-if-exists=.env` 让本地与容器共用一套变量注入。
</details>

**83.【代码追踪】列出全部环境变量及默认值（背下来）。**
<details><summary>答案要点</summary>

| 变量 | 默认 | 作用 |
|---|---|---|
| PORT | 3003 | 服务端口（index.ts `Number(process.env.PORT ?? 3003)`） |
| TTS_DEFAULT_PROVIDER | microsoft | 未指定 provider 时的 TTS 引擎 |
| VOICEVOX_ENGINE_URL | http://localhost:50021 | VOICEVOX 引擎地址 |
| TTS_CACHE_MAX_BYTES | 125829120（120MB） | 服务端音频缓存字节上限 |
| CORS_ORIGIN | 未设=仅同源 | 生产允许的跨域 origin |
| OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY | 空 | 可选服务端兜底 key（默认 BYOK 不用） |
| NODE_ENV | development | production 触发静态托管/CORS 收紧 |
</details>

**84.【概念】compose 里 depends_on 的 `required: false` 解决什么问题？profiles 的语义？**
<details><summary>答案要点</summary>

- voicevox 服务在 `profiles: [voicevox]` 下：默认 `docker compose up` 不启动它。
- app 的 `depends_on: condition: service_started, required: false` 表示"若启动了就先于 app，没启动也不阻塞"——同一份 compose 兼容两种形态，这是 profiles + 软依赖的标准组合。
</details>

**85.【批判】当前镜像/编排有哪些生产化欠缺？**
<details><summary>答案要点</summary>

- 无 HEALTHCHECK 指令（虽有 /health 端点）；容器以 root 运行（无 USER node）；无 restart 策略与资源限额；tsx 跑 TS 源码作为生产运行时（应预编译成 JS 省内存与启动时间）；日志直出 stdout 尚可但没有级别控制。
- 每条都能给改法：HEALTHCHECK curl /health、USER、deploy.resources、tsc 产出 dist-server。
</details>

**86.【概念】毕业项目"结构化输出改造"的验收标准应该怎么定？**
<details><summary>答案要点</summary>

- 功能：/api/analyze 支持（或切换为）generateObject，schema 覆盖 score/errors/strengths/suggestions；前端删除 `/【综合评分】/` 正则，score 来自结构化字段。
- 质量：schema 校验失败的降级行为明确（重试一次或报错而非静默 0 分）；README/docs 同步；全量回归导入→回译→评分显示通过。
</details>

**87.【批判】"没有任何测试"是最大防守点。给出一个务实的补测路线图。**
<details><summary>答案要点</summary>

- 第一优先纯函数：pairBuilder.buildPairs（JA→ZH/ZH→JA/单语/混合四类 case，正是课程作业）、sentenceSplitter.extractSentences（嵌套块/ruby/空行兜底）、languageDetector（码点边界）。
- 其次 sanitizeRubyHtml 的 XSS 用例表；再 mock fetch 测 lib/ai/client 的分数解析与错误分支；服务端用 hono 的 app.request 测限流 429 与 400。
- 最后 vitest coverage 阈值进 CI（练习集任务 11）。
</details>

**88.【概念】如果要拆 monorepo，包边界怎么划？哪些依赖会变成问题？**
<details><summary>答案要点</summary>

- packages/web（src/ 前端）、packages/server（Hono API）、packages/shared（types/、prompts.ts、领域常量）。
- 问题点：server/providers.ts 反向 import `../src/types/settings`（跨界引用，须迁 shared）；client.ts 的相对路径 fetch('/api/analyze') 在前后端分包后要显式配置 baseURL；tsconfig project references 要重排。
</details>

**89.【概念】WebSocket 多设备同步的最小可行架构？和现有 localStorage 架构的根本冲突是什么？**
<details><summary>答案要点</summary>

- 最小方案：服务端持房间（bookId）连接表，广播 progress/bookmark/practice 事件，客户端收到后 merge 进 zustand（last-write-wins 起步）。
- 根本冲突：现状数据主权在浏览器 localStorage，服务端零状态——同步意味着把数据上移服务端（或引入 CRDT/中继），BYOK 的"书籍不出浏览器"隐私承诺要重新谈判。能意识到这是产品决策而不只是技术活是加分项。
</details>

**90.【概念】插件化 AI provider 的目标是把 createProvider 的 switch 换成什么形态？兼容层怎么处理？**
<details><summary>答案要点</summary>

- ProviderRegistry：`register(type, factory)` + `resolve(type): LanguageModelV1Factory`，内置四家作为预装插件；新厂商只需一个满足 `{type, create(apiKey, model, baseUrl)}` 契约的模块。
- openai-compatible 天然是"万能逃生舱"：绝大多数新端点先用 compatible 接入，验证后再沉淀为一等 provider——注册表让这个演进无需改核心。
</details>

**91.【概念】发布 v1.0 前的 checklist 应包含哪些项？**
<details><summary>答案要点</summary>

- 补 README 截图（现存 `<!-- TODO: add screenshot -->` 必须消灭）、CHANGELOG、LICENSE 已有 MIT、semver 打 tag、CI 绿、coverage 达标、Docker 镜像构建并冒烟、.env.example 与文档核对、破坏性迁移（如有 persist version bump）验证、demo 数据/欢迎指南可用（docs/welcome-guide.md）。
</details>

**92.【批判】项目当前 CI 一条都没有。第一个 workflow 该包含什么？**
<details><summary>答案要点</summary>

- push/PR 触发：checkout → pnpm setup（corepack，缓存 store）→ install --frozen-lockfile → lint → tsc -b（build 自带类型检查）→ vitest run --coverage（补测试后）→ docker build（可选仅 main）。
- 关键细节：Node 22 矩阵、pnpm store 缓存加速、lint 与 test 并行 job。
</details>

**93.【概念】错误边界（ErrorBoundary）在这个应用最有价值的三个挂载点？**
<details><summary>答案要点</summary>

- ① ReadingView/句对卡渲染层：dangerouslySetInnerHTML 的 ruby HTML 若被未来代码引入脏数据，崩的是整棵树——边界包住卡片列表可降级为"跳过坏句"。
- ② AnalysisPanel：AI Markdown 渲染异常不应拖垮阅读页。
- ③ 导入流程 EpubUploader：解析抛错（损坏 epub）目前只有局部 catch，边界兜底防白屏。React 19 可配合 onErrorCaught/onUncaughtError 根通知。
</details>

**94.【概念】性能预算怎么给这个项目定？用什么工具守？**
<details><summary>答案要点</summary>

- 预算维度：JS gzip 首屏（如 ≤250KB）、单 chunk 上限、LCP/INP（Lighthouse 阈值）、导入 5MB epub 的解析耗时 P95。
- 工具：vite build 产物 size-limit/bundlesize 卡 CI；Lighthouse CI 跑性能分；@lingo-reader/epub-parser 与 react-icons 是体积大户优先盯。
</details>

**95.【概念】i18n 方案怎么落地？这个项目特殊在哪？**
<details><summary>答案要点</summary>

- 常规：react-i18next 或轻量自研 context 字典，抽取 UI 文案（设置面板/快捷键帮助/书架）。
- 特殊性：**学习内容本身是日文**绝不能被 i18n 波及（ErrorCategory 的日文枚举标签是领域数据不是 UI 文案）；三套受众文案（简中 UI/日文学习内容/英文 README）要分层管理。
</details>

**96.【概念】IndexedDB 迁移的最小侵入做法？**
<details><summary>答案要点</summary>

- 利用 zustand persist 的自定义 storage 选项：实现一个 getItem/setItem 走 idb-keyval 的 async storage，只给 bookSlice（大数据）换，小 store 留 localStorage；写 version+migrate 把旧 localStorage 数据搬进 IDB 后清除。
- 注意 persist 异步化带来的水合时机问题（hydration 完成 flag），避免首帧拿到空 books。
</details>

**97.【批判】"导出进度"之外，导入大文件的 UX 还缺什么？给出完整方案要点。**
<details><summary>答案要点</summary>

- 现状：parseEpubFile 一次性 await，无进度、不可取消、失败只有 console。
- 方案：解析器加 onProgress(stage, ratio) 回调（spine 总数为分母）、Web Worker 化保 UI 可交互、AbortController 支持取消、失败给出具体章节定位错误报告。练习集任务 5 就是它的落地版。
</details>

**98.【概念】WebSocket 同步消息的冲突解决，last-write-wins 什么时候够用、什么时候不够？**
<details><summary>答案要点</summary>

- 够用：readingProgress、lastReadAt 这类单调/低频字段。
- 不够：translations/notes 双端同时编辑同句（丢更新）；书签集合增删交错。需要字段级时间戳向量或 CRDT（Yjs），或退化为"以设备为主设备"的产品约定。
</details>

**99.【概念】把 AI provider 插件化后，前端 settingsSlice 的 aiProviders 结构要跟着怎么演进？**
<details><summary>答案要点</summary>

- 现在 AIProviderProfile{id,name,type:四选一,apiKey,model,baseUrl?,enabled}；插件化后 type 变开放字符串 + 服务端下发/协商 supportedTypes 列表，前端动态渲染表单；DEFAULT_MODELS（gpt-4o/claude-sonnet-4-20250514/gemini-2.0-flash）也应随插件元数据携带而非前端硬编码。
- persist version 3 + migrate 兜住旧数据。
</details>

**100.【批判】综合全项目：如果只能再投入一周，你会按什么优先级改？说明理由。**
<details><summary>答案要点</summary>

- 参考答案（言之成理即可）：① 补核心纯函数测试 + CI（防回归的地基，面试防守点 1 直接消除）；② generateObject 结构化评分（消灭已知静默 0 分缺陷）；③ 限流抽 middleware 覆盖 TTS + Retry-After（安全一致性）；④ README 截图 + CHANGELOG（作品集门面）；⑤ IndexedDB（容量天花板）。排序逻辑：先正确性地基、再已知缺陷、再安全一致性、最后门面与扩展性。
</details>

---

*共 100 题：第一部分 15 · 第二部分 18 · 第三部分 14 · 第四部分 18 · 第五部分 15 · 第六部分 20。基于 2026-08-26 代码库实际通读编写，符号名均可在源码中检索验证。*
