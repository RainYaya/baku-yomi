# UI 重构 Playbook

> 从零重做 UI，但不破坏业务逻辑的一套可复刻流程。
>
> 适用于 Web / 桌面 / 内部工具 / 设计系统。以 baku-yomi 的日语阅读器重构为完整案例。

---

## 0. 这份文档解决什么问题

大多数 UI 重构失败，不是因为不会写 CSS，而是因为：

1. 把“视觉语言”和“产品逻辑”一起推翻了；
2. 没有先把“不能动的东西”写下来；
3. 用文字讨论审美，而不是用画板；
4. 没有把“喜欢”冻结成规格；
5. 没有证据就宣布完成。

这份 playbook 的核心主张：

> **产品逻辑是不可变契约，视觉语言是可替换皮肤；审美用画板决定，实施用切片推进，完成用证据证明。**

---

## 1. 十条原则

1. **产品逻辑 ≠ 视觉语言。** 视觉可以从零，逻辑必须保留。
2. **先审计，再设计。** 读代码，不靠记忆。
3. **先评估，再画板。** 先把问题命名，再决定长什么样。
4. **参考要给颗粒度。** 说清楚参考它的什么，不参考什么。
5. **反参考和正参考一样重要。** “不要什么”往往比“要什么”更有效。
6. **2–3 个方向，不要 10 个。** 选择太多等于没有选择。
7. **选定即冻结。** 冻结之后，所有实现都要能 diff 它。
8. **垂直切片，不做大爆炸。** 每片可运行、可验证、可回滚。
9. **证据驱动。** build、test、截图、DOM 断言，不靠“看起来对了”。
10. **授权要明确，自主要有清单。** “你自己搞”不等于“随便搞”。

---

## 2. 工具链

### 2.1 最小工具链

| 层 | 作用 | 推荐工具 | 替代 |
|---|---|---|---|
| 方向 | 把审美变成可比较的画板 | Ryugi（brainstorming → interface-craft → artifacts） | Figma / 手写 HTML |
| 评估 | 把问题命名、打分、给证据 | Impeccable（critique + audit） | 人工 heuristic review |
| 修正 | 给出去 AI 味的顺序 | unslop | 设计系统 checklist |
| 验证 | 真实浏览器截图 / DOM | ego-browser / bsk / Playwright | 手动截图 |
| 工程 | build / test / 断言 | 项目现有命令 | — |

### 2.2 Ryugi

Ryugi 不是一个 skill，而是一套工作流：

- `ryugi:brainstorming`：先问“为什么、给谁、成功是什么”；
- `ryugi:interface-craft`：五个镜头——Product、Character、World、Moments、Signature；
- `ryugi:artifacts`：生成 artboard，把方向变成可看的页面；
- `artifact-design`：约束画板本身的排版、主题、响应式；
- `ryugi:executing-specs` / `verifying-ui` / `test-driven-development`：实施和验收的轨道。

安装方式（按你的环境填写插件名）：

```text
/plugin marketplace add Innei/ryugi
/reload-plugins
/plugin install <plugin-name>
```

产出目录：

```text
.ryugi/artifacts/artboard/<id>/
  canvas.json
  pages/<group>/<board>.html
```

关键理解：**artboard 是“可比较的视觉产物”，不是“设计稿”。**

### 2.3 Impeccable

Impeccable 负责“评估”，它跑两个隔离评估：

- **Assessment A**：live DOM、computed styles、交互测试、源码；
- **Assessment B**：确定性检测器 + 浏览器证据（console、network、对比度、触控目标、reduced motion）。

安装：

```bash
npx --yes impeccable@latest install --providers=claude --scope=project --no-hooks --yes
```

产出：

```text
.impeccable/critique/<date>-<project>.md
```

读报告的顺序：

1. 先看 verdict 和 score；
2. 再看“问题命名”；
3. 最后看证据和优先级。

baku-yomi 的关键结论：

> “The workbench bones are specific; the shell is not.”
>
> “Every selection opens a panel, and two panels compete with the text. Reading is the primary act, but the app treats it as a side effect.”

评分：Design Health **21/40**，Technical audit **11/20**。

### 2.4 unslop

unslop 不负责生成方向，它负责防止随机美化。修正顺序：

```text
spacing → color → icons → copy → type → layout → details → visuals → motion
```

