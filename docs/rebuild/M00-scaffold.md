# M0 · 从零构筑：双进程开发环境与项目骨架

> 目标：从一个**空目录**开始，搭出「前端 Vite + 后端 Hono」双进程骨架。这一步是后面所有里程碑的地基。
> 关联课程：L02（环境与目录导览）、L03（工具链速查）。
> 前置：Node ≥ 22、pnpm 已安装。开始前确认 `node -v` ≥ 22。

## 构筑总览（本里程碑结束时的项目结构）

```
baku-yomi/
├── package.json          # 脚本与依赖
├── vite.config.ts        # 前端构建 + /api 代理
├── tsconfig.json         # 组合两个子项目
├── tsconfig.app.json     # src/ 的类型检查
├── tsconfig.node.json    # 配置文件的类型检查
├── eslint.config.js      # lint 规则
├── index.html            # 入口 HTML
├── server/
│   └── index.ts          # Hono 后端 + /health
└── src/
    ├── main.tsx          # React 挂载点
    ├── App.tsx           # 根组件
    ├── index.css         # 全局样式（Tailwind 入口）
    └── components/layout/
        └── MainLayout.tsx # 布局外壳
```

> 说明：真实项目里 `src/` 还有 hooks/stores/lib/theme/types 等目录，M1 之后逐步长出。**本里程碑只建必要的**，不要一次建一堆空目录——那是假整洁。

---

## Step 1 · 初始化目录与 package.json

```bash
mkdir baku-yomi && cd baku-yomi
pnpm init   # 一路回车，生成最小 package.json
```

在 package.json 里填入最终要用的字段（`type: "module"` 让 Node 用 ESM 解释文件，项目所有 TS 都走 ESM）：

```json
{
  "name": "baku-yomi",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"pnpm dev:client\" \"pnpm dev:server\"",
    "dev:client": "vite",
    "dev:server": "node --env-file-if-exists=.env --watch --import tsx server/index.ts",
    "build": "tsc -b && vite build",
    "start": "NODE_ENV=production node --env-file-if-exists=.env --import tsx server/index.ts"
  }
}
```

**逐行讲解：**
- `"type": "module"`——整个项目按 ESM 处理。现代 Node 22 对 ESM 支持完善，Vite 也默认 ESM。
- `dev`——用 `concurrently` 并行跑两个进程。前端和后端**是两个独立进程**，这是本项目最基础的架构事实。
- `dev:server`——`node` 直跑 TS 的完整链路：
  - `--env-file-if-exists=.env`：自动加载 .env 文件，**不存在也不报错**（`--env-file` 的旧版会因缺文件崩溃，这个标志是 Node 22 的改进）
  - `--watch`：监视文件变化自动重启（相当于 nodemon，内置）
  - `--import tsx`：运行时钩子，让 node 用 esbuild 转译 TS（比 tsc 快一个数量级）
- `build`——`tsc -b`（build 模式，按 tsconfig references 依次类型检查）+ `vite build`（打包产物到 dist/）

**验证：** `pnpm install` 暂时还跑不了（依赖没装），先继续。

---

## Step 2 · 安装依赖

```bash
# 运行时依赖（前端 + 后端）
pnpm add react react-dom hono @hono/node-server tsx zustand

# 开发依赖
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  concurrently eslint @eslint/js typescript-eslint globals \
  eslint-plugin-react-hooks eslint-plugin-react-refresh @types/node
```

**讲解：**
- `hono` + `@hono/node-server`：Hono 是 Web 标准框架（`Request`/`Response`），`@hono/node-server` 把它跑在 Node 上。
- `tsx`：既是 dev 时跑 TS 的钩子，也是生产 `pnpm start` 的转译器（本项目不编译后端，靠 tsx 直跑）。
- `zustand`：状态管理，M3 才真正用上，现在装好。
- Tailwind 4 依赖放 M10（主题/样式里程碑）装，避免现在引入太多变量。

> 真实仓库的依赖比这多（AI SDK、EPUB 解析器等），**每个里程碑只装当下需要的**，这是「增量开发」的核心习惯：依赖跟着功能走。

---

