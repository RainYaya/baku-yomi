# 隐式状态机清单与显式化方案

> 分支：`refactor/explicit-state-machines`
> 目标：在不改变现有阅读体验的前提下，把「散落在布尔值、ref、计时器和 store 字段里的工作流状态」收敛为可读、可测、可观测的显式状态机。

## 1. 为什么做这件事

重构前，同一个流程的状态经常由多处共同决定：

- 阅读器面板是否打开 = `selectedPairId !== null`
- 是否正在分析 = `analyzingPairId === pair.id`
- 是否正在朗读 = `isAutoReadOn && !isAutoReadBusy`
- TTS 是否在播 = `isActiveAudio && isPlaying && !isLoadingAudio`
- 导入是否失败 = `parseError !== null`

这些表示在正常路径上能对上，但一旦出现「用户在合成语音加载期间停止」「旧请求晚于新请求返回」「面板打开但选中句已切换」等情况，它们就会互相矛盾。显式状态机把「现在到底处于哪个阶段」变成一个带判别字段的联合类型，非法组合在类型层面就不存在。

### 三条不变量

1. **持久数据留在 store，瞬时工作流进入 machine。**
   译文草稿、分析结果、笔记、书签仍然在 Zustand persist 中；`selected / composing / analyzing` 这类「此刻正在做什么」不再写进持久层。
2. **异步结果必须带 token / requestId。**
   machine 只接受与当前 token 匹配的事件，晚到的响应不会覆盖新状态。
3. **每个可见状态都有 `data-*` 属性。**
   人和智能体都能从 DOM 直接读到当前状态，不需要猜测 class 或文本。

## 2. 工具层

| 文件 | 作用 |
|---|---|
| `src/machines/core.ts` | `createMachine`、`Machine<S, E>`、`isStatus`。零依赖，transition 是纯函数。 |
| `src/machines/react.ts` | `useMachine(machine, { debugId, debug })`，基于 `useReducer`；DEV 下打印迁移并注册实时快照。 |
| `src/machines/registry.ts` | `window.__BAKU_MACHINES__.snapshot()`，DEV 下可一次读取所有 machine 的当前状态。 |
| `src/machines/async.ts` | `AsyncState<T> = idle \| loading \| success(data) \| error(message)`，用于一次性异步操作。 |
| `src/lib/keyboard.ts` | 单入口键盘分发器，按 `priority` 决定谁处理按键，替代隐式的监听器顺序。 |

`useMachine` 的快照示例：

```js
// 浏览器控制台（DEV）
window.__BAKU_MACHINES__.snapshot()
// {
//   "reader.session": { "status": "composing", "pairId": "p12" },
//   "reader.autoRead": { "status": "off" },
//   "tts": { "status": "playing", "token": 7, ... },
//   "welcome": { "status": "hidden" }
// }
```

## 3. 已显式化的状态机

### 3.1 阅读会话 `reader.session`

文件：`src/machines/reader.ts`

| 旧表示 | 新状态 |
|---|---|
| `selectedPairId` + `inputMode` + `analyzingPairId` + 面板内 `error` | `reading` → `selected` → `composing` → `analyzing` → `reviewed` / `failed` |

迁移规则：

- 点击同一句：再次点击回到 `reading`（保持原有「点一下取消」行为）。
- 选中已有分析的句子：直接进入 `reviewed`，面板展示对比。
- 提交分析：`SUBMIT(requestId)` 只在 `selected / composing / reviewed / failed` 中被接受。
- `ANALYSIS_SUCCEEDED / ANALYSIS_FAILED` 只在 `analyzing` 且 `requestId` 匹配时生效。
- 分析期间切换句子或关闭面板，旧请求的结果会被忽略。
- 输入框 focus/blur 只改变 `composing` 与 `selected`，不再误关面板。

带来的变化：

- **UX**：面板打开时一定有一句被选中；分析失败后可以重试；原文在提交前保持隐藏。
- **DX**：所有分支集中在一个 `transition` 函数里，`PracticePanel` 不再自己维护 `analyzingPairId`。
- **AX**：`.reader-layout[data-reader-state]`、`.reader-practice-panel[data-practice-state]`、`.reader-practice-panel[data-analysis-state]`。

### 3.2 连续朗读 `reader.autoRead`

文件：`src/machines/reader.ts`

| 旧表示 | 新状态 |
|---|---|
| `isAutoReadOn` + `isAutoReadBusy` + `autoReadRequestedRef` | `off` → `starting` → `playing` → `stopping` → `off` |

关键点：

- `starting` 是真实存在的阶段：语音还在合成/加载时，用户已经可以按停止。
- 章节播完发送 `FINISH`，从任何状态回到 `off`，重复发送是幂等的。
- 旧 `STARTED` 事件（来自已经过期的播放）不会把状态拉回 `playing`。
- 阅读器卸载时 `stopVoicevoxPlayback()`，不会留下孤儿音频。

- **UX**：按钮在加载/停止阶段有忙碌态；停止不会卡在「看起来还在播」。
- **AX**：`.reader-layout[data-auto-read-state]`、悬浮按钮 `[data-auto-read-state]`。