安装方式（以实际仓库为准）：

```bash
git clone --depth 1 https://github.com/heydamir/unslop /tmp/unslop-src
mkdir -p .claude/skills
cp -r /tmp/unslop-src/skills/unslop .claude/skills/
```

### 2.5 浏览器验证

- **ego-browser**：打开 artboard、截图、检查渲染；
- **bsk（browser-skill）**：真实应用会话、DOM 读取、截图、交互验证。

原则：

- 每个交互后重新 `sync`，不要复用失效的 ref；
- 截图参数用 `--out`，不是 `--path`；
- 状态类 bug 先整页刷新，再判断是不是 HMR 假象。

### 2.6 工具链模板

```markdown
## 0. 工具链
- 方向 / 画板：<Ryugi / Figma / 其他>
- 评估 / 审计：<Impeccable / 其他>
- 修正顺序：<unslop / 其他>
- 浏览器验证：<ego-browser / bsk / Playwright>
- 代码 / 测试：<build / test / DOM 断言>
```

---

## 3. 流程总览

| Phase | 目标 | 产出 | 谁决定 |
|---|---|---|---|
| 0 | 写 brief | 一次性 brief | 用户 |
| 1 | 审计产品逻辑 | 不能动 / 可以换清单 | 用户 + 代码 |
| 2 | 设计评估 | critique / audit 报告 | 我 |
| 3 | 参考与反参考 | 参考清单 / 组件评估卡 | 用户 + 我 |
| 4 | 视觉方向 | 2–3 个 artboard | 我出，用户选 |
| 5 | 选择与冻结 | 唯一视觉源 + tokens + 契约 | 用户选，我冻结 |
| 6 | 实施 | 可运行的垂直切片 | 我 |
| 7 | 验证 | build / test / 截图 / DOM | 我 |
| 8 | 反馈 | 验收项 + 修复 | 用户提，我改 |
| 9 | 收尾 | 清理 + 证据 + 部署建议 | 我 |

---

## 4. Phase 0：写 brief

### 4.1 一次性 brief 模板

```markdown
# <项目名> UI 重构 brief

## 0. 工具链
- 方向 / 画板：
- 评估 / 审计：
- 修正顺序：
- 浏览器验证：
- 代码 / 测试：

## 1. 产品逻辑（不可变）
- 产品是什么：
- 谁在用：
- 核心任务（用户最常做的一件事）：
- 产品的“主行为”是什么：
- 哪些行为是“可选辅助”，不能喧宾夺主：
- 现有交互里哪些是好的、必须保留：
- 业务功能 / 数据结构 / 接口：
- 未提交改动：
- 不能改的交互：
- 不能丢的状态：

## 2. 视觉语言（可推翻）
- 这次是否从零：
- 旧设计里哪些必须丢掉：
- 绝对不要的（反参考）：
- 想要的 3 个具体形容词：
- 主题：<亮 / 暗 / 双主题>
- 密度：<紧凑 / 舒展>
- 字体气质：
- 动效：<克制 / 明显 / 无>

## 3. 参考与反参考
- <项目 A>：参考 <结构/排版/动效/工程>，不参考 <...>，采用方式 <依赖/复制/参考/不采用>
- <项目 B>：参考 <...>，不参考 <...>，采用方式 <...>
- 反参考：<旧设计 / 某个风格 / 某个组件库>

## 4. 交互政策
- 默认态：
- 进入方式：
- 导航策略：
- 主行为 vs 辅助行为：
- 选择 / 高亮：
- 播放 / 媒体：
- 键盘 / 焦点 / Escape：
- 加载 / 错误 / 空状态：
- 窄屏：

## 5. 范围与优先级
- 核心 surface（必须做好）：
- 次要 surface（可以后做）：
- 这次做：
- 这次不做：
- 以后再说：

## 6. 交付与验收
- 必须通过的验收项：
- 必须验证的宽度 / 主题：
- 性能 / 可访问性要求：
- 构建 / 测试命令：
- 不能做的事（commit / push / 改业务）：

## 7. 决策权
- 你决定：目标、范围、审美方向、最终选择、验收
- 我决定：技术方案、CSS 分层、状态机、组件边界、验证方法、bug 修复
- 只有影响方向或违反硬约束时才问你

## 8. 工作流
1. 审计代码，输出“不能动 / 可以换”清单
2. 跑一次设计评估（critique / audit），把问题命名
3. 给 2–3 个可视化方向（画板），覆盖核心 surface、两种宽度、两套主题
4. 我选定后，冻结为唯一视觉源
5. 按垂直切片实施
6. 每片用真实浏览器验证
7. 最后 build / test + 清理 + 证据

## 9. 禁区
- 不要做成 <错误的产品形态>：
- 不要用 <反参考风格>：
- 不要让 <辅助控件> 遮挡 <主内容>：
- 不要擅自 commit / push。
```