## Step 3 · vite.config.ts：端口与代理

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3003",
    },
  },
});
```

**逐行讲解：**
- `port: 5174`——Vite 默认 5173，本项目固定 5174（README 和文档都按这个端口写的）。
- `proxy`——**开发时前端页面在 5174，后端 API 在 3003，跨端口就是跨域**。Vite 把浏览器发往 `/api/*` 的请求原样转发到 3003，浏览器感知不到（它只看到同源的 5174）。这就是为什么开发时不需要 CORS 配置。

**验证（等 Step 8 完成后）：** 浏览器访问 `http://localhost:5174/api/health` 应返回 JSON——请求是从 5174 转发到 3003 的。

---

## Step 4 · 三份 tsconfig：为什么是三个

**根 `tsconfig.json`（不检查任何代码，只做组合）：**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**`tsconfig.app.json`（管 `src/` 前端代码）：**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

**`tsconfig.node.json`（管配置文件）：**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

**关键设计讲解（面试常问）：**
- **为什么要拆三个？** `src/` 跑在浏览器（lib 要 DOM），`vite.config.ts` 跑在 Node（types 要 `node`）。两者的 `lib` 和 `types` 冲突，拆开各管各的，`tsc -b` 按 references 顺序各自检查。
- **app 版 vs node 版的差异就三处**：`tsBuildInfoFile`（缓存文件不冲突）、`lib`（DOM vs ES2023）、`types`（`vite/client` vs `node`）。
- `noEmit: true`——只做类型检查不产出 JS（转译交给 Vite/esbuild/tsx）。
- `verbatimModuleSyntax: true`——强制 `import type` 写法：只导入类型时必须写 `import type { X }`，否则报错。这个约束让代码更清晰。
- `moduleResolution: "bundler"`——让 TS 理解 Vite 的解析规则（`.ts` 扩展名导入等）。
- `erasableSyntaxOnly: true`——禁止 enum/namespace 等**运行时残留**语法（TS 5.8+ 新选项，保证代码可被 esbuild 直接擦除类型）。

**验证：** `npx tsc -b` 应无报错退出（此时 src 还是空的，`include: ["src"]` 空目录不报错）。

---

## Step 5 · eslint.config.js：flat config

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
```

**讲解：** ESLint 9 的 flat config 是纯数组结构；`extends` 现在只是数组展开（不是继承）。react-hooks 的 flat 规则集会在你违反 Hooks 规则（如条件调用）时直接报错——这是 React 项目的安全网。注意 `globals.browser`——`src/` 里有 `window`/`document` 不会被报 undefined。

---

## Step 6 · index.html

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Baku-yomi - 双语回译练习</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**讲解：** `lang="ja"` 不是笔误——产品面向日语阅读，声明语言对屏幕阅读器和字体渲染有意义。`<div id="root">` 是 React 挂载点，`<script type="module">` 走 Vite 的模块入口。（真实项目还挂了 Noto JP 字体和一段兼容脚本，M10 主题里程碑再补。）

---

## Step 7 · 后端骨架：server/index.ts

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3003);
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
```

**逐行讲解：**
- `new Hono()`——创建一个 Web 标准应用对象。Hono 的核心是 `app.fetch(request)` 这个函数：它接收 `Request` 返回 `Response`，**不绑定任何运行时**（Node/Bun/Cloudflare Workers 都能跑）。
- `c.json(...)`——快捷返回 JSON Response。
- `serve({ fetch: app.fetch, port })`——`@hono/node-server` 把 `app.fetch` 转成 Node 的 HTTP server。
- `process.env.PORT ?? 3003`——端口可配，默认 3003。

**验证：** `pnpm dev:server`（此时没装 concurrently 的完整脚本也能单跑）→ 浏览器开 `http://localhost:3003/health` 应显示 `{"status":"ok"}`。改一行代码（比如加个日志）→ 进程自动重启（`--watch` 生效）。

---

## Step 8 · 前端壳：main.tsx + App.tsx + MainLayout

**`src/main.tsx`**（React 挂载点）：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**讲解：** `createRoot(...).render(...)` 是 React 19 的挂载方式（旧 `ReactDOM.render` 已废弃）。`StrictMode` 开发期会双执行 effect，帮你提前暴露副作用 bug。`document.getElementById('root')!` 的非空断言——HTML 里我们写了这个节点，TS 不知道，`!` 是告诉它「相信我」。

**`src/App.tsx`**（根组件，本阶段只渲染布局壳）：

```tsx
import { MainLayout } from './components/layout/MainLayout';

export default function App() {
  return (
    <MainLayout>
      <div>占位内容：书籍在这里出现（M1 开始）</div>
    </MainLayout>
  );
}
```

**`src/components/layout/MainLayout.tsx`**（布局外壳）：

```tsx
export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen">
      <div className="app-frame">
        <main>{children}</main>
      </div>
    </div>
  );
}
```

**讲解：**
- 布局壳用 `children` 插槽接收内容——`MainLayout` 只负责骨架（以后加侧栏、顶栏都在这层），内容由调用方传入。这是 React 组合的基本模式。
- 最终版 MainLayout 还有 TopBar/Sidebar 和 `useUIStore` 的视图切换——**M9 再加**，现在别提前建。

**`src/index.css`**（全局样式，最小版）：

```css
:root {
  font-family: system-ui, -apple-system, sans-serif;
}

body {
  margin: 0;
}
```

> 真实项目的 index.css 有 28KB（主题变量 + 全部组件样式），M10 主题里程碑会逐步长出来。现在保持最小。

**验证：** `pnpm dev` → 浏览器 5174 显示「占位内容」。此时再开 `http://localhost:5174/api/health`——**从 5174 端口**拿到 JSON，说明代理生效。到此双进程链路全通。

---

## Step 9 · git 初始化

```bash
git init
```

`.gitignore`（最小版）：

```gitignore
node_modules/
dist/
.env
.env.local
*.epub
```

**讲解：** `*.epub` 不是随便加的——这是电子书项目，导入的书籍文件不该进仓库（真实提交 a74b141 就是加这个的）。

---

## 收尾验收清单

- [ ] `pnpm dev` 一条命令同时启动前端（5174）与后端（3003）
- [ ] 5174 页面渲染占位内容，无控制台报错
- [ ] `http://localhost:5174/api/health` 返回 `{"status":"ok"}`（代理生效）
- [ ] 改后端代码自动重启（--watch 生效）
- [ ] `pnpm build`（`tsc -b && vite build`）通过
- [ ] 能讲出：为什么前后端各要一份 tsconfig / 为什么 dev 不需要 CORS / `node --import tsx` 在干什么

## 与最终代码的差异复盘

1. `vite.config.ts`——最终版多了 `@tailwindcss/vite` 插件（M10 加）
2. `src/main.tsx`——最终版包了 `ThemeProvider`（M10 加）；`App.tsx` 最终版按 `uiSlice` 切换视图、渲染 SettingsModal/WelcomeGuide（M3/M5/M12 逐步加）
3. `MainLayout`——最终版有 TopBar、Sidebar、`app-workspace` 布局与主题色 `var(--text)`（M9/M10 加）
4. `server/index.ts`——最终版有 CORS 处理、`/api` 子路由挂载、生产静态托管（M4/M11 加）
5. `index.html`——最终版挂 Noto JP 字体 + 兼容脚本（M10 加）

**这个「留白清单」很重要**：每个里程碑结束后对照一次，你就清楚每块代码是哪个里程碑长出来的——这正是面试讲「项目怎么演进」的素材。

## 设计注记（历史弯路）

- 真实项目第一个提交就是 3000+ 行成品，**没有**这一步——AI 一步生成，所以也没有「先跑通最小骨架再增量」的过程。我们自己复刻必须补上这一课：**先让最小的东西跑起来，再长功能**。
- 真实 dev 脚本是后来改的（commit `219d22c`）：最初只有 `vite` 单进程，为了给 AI 接口用才加了 `concurrently` + 后端进程。这个改动说明：**脚本是跟着功能需求长的**，一开始不必设计完美。
- `tsx` 的选择：不用 ts-node（配置多、慢）不用 tsc 编译（多一步构建）。`node --import tsx` 零配置直跑——面试被问「Node 怎么跑 TS」就讲这条链路。

## 下一步

进入 [M1 · EPUB 导入与解析管线](./M01-epub-parser.md)——第一个核心功能：让一本书真正进到应用里。
