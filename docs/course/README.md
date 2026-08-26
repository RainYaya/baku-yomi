# baku-yomi 全栈课程 · 30 课详细内容

> 配套大纲：[course-outline.md](../course-outline.md)（进度表、难度矩阵、每课节奏建议）。
> 学习顺序严格按编号递增；阶段 2 与阶段 4 可在完成阶段 0-1 后并行。

## 目录

### 阶段 0 · 全景与环境搭建
- [第 1 课 · 项目全景](./L01-project-overview.md)
- [第 2 课 · 环境搭建与代码库导览](./L02-setup-tour.md)
- [第 3 课 · 工具链速览：Vite + TS + ESM](./L03-toolchain.md)

### 阶段 1 · React 与状态管理基础
- [第 4 课 · React 19 核心](./L04-react-basics.md)
- [第 5 课 · Hooks 体系与自定义 Hook](./L05-hooks.md)
- [第 6 课 · Zustand 入门](./L06-zustand-intro.md)
- [第 7 课 · slice 模式与 persist 持久化](./L07-slices-persist.md)
- [第 8 课 · Tailwind CSS 4 与主题体系](./L08-theming-tailwind.md)
- [第 9 课 · 组件分层实践](./L09-components.md)

### 阶段 2 · EPUB 解析管线（⭐ 核心）
- [第 10 课 · EPUB 格式原理](./L10-epub-format.md)
- [第 11 课 · 解析主流程 parseEpubFile](./L11-parser-entry.md)
- [第 12 课 · 句段提取 sentenceSplitter](./L12-sentence-splitter.md)
- [第 13 课 · ruby 注音与 HTML 净化（安全专题）](./L13-ruby-sanitize.md)
- [第 14 课 · 语言检测 languageDetector](./L14-language-detect.md)
- [第 15 课 · 配对算法 pairBuilder 与沉浸式翻译兼容](./L15-pair-builder.md)

### 阶段 3 · 阅读器 UI 实战
- [第 16 课 · 阅读主界面 ReadingView](./L16-reading-view.md)
- [第 17 课 · 练习面板 PracticePanel 与结果展示](./L17-practice-panel.md)
- [第 18 课 · 书签系统](./L18-bookmarks.md)
- [第 19 课 · 键盘交互体系](./L19-keyboard.md)

### 阶段 4 · 后端与 AI（⭐ 核心）
- [第 20 课 · Hono 框架入门](./L20-hono-intro.md)
- [第 21 课 · 服务入口精读 server/index.ts](./L21-server-entry.md)
- [第 22 课 · Vercel AI SDK](./L22-ai-sdk.md)
- [第 23 课 · 工厂模式与 BYOK 架构](./L23-provider-byok.md)
- [第 24 课 · Prompt 工程实战](./L24-prompt-engineering.md)
- [第 25 课 · 限流与可靠性](./L25-rate-limiting.md)

### 阶段 5 · TTS 语音系统
- [第 26 课 · TTS 原理与双引擎对比](./L26-tts-engines.md)
- [第 27 课 · 服务端缓存设计](./L27-server-cache.md)
- [第 28 课 · 客户端音频管理与预取](./L28-client-audio.md)

### 阶段 6 · 部署与毕业项目
- [第 29 课 · Docker 化与自托管](./L29-docker-deploy.md)
- [第 30 课 · 毕业项目：结构化输出改造](./L30-capstone.md)

## 配套资料

| 资料 | 内容 | 适用场景 |
|---|---|---|
| [面试题库](./interview-bank.md) | 按阶段分组的 100 题（概念 / 代码追踪 / 批判性思考三类，折叠答案） | 面试前系统刷题 |
| [综合实战练习集](./exercises.md) | 20 个由易到难的项目改造任务，含需求、验收标准、提示 | 课程作业之外积累动手成果 |
| [技术速查表](./cheatsheet.md) | 架构图、流程链、环境变量、API 端点、快捷键、高频命令一页浓缩 | 面试前一天冲刺复习 |

## 每课固定结构

学习目标 → 前置检查 → 关键文件 → 正文（概念讲解 / 代码走读 / 图示 / 边学边练检查点）→ 实操作业（基础 / 进阶 / 挑战三层 + 验收标准）→ 本课与面试 → 常见坑 → 自测题（折叠答案）

---
*生成于 2026-08-26，内容基于当时代码库实际走读。*