### 4.2 填写说明

- **产品逻辑**：一定要写“主行为”和“可选辅助”。这是最容易出错的地方。
- **视觉语言**：写“可推翻”和“反参考”。不要只写“高级 / 简洁 / 现代”。
- **参考**：每个链接写“参考什么 / 不参考什么 / 采用方式”。
- **交互政策**：写“默认态、进入方式、主行为 vs 辅助行为、选择、媒体、键盘、错误、窄屏”。
- **决策权**：写“谁决定什么”。不写，就会每一步都问。
- **禁区**：写“不要做成什么”。这比“要做什么”更能防止跑偏。

### 4.3 常见错误

- 只写“想要高级 / 简洁 / 现代”——这些词没有信息量。
- 只写“参考 X”——没有颗粒度，容易抄错层。
- 不写“不要什么”——反参考是最有效的约束。
- 不写“主行为 vs 辅助行为”——容易把阅读 app 做成刷题 app。
- 不写“谁决定什么”——每一步都要问，沟通成本高。
- 不写“什么算完成”——最后只能靠感觉验收。

---

## 5. Phase 1：审计产品逻辑

### 5.1 业务契约

先列一张“不能动 / 可以换”的表：

| 不能动 | 可以换 |
|---|---|
| 业务功能 | 布局 |
| 数据结构 / 本地存储 | 导航 |
| 接口 / 路由 | 卡片 / 弹窗 |
| 未提交改动 | 主题 / 字体 / 间距 |
| 不能改的交互 | 动效 |
| 不能丢的状态 | 组件实现 |

### 5.2 交互政策

这是 UI 重构里最容易被忽略、但最影响体验的一层：

- 默认态是什么？
- 用户最常做的一件事是什么？
- 哪些是主行为，哪些是辅助？
- 哪些操作会自动打开面板？会不会喧宾夺主？
- 选择、播放、导航、Escape 的层级是什么？
- 错误、空状态、加载状态怎么呈现？

baku-yomi 的教训：

> 第一版把“选择句子”做成了“自动打开练习面板”，结果阅读被面板挤成了副作用。用户的原话是：“这个会不会有点完全的刻意练习了呀？……我以前至少不想做的时候还可以阅读。”

### 5.3 状态机

找出隐式状态：

- surface：reading / selected / inline / desk；
- phase：idle / analyzing / reviewed / failed；
- requestId：异步请求门控；
- selection：当前句 / 当前片段；
- TTS：idle / playing / paused；
- theme：paper / night。

用 discriminated union + transition 表，让 UI、键盘、异步请求共用一套状态。

### 5.4 范围与优先级

- **核心 surface**：必须做好。
- **次要 surface**：可以后做。
- **不做**：明确写出来。

baku-yomi 的优先级：

- 核心：阅读器、S1 内联卡、S2 工作台、讲解；
- 次要：书架、导航、设置；
- 不做：账号 / 同步、移动端原生、部署改造。

### 5.5 输出物

- “不能动 / 可以换”表；
- 交互政策清单；
- 状态机图；
- 范围与优先级。

---

## 6. Phase 2：设计评估

### 6.1 为什么要先评估

- 没有评估，你会把“换皮”当成“重构”。
- 评估能把“感觉不对”变成“命名的问题”。
- 评估能给证据：DOM、computed styles、network、contrast、touch targets。

### 6.2 Impeccable 的双评估

- **Assessment A**：live DOM、computed styles、交互测试、源码；
- **Assessment B**：确定性检测器 + 浏览器证据。

读报告的顺序：

1. verdict 和 score；
2. 问题命名；
3. 证据和优先级。

### 6.3 baku-yomi 案例