### 3.3 TTS 播放 `tts`

文件：`src/machines/tts.ts`、`src/lib/tts/voicevox.ts`

| 旧表示 | 新状态 |
|---|---|
| `isActiveAudio` + `isPlaying` + `isLoadingAudio` + `currentTime` + `duration`（每个句子卡片各自维护） | `idle` → `loading` → `playing` ⇄ `paused`；`error`；`STOP` |

关键点：

- 每次播放递增 `playbackToken`；所有事件必须携带匹配的 token。
- 停止、切句、重新播放都会让旧 token 失效，旧音频的 `timeupdate / ended / error` 不会污染新状态。
- `stopVoicevoxPlayback()` 先递增 token 再清理，避免「停止后旧 `ended` 又触发下一句」。
- `SentencePairCard` 现在只保存一个 `TtsPlaybackView`，不再用五个可能互相矛盾的布尔值。
- `toPlaybackView()` 是唯一的 UI 投影，所有卡片看到同一份真相。

- **UX**：播放/暂停/进度/错误提示在所有句子卡片上一致；加载失败按钮显示「重试播放」。
- **DX**：TTS 模块的副作用与状态迁移分离，token 规则只写一次。
- **AX**：`.mini-audio-button[data-tts-state]`、`window.__BAKU_MACHINES__.snapshot().tts`。

### 3.4 EPUB 导入 `import`

文件：`src/machines/import.ts`、`src/hooks/useEpubParser.ts`

| 旧表示 | 新状态 |
|---|---|
| `parsing` 布尔值 + `parseError` + `parseFileName` + `parsingRef` | `idle` → `parsing(fileName)` → `success(fileName, bookId)` / `error(fileName, message)` |

关键点：

- `parsing` 期间重复选择文件会被忽略（`PARSE` 只在非 parsing 时接受）。
- 失败状态保留文件名，UI 可以告诉用户「哪个文件失败了」。
- `RESET` 是显式动作，不再靠清空多个 setState。

- **AX**：上传区、书架导入按钮、侧栏导入入口都有 `[data-import-state]`。

### 3.5 首次欢迎指南 `welcome`

文件：`src/machines/welcome.ts`

| 旧表示 | 新状态 |
|---|---|
| `visible` 布尔值 + `localStorage` 读取 + 首帧闪烁 | `loading` → `visible` / `hidden` → `dismissed` |

关键点：

- 水合完成前是 `loading`，不会先渲染再隐藏，避免老用户看到一闪而过的指南。
- `DISMISS` 是单向的；存储写入失败也仍然关闭当前会话。
- 指南内容来自 `docs/welcome-guide.md`，状态机只管「显示/隐藏」。

- **AX**：`.welcome-guide-overlay[data-welcome-state]`。

### 3.6 一次性异步操作 `AsyncState<T>`

文件：`src/machines/async.ts`

已接入：

| 操作 | 旧表示 | 新属性 |
|---|---|---|
| 优化译文 | `optimizing` 布尔值 + 错误字符串 | `[data-optimize-state]` |
| 获取回译提示 | `hintLoading` 字符串 id + 错误字符串 | `[data-hint-state]` |
| 加载 VOICEVOX 声音列表 | `voicevoxSpeakers[]` 空数组兼作「加载中/失败」 | `[data-speaker-state]` |
| 读取服务端缓存统计 | `serverStats: null` 兼作「加载中/失败」，catch 静默 | `[data-server-stats-state]` |

- **UX**：加载失败不再永远显示「读取中...」，而是明确的错误文案。
- **DX**：`AsyncState` 自带 `data`，不需要额外判断旧值是否过期。
- **AX**：四个状态都是稳定的 `idle | loading | success | error`。

### 3.7 键盘仲裁 `keyboard`

文件：`src/lib/keyboard.ts`

这不是传统 FSM，但它原本是一个隐式优先级机器：

- `ThemeProvider` 在 document 上监听并 `setTimeout(0)` 延迟判断 `defaultPrevented`；
- 阅读器和主题监听器的执行顺序取决于挂载顺序；
- 设置抽屉和快捷键帮助声称支持 Esc，但没有对应处理。

现在：

- 每个功能注册 `{ id, priority, handler }`；
- 调度器按 priority 从高到低执行，第一个返回 `true` 或调用 `preventDefault()` 的处理器获胜；
- 已取消的事件不再分发；
- 新增 `SettingsModal`（priority 100）与 `ShortcutHelp`（priority 100）的 Esc 处理。

- **UX**：按 `r` 不会顺带切换主题；Esc 关闭最上层浮层；`?` 可以关闭帮助。
- **DX**：新增快捷键只需注册，不必关心其他监听器。
- **AX**：行为确定，不依赖 React 挂载顺序。

## 4. 刻意保留为局部状态的部分

不是所有 `useState` 都值得变成状态机。下面这些没有跨组件不变量、没有异步竞争、也没有生命周期歧义，保留局部状态更简单；同时补了 `data-*` 供自动化读取。