- Design Health **21/40**，Technical audit **11/20**；
- “The workbench bones are specific; the shell is not.”；
- “Every selection opens a panel, and two panels compete with the text.”；
- `/api/analyze` 跑了 **97,257 ms**，前端没有超时；
- 152px 顶栏、296px 侧栏、六个主题点、全局等宽正文；
- 导入是 `label` 包隐藏 input，设置没有 `role="dialog"` / focus trap；
- 主题点 10×10、雪花主题对比度不达标；
- 两个 markdown renderer、`R` 键同时是雨主题和自动朗读。

这些结论直接决定了后面的交互政策：**阅读优先，练习可选；选择只高亮，不自动开面板。**

---

## 7. Phase 3：参考与反参考

### 7.1 参考的颗粒度

每个参考都要写清楚：

- 参考它的 **结构 / 排版 / 动效 / 工程 / 气质** 中的哪一层；
- 不参考它的什么；
- 采用方式：**直接依赖 / 复制单个组件 / 只做参考 / 不采用**。

### 7.2 组件评估卡

```markdown
## 组件 / 库评估卡
- 名称 / 链接：
- 它是什么：
- 技术栈匹配：
- 视觉匹配（属于哪个世界）：
- 采用成本：
- 采用方式：直接依赖 / 复制单个组件 / 只做参考 / 不采用
- 风险（字体、排版、可访问性、包体积、维护）：
- 结论：
```

### 7.3 案例

**Animal Island UI**（`https://guokaigdg.github.io/animal-island-ui/#/skill`）

- 定位：MIT、cozy / kawaii 风格的 React 组件库；
- 参考价值：个性化产品可以有自己的世界，不必像主流产品；
- 结论：**不采用**。卡通语言和阅读 / 回译的气质不匹配。

**Looseleaf**（`https://kevintngo.github.io/looseleaf/`）

- 定位：“shadcn/ui, drawn by hand”；
- 技术栈：React 19 + Tailwind v4 + Radix，123 个组件，MIT；
- 视觉：纸面、手绘线、Kevin Sans、贴纸 / 印章；
- 结论：**只做参考，不直接装 123 个组件**。它成为 A · 活页笔记方向的参考；风险是 Kevin Sans 和日文正文的搭配。

**mygo**（`https://mygo.egoist.dev/`）

- 参考价值：桌面外壳、导航、窗口 chrome；
- 结论：**只做参考，不迁移**。

**unslop**（`https://github.com/heydamir/unslop`）

- 参考价值：审计顺序；
- 结论：**只参考方法，不参考具体样式**。

### 7.4 反参考

反参考要具体：

- 旧设计：天气 / 雪 / 冷静图书馆 / 等宽正文；
- 风格：玻璃拟态、紫色渐变、发光、卡通；
- 产品形态：刷题 app、强制下一句、队列。

---

## 8. Phase 4：视觉方向

### 8.1 画板规则

- 2–3 个方向，不要 10 个；
- 每个方向覆盖核心 surface；
- 桌面 + 窄屏；
- 两套主题（如果产品需要）；
- 画板是 HTML，不是图片；可交互、可检查；
- 画板文件结构：`canvas.json` + `pages/<group>/<board>.html`。

### 8.2 方向的组织

- **第一轮：视觉世界。** A / B / C，比气质、材质、排版；
- **第二轮：交互结构。** S1 / S2，比“练习怎么进入阅读流”；
- 不要在第一轮就纠结交互细节；也不要在第二轮重新选视觉世界。

baku-yomi 的画板：

```text
.ryugi/artifacts/artboard/ui-v2-directions/
  canvas.json
  pages/directions/dir-a.html
  pages/directions/dir-b.html
  pages/directions/dir-c.html
  pages/structures/s1-inline.html
  pages/structures/s2-desk.html
```

`canvas.json` 里记录了两组：

- `q1`：A / C 保留，B 排除；
- `q2`：S1 / S2 都保留；
- `focus: q2`。

### 8.3 画板检查清单

```text
[ ] 五个画板是否正常渲染？
[ ] 文字是否被遮挡？
[ ] 窄屏是否溢出？
[ ] 主题是否都覆盖？
[ ] 交互状态是否可见？
[ ] 画板是否覆盖核心 surface？
```

---

## 9. Phase 5：选择与冻结

### 9.1 决策权

| 事项 | 谁决定 | 默认 |
|---|---|---|
| 产品目标 / 用户 | 用户 | — |
| 业务契约 | 用户 + 代码 | 以代码为准 |
| 视觉方向 | 用户选，我出选项 | 2–3 个画板 |
| 布局 / 组件边界 | 我 | 按画板 |
| CSS 策略 | 我 | 分层迁移 |
| 状态机 / 键盘 | 我 | 显式状态机 |
| 验证方法 | 我 | build / test / 浏览器 |
| 部署 | 用户 | 后置 |

### 9.2 冻结清单

- 选中的画板路径；
- tokens（颜色 / 字号 / 间距 / 圆角 / 阴影）；
- CSS 分层；
- 组件契约；
- 交互契约；
- 非目标。

### 9.3 CSS 分层

```text
index.css（基础 / Tailwind）
  → ui-v2.css（新设计系统）
    → artboard.css（画板组件）
```

- 迁移期共存，旧样式逐步退场；
- 不要一次性删旧 CSS；
- 用 tokens，不要散落颜色；
- 用 `body.paper` / `body.night` 或 `data-theme`。

### 9.4 Q2 案例

Q2 是第二轮的结构画板。冻结之后：

- 所有实现都要能回答“和 Q2 差在哪”；
- 用户说“完全复刻 Q2”时，不要用旧 UI 当参照；
- 如果第一版没复刻完整，先做 diff，再改。

---

## 10. Phase 6：实施

### 10.1 垂直切片

推荐顺序：

```text
主题 / 外壳
  → 主界面
    → 选择 / 高亮
      → 快速态（S1）
        → 深度态（S2）
          → 辅助面板（讲解 / 设置）
            → 导航 / 书架
              → 键盘 / 状态机收口
```

每一片都能单独运行、单独验证。

### 10.2 CSS 分层

- 新 UI 叠在旧样式上，不要大爆炸；
- 用 tokens，不要散落颜色；
- 用 `body.paper` / `body.night` 或 `data-theme`；
- 批量改 CSS 后，验证“被服务的文件”，不要只看源文件。

### 10.3 状态机

- surface + phase + requestId；
- 异步请求用 requestId 门控，旧请求不能覆盖新状态；
- 键盘和 UI 都发事件，不直接改状态。

### 10.4 键盘

- 统一 dispatcher，带优先级；
- IME 保护：输入法组合中不处理；
- 工作台保护：在 desk 里不触发阅读快捷键；
- Escape 层级：面板 → 卡片 → 选择 → 阅读。

### 10.5 选择 / 高亮

- 用 DOM Range 的 `startOffset` / `endOffset`，不要用“从句子开头数”；
- 断言 `sentence.slice(start, end) === selectedText`；
- 选择只高亮；不要自动打开面板；
- **移动端不要只监听 `mouseup` / `touchend`。** 长按选择通常在 `touchend` 之后才提交，拖动选择柄也不触发 `touchend`；用 `document` 的 `selectionchange`（防抖）兜底。
- 点自定义工具条时，原生选区会先折叠；给工具条一个短暂的“保留选区”窗口，否则按钮的 `click` 还没触发，工具条就卸载了。
- iOS 上给正文加 `-webkit-touch-callout: none`，避免原生 callout 和自定义工具条打架。

### 10.6 媒体控件

- 逐句播放可以保留，但控件不能覆盖正文；
- 放在 gutter / 底部进度线 / 固定工具栏；
- 断言 active 句子的 id。

### 10.7 流式内容

- NDJSON / SSE；
- 半截 markdown 要能解析：`###`、`-`、`1.` 单独出现时保证前进；
- 超时、取消、重试；
- 流式时也渲染 markdown，不要显示原始标记。

### 10.8 数据边界

- EPUB metadata 可能是对象 / 数组；入库前归一化；
- 不要等到 UI 再兜底 `[object Object]`；
- 旧数据要有显示 fallback。

---

## 11. Phase 7：验证

### 11.1 build / test

```bash
pnpm build
pnpm test
```

记录输出，不要只说“通过”。

### 11.2 浏览器矩阵

- 桌面：1280×900 / 1440×900；
- 窄屏：400×800 / 1024×768；
- 两套主题；
- 核心路径 + 错误状态 + 空状态。