| 位置 | 状态 | 保留原因 | AX |
|---|---|---|---|
| `BookshelfPage` | `query`, `sortBy` | 纯筛选/排序，结果可推导，无生命周期 | — |
| `EpubUploader` | `dragOver` | 指针瞬时态 | — |
| `BookCard` | `editing`, `titleDraft` | 表单草稿；只有 viewed/editing 两态，没有跨组件约束 | `[data-rename-state]` |
| `PracticePanel` | `editing`, `editText` | 译文编辑草稿 | — |
| `PracticePanel` | `showNote` | 笔记区展开/收起 | — |
| `SettingsModal` | `activeTab` | 枚举选择，不是工作流 | `[data-settings-tab]` |
| `ReadingView` | `showHelp`, `showBookmarkList` | 独立浮层可见性；Esc 由高优先级键盘处理器统一关闭 | `[data-help-state]`、`[data-bookmark-panel-state]` |
| `useTextSelection` | `selection`, `justSelectedRef` | 点击后必须同步判断「刚刚选中」，React 状态更新会晚一帧；本轮补了计时器清理 | `[data-selection-state]` |
| `bookmarkSlice` | `scrollToBookmarkId` | 跨组件的一次性「跳转到书签」命令；本轮用 `partialize` 把它从 persist 中排除，避免刷新后重放旧跳转 | — |
| `ReadingView` | `restoredRef`, `skipNextScrollRef`, `lastSelectedPairId` | 滚动/导航的瞬时守卫，不构成工作流 | — |
| `ReadingView` | `giPending` | 两键组合（g → i），500ms 内有效；目前只有这一组 | — |

## 5. 已知遗留与后续建议

这些是审计中发现的隐式状态，但改动会触及数据模型或滚动语义，本轮刻意没有动，避免破坏现有行为。

1. **阅读进度按像素估算**
   `setReadingProgress(chapterId, Math.floor(scrollTop / 100))` 假设每句约 100px；恢复时又用 `savedIndex * 100`。句子高度可变时，进度和恢复位置都不精确。
   建议：保存「视口顶部所在的 pair id」，恢复时滚动到该元素。这会把进度从「像素序号」改成「语义位置」，是一次独立的数据模型升级。

2. **`gi` 组合键**
   当前 `giPending` + `setTimeout` 是局部的两键序列。如果以后增加更多组合键，可以把序列匹配器放进 `src/lib/keyboard.ts`，让「等待第二个键」也成为显式状态。

3. **文本选择浮层**
   `SelectionPopover` 的显示由 `selection !== null` 决定，状态在 `useTextSelection` 内。它目前只有「有选中/无选中」两态，保留 hook 更直接；如果以后加入「书签编辑」「高亮调整」等子流程，再升级为 machine。

4. **跨组件一次性命令**
   `scrollToBookmarkId` 目前通过 store 从 `BookmarkList` 传给 `ReadingView`。已从持久化中排除，但仍然是「状态里放命令」。如果以后出现更多这类命令（打开设置到某个 tab、滚动到某句、聚焦某个输入框），建议换成一个小型事件总线或 machine 事件，而不是继续往 store 加字段。

5. **设置抽屉的 tab 与滚动位置**
   tab 是纯枚举；如果以后需要在关闭后恢复上次 tab，应该放进 `useUIStore` 而不是 machine。

## 6. 新增状态机的约定

1. 在 `src/machines/<domain>.ts` 用 `createMachine` 定义 `State` / `Event` 联合类型。
2. `transition` 必须是纯函数：不读 DOM、不发请求、不写 store。
3. 异步操作把 `token` 或 `requestId` 放进事件；过期事件在 transition 里直接返回原状态。
4. 组件用 `useMachine(machine, { debugId, debug: import.meta.env.DEV })`。
5. 在 `tests/machines.test.ts` 覆盖：正常路径、重复事件、过期 token、非法起点。
6. 给根节点或关键控件加 `data-<domain>-state={state.status}`。
7. 在本文第 3 节补一行说明。

## 7. 验证

```bash
# 类型检查
node node_modules/typescript/bin/tsc -b --pretty false

# 状态机单元测试（18 个）
node --import tsx --test tests/machines.test.ts

# 生产构建
node node_modules/vite/bin/vite.js build
```

本轮结果：

- `tsc -b` 通过，无输出。
- 18/18 测试通过。
- Vite 生产构建通过（108 modules，`dist/assets/index-*.js` 454.59 kB）。
- 浏览器验证（1440×900，Vite dev）：
  - 阅读器：`reading → selected → composing`，`gi` 聚焦输入框，Esc 先 blur（保持面板）再关闭。
  - 设置：`data-settings-tab="voice"`；服务端未启动时 `data-server-stats-state="error"`，文案为「服务端缓存：读取失败（HTTP 500）」。
  - TTS：服务端未启动时 `data-tts-state="error"`，按钮标题为「重试播放」。
  - 书架：`data-rename-state="viewing"`。
  - 键盘：`r` 不再切换主题；`?` 打开/关闭帮助；设置抽屉 Esc 关闭。