### 11.3 DOM 断言

```text
[ ] 选择偏移：sentence.slice(start, end) === selectedText
[ ] TTS active id 正确
[ ] scrollTop 真的变化
[ ] score 解析正确
[ ] author fallback 不是 [object Object]
[ ] 流式半截 markdown 不挂
[ ] console 无报错
```

### 11.4 常见 bug 清单

- MarkdownBlock 半截标记死循环；
- scrollHost 挂错元素；
- `[object Object]`；
- 流式显示原始 `###`；
- 移动端选区不出现：只监听 `mouseup` / `touchend`，没有 `selectionchange`；
- 移动端点工具条时选区折叠，工具条先卸载；
- 目录项被长标题挤崩：标题用 `flex: 1; min-width: 0`，右侧计数用 `flex: 0 0 auto; white-space: nowrap`；菜单宽度用 `min()` 约束在容器内；
- 内联卡片吞滚轮：内联面板里的 `overflow-y: auto` + `overscroll-behavior: contain` 即使没有溢出也会截住滚动链，鼠标停在讲解上时阅读列滚不动；内联面板改为 `overflow: visible; overscroll-behavior: auto`，让它跟页面一起滚；
- Docker 运行阶段漏文件；
- HMR 假象；
- Vite 返回空 CSS；
- bsk 控制上下文失效。

---

## 12. Phase 8：反馈与自主执行

### 12.1 把抱怨翻译成验收项

| 用户说 | 翻译成 |
|---|---|
| “不好看” | 具体差异：布局 / 字号 / 间距 / 颜色 / 层级 |
| “挡住文字” | 控件位置约束 + DOM 断言 |
| “偏移” | Range 偏移 + 断言 |
| “还有旧影子” | 范围 + 组件清单 |
| “没复刻” | 对画板做 diff |
| “你决定” | 写进决策权，不要再问 |

### 12.2 自主模式协议

用户说“我睡了，你自己搞”时：

1. 写验收清单；
2. 逐条修；
3. 用证据验证；
4. 清理测试数据；
5. 留下报告：改了什么、验证了什么、还剩什么；
6. 不擅自 commit / push。

没有 `/goal` 工具时，不要追问；把“goal”翻译成清单。

### 12.3 收尾

- build / test；
- 截图；
- 清理；
- 部署建议（可选）；
- 不 commit / push。

---

## 13. 模板库

### 13.1 工作协议

```markdown
- 先读代码，不要先问。
- 先跑评估，不要先画。
- 先给画板，不要先实现。
- 方向只给 2–3 个，不要 10 个。
- 我选定后，不要再改方向；有疑问按默认决策表处理。
- 实现细节你自己定，不要每一步都问。
- 每个 bug 先复现，再修，再用断言证明。
- 不要用“看起来对了”当完成。
- 不要擅自 commit / push。
- 只有影响方向、违反硬约束、或需要我提供外部信息时才停下来问。
```

### 13.2 验收清单

```text
[ ] 业务功能逐项可用
[ ] 核心任务路径最短
[ ] 桌面宽度 + 窄屏都正常
[ ] 所有主题都检查
[ ] 选择 / 高亮精确
[ ] 媒体控件不遮挡正文
[ ] 加载 / 错误 / 空状态完整
[ ] 键盘 / 焦点 / Escape 层级正确
[ ] 控制台无报错
[ ] build 通过
[ ] test 通过
[ ] 测试数据已清理
[ ] 没有擅自 commit / push
```

### 13.3 第一条消息（可直接粘贴）

```text
项目：<项目名>
目标：从 0 重做前端 UI，保留现有业务逻辑、数据结构和交互能力。

产品逻辑（不可变）：
- 产品是什么：
- 核心任务：
- 主行为：
- 可选辅助：
- 现有交互里必须保留的：
- 未提交改动：
- 不能改的交互：

视觉语言（可推翻）：
- 从零 / 部分重做：
- 旧设计里必须丢掉的：
- 绝对不要的：
- 想要的 3 个具体形容词：
- 主题：
- 密度：
- 字体气质：

参考与反参考：
- <链接>：参考 <...>，不参考 <...>，采用方式 <...>
- 反参考：<...>

交互政策：
- 默认态：
- 进入方式：
- 导航：
- 主行为 vs 辅助行为：
- 选择 / 高亮：
- 播放 / 媒体：
- 键盘 / Escape：
- 窄屏：

范围与优先级：
- 核心 surface：
- 次要 surface：
- 不做：

工具链：
- 画板 / 评估 / 修正 / 浏览器验证：

工作流：
1. 审计代码，输出“不能动 / 可以换”清单
2. 跑一次设计评估，把问题命名
3. 给 2–3 个画板，覆盖核心 surface、两种宽度、两套主题
4. 我选定后冻结为唯一视觉源
5. 按垂直切片实施
6. 每片用真实浏览器验证
7. 最后 build / test + 清理 + 证据

验收：
- 必须通过的验收项：
- 必须验证的宽度 / 主题：
- 构建 / 测试命令：

禁区：
- 不要做成 <错误的产品形态>
- 不要用 <反参考风格>
- 不要让 <辅助控件> 遮挡 <主内容>
- 不要擅自 commit / push
```

---

## 14. 完整案例：baku-yomi

### 14.1 时间线

| 时间 | 输入 | 动作 | 结果 |
|---|---|---|---|
| 11/7 | “前端没太优化，书架不像阅读 APP” | 读项目、找参考、做第一版方向 | A+B 被选，C 作为阅读模式 |
| 11/7 | “会不会太刻意练习了？不想练的时候还能阅读” | 调整方向 | 第一版仍偏刷题 |
| 11/7 | “还没有我最开始的版本好” | 停止换皮，转向状态机 | 第一版失败 |
| 11/9 | 状态机 / J/K / mygo / B 站 API | 工程底稿 | 业务契约清晰 |
| 11/10 | 装 Ryugi、Impeccable、unslop；发 looseleaf | 评估 + 画板 | 第一轮 A/B/C，第二轮 S1/S2 |
| 11/10 | “A/C 都可以，B 不考虑” | 收敛双主题 | A/C 保留 |
| 11/10 | “两种都保留” | 收敛两级 | S1/S2 保留 |
| 11/10 | “两级是对的，开搞” | 冻结 Q2，实施 | 新 UI 落地 |
| 11/10 | Q2 没复刻 / TTS / 划词 / 旧影子 | 逐条验收修复 | 质量收敛 |
| 11/10 | “我睡了，你自己搞” | 自主验收清单 | 修复 + 清理 + build/test |
| 11/10 | 部署问题 | 分析 Vercel / Render / ROG Ally | 部署建议 |

### 14.2 工具链

| 工具 | 作用 |
|---|---|
| Ryugi | brainstorming → interface-craft → artifacts |
| Impeccable | critique + audit，两个隔离评估 |
| unslop | 修正顺序 |
| ego-browser / bsk | artboard 截图 / 真实应用验证 |

### 14.3 失败与转折

第一版失败的核心不是视觉，而是交互政策：

- 选择句子 → 自动打开练习面板；
- 两个面板争抢正文空间；
- 阅读被挤成副作用；
- 用户说“做成了刷题的东西”。

Impeccable 把这件事命名了：

> “Every selection opens a panel, and two panels compete with the text. Reading is the primary act, but the app treats it as a side effect.”

最终设计修正了政策：

- 阅读是默认态；
- 选择只高亮；
- `j/k` 只移动选择，不打开面板；
- 练习是可选辅助：S1 内联、S2 工作台；
- TTS 控件移出文字流。

### 14.4 最终结构

- 阅读默认；点书直接进入；阅读态隐藏导航；
- S1 内联随手练；S2 全屏工作台；
- paper / night 双主题；
- TTS 逐句保留，控件在左侧槽，不挡正文；
- 划词精确，高亮 = 选中；
- 状态机 + 键盘 dispatcher。

### 14.5 关键文件

```text
docs/design/ui-v2-interaction.md          # 交互契约
docs/design/ui-refactor-playbook.md       # 本文档
.ryugi/artifacts/artboard/ui-v2-directions/
  canvas.json
  pages/directions/dir-a.html
  pages/directions/dir-b.html
  pages/directions/dir-c.html
  pages/structures/s1-inline.html
  pages/structures/s2-desk.html
.impeccable/critique/2026-11-10-baku-yomi.md
src/ui-v2.css
src/artboard.css
src/machines/
src/lib/keyboard.ts
src/components/reader/InlinePracticeCard.tsx
src/components/reader/PracticeDesk.tsx
src/components/explain/
server/routes/explain.ts
tests/explain.test.ts
```

---

## 15. 反模式

1. **把阅读 app 做成刷题 app。** 主行为被辅助行为挤掉。
2. **让旧 UI 当锚点。** 说了“从零”，结果还是在旧布局上换颜色。
3. **直接装 123 个组件。** 组件库是参考，不是决策。
4. **用文字描述审美。** “高级 / 简洁 / 现代”没有信息量。
5. **没有证据就说完成。** build / test / 截图 / DOM 断言，一个都不能少。
6. **在文字流上叠控件。** 媒体控件、浮层、提示都不能遮挡正文。
7. **用近似字符偏移。** 划词必须用 Range 的精确偏移。
8. **大爆炸重写。** 一次性删旧 CSS、改所有组件，风险不可控。
9. **擅自 commit / push。** 除非用户明确要求。
10. **把“从零”理解成“推翻产品逻辑”。** 视觉可以从零，逻辑必须保留。

---

## 16. 如何适配其他项目

### 16.1 Web app

直接用。重点：响应式、键盘、路由、加载 / 错误状态。

### 16.2 Desktop app

加窗口 chrome、菜单、全局快捷键；画板要覆盖窗口尺寸和系统主题。

### 16.3 Design system

把“方向”换成“组件变体”；把“画板”换成“组件矩阵”；加 tokens 审计。

### 16.4 内部工具

减少主题和动效；加强密度、键盘、错误状态、批量操作。

### 16.5 小项目裁剪版

跳过 Impeccable，保留：

- 一次性 brief；
- 1 个画板；
- 验收清单；
- 证据。

仍然要：产品逻辑、反参考、冻结、证据。

### 16.6 大项目扩展版

加：

- 设计系统审计；
- 可访问性审计；
- 性能预算；
- 跨团队评审；
- 迁移期开关 / 灰度。

---

## 17. 附录

### A. 命令速查

```bash
# Ryugi（按你的环境填写插件名）
/plugin marketplace add Innei/ryugi
/reload-plugins
/plugin install <plugin-name>

# Impeccable
npx --yes impeccable@latest install --providers=claude --scope=project --no-hooks --yes

# unslop
git clone --depth 1 https://github.com/heydamir/unslop /tmp/unslop-src
mkdir -p .claude/skills
cp -r /tmp/unslop-src/skills/unslop .claude/skills/

# artboard
node <ryugi-artifacts>/app/ryugi-artifacts.cjs start --json \
  --project-dir <project> --artifact artboard/<id>
node <ryugi-artifacts>/app/ryugi-artifacts.cjs check --json \
  --project-dir <project> --artifact artboard/<id>

# 构建 / 测试
pnpm build
pnpm test
```

### B. 术语表

| 术语 | 含义 |
|---|---|
| 产品逻辑 | 用户的主行为、数据、交互政策，不可随意推翻 |
| 视觉语言 | 颜色、字体、间距、材质、动效，可替换 |
| 画板 | 可比较的 HTML 视觉产物 |
| 冻结 | 选定方向后，把它作为唯一视觉源 |
| 垂直切片 | 一次做一条完整可运行的路径 |
| 反参考 | 明确不要的风格 / 形态 |
| 组件评估卡 | 评估组件库的 stack / visual / cost / risk |
| 证据驱动 | build / test / 截图 / DOM 断言 |

### C. 参考链接

- Ryugi：`https://github.com/Innei/ryugi`
- Impeccable：`https://github.com/pbakaus/impeccable`
- unslop：`https://github.com/heydamir/unslop`
- Looseleaf：`https://kevintngo.github.io/looseleaf/`
- Animal Island UI：`https://guokaigdg.github.io/animal-island-ui/`
- mygo：`https://mygo.egoist.dev/`
- baku-yomi 交互契约：`docs/design/ui-v2-interaction.md`

---

## 18. 一句话

> **先装好“画板 + 评估 + 修正 + 验证”的工具链；把产品逻辑写成不可变契约，把视觉语言交给 2–3 个画板；选定后冻结，按切片实施，用真实浏览器验收。**
