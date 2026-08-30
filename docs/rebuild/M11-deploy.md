# M11 · 从零构筑：生产部署（单进程托管 + Docker 化）

> 目标：把「前端 Vite :5174 + 后端 Hono :3003」的双进程开发形态，收敛成「一个端口、一个镜像、一条命令」的生产形态。做完这步，`docker compose up -d` 就能把整个应用跑起来，别人只需要 Docker + 一个 API Key。
> 关联课程：L21（服务入口精读）、L29（Docker 化与自托管）。
> 前置：M4-M8 的 server 代码都在（`/api` 路由、TTS）；M10 完成；本机有 Docker Desktop（`docker --version` 能输出版本号）；`pnpm build` 曾经跑通。

## 构筑总览（本里程碑结束时新增/改动的文件）

```
baku-yomi/
├── server/index.ts          # 改动：isProd 分支 —— serveStatic + SPA fallback（CORS 双策略 M4 已有）
├── Dockerfile               # 新增：两阶段构建
├── docker-compose.yml       # 新增：app + voicevox（profile）
├── .dockerignore            # 新增：构建 context 黑名单
├── .env.example             # 新增：配置面契约
└── docs/self-hosting.md     # 新增：给自托管用户的文档
```

**最终差异说明：** 真实仓库里这批东西是一次合入的（commit `b1b0206`：production server、Docker、Microsoft TTS、security），README 和自托管文档在紧接着的 `1d25db3` 同批落地。本里程碑只做**部署骨架**：单进程托管 + 镜像 + compose + 配置面。Microsoft TTS 引擎如果 M8 没做，你现在的 `TTS_DEFAULT_PROVIDER` 只会指向 voicevox——不影响本卡任何一步，验收清单里留意即可。

两个世界的全貌（背下来，全章围绕这张表）：

| | 开发（`pnpm dev`） | 生产（`pnpm start` / Docker） |
|---|---|---|
| 前端由谁服务 | Vite dev server :5174 | Hono serveStatic :3003（同进程） |
| 页面调 `/api/*` | 跨源（5174→3003），需要 CORS | 同源，CORS 流程完全不触发 |
| 后端 CORS 中间件 | `cors()` 放行一切源 | 默认不注册；配了 `CORS_ORIGIN` 才白名单 |
| 静态文件 | 不存在（Vite 即时编译） | `serveStatic({ root: './dist' })` |
| 未匹配路由 | 404（页面根本不在后端上） | SPA fallback 回 `index.html` |
| `NODE_ENV` | 未设置 | `start` 脚本显式设 production |

---

## Step 1 · server/index.ts 生产形态

这是整个部署的枢纽：**一个文件同时托管 API 与前端构建产物**。M4 已经建了 CORS 双策略、`/api` 挂载、限流、providers；本步在其上加入生产态分支。改动后的**完整文件**：

```ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ai from './routes/ai';

const isProd = process.env.NODE_ENV === 'production';

const app = new Hono();

// CORS: restrict to known origin in production, allow all in dev
if (isProd) {
  const allowedOrigin = process.env.CORS_ORIGIN;
  if (allowedOrigin) {
    app.use('/*', cors({ origin: allowedOrigin }));
  }
  // No CORS middleware in prod without explicit origin = same-origin only
} else {
  app.use('/*', cors());
}

app.route('/api', ai);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Production: serve built frontend from dist/
if (isProd) {
  app.use('/*', serveStatic({ root: './dist' }));
  // SPA fallback: serve index.html for any unmatched route
  app.get('/*', serveStatic({ root: './dist', path: 'index.html' }));
}

const port = Number(process.env.PORT ?? 3003);
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
```

**逐段讲解：**

- **`const isProd = process.env.NODE_ENV === 'production'`——全文唯一的环境开关。** 谁设置它？看 package.json 的 start 脚本（M0 已建）：`"start": "NODE_ENV=production node --env-file-if-exists=.env --import tsx server/index.ts"`。`pnpm start` 显式注入 production；`pnpm dev` 不设。把「当前是什么环境」收敛成一个布尔常量，两处分支共用——反面教材是散落的字符串比较，拼错（如 `prod`）会让判断静默失真。
- **CORS 三态（M4 已建，此处复述其与生产的关系）：**
  1. 开发：`cors()` 无参 → `Access-Control-Allow-Origin: *`，5174 随便调 3003；
  2. 生产 + 配了 `CORS_ORIGIN`：只允许指定源（前端单独部署在别的域名时才需要）；
  3. **生产 + 没配（默认）：完全不注册 CORS 中间件** → 其他源的浏览器页面调本站 API 一律被拦；而本站自己同源，根本不走 CORS 流程。**这就是「不配反而最安全」**——默认状态恰好是最严格的白名单（只有自己）。`.env.example` 里 CORS_ORIGIN 注释成「production only」正是这个语义。
- **`app.route('/api', ai)` + `/health` 注册在静态托管之前**——顺序即安全边界：API 先命中，永远不会被 fallback 吞掉。
- **生产分支两行，角色完全不同：**
  - `app.use('/*', serveStatic({ root: './dist' }))`——按请求路径在 `./dist` 里找**真实文件**：`GET /assets/index-a1b2.js` → 返回对应 JS。找不到文件时它**不结束请求**，放行给下一个处理器；
  - `app.get('/*', serveStatic({ root: './dist', path: 'index.html' }))`——普通 GET 路由 + 固定 path：前面没人处理就返回 `index.html`，浏览器地址栏保持原样，React 前端路由随后接管。**这就是 SPA fallback 名字的由来。**
- **执行顺序的三个推论（L21 边学边练的考点）：**
  - 拼错的 API 路径 `GET /api/not-exist` 不会 404，而是被 fallback 兜住返回 index.html（200）——fetch 它再 `.json()` 会抛解析异常。看到「JSON 解析失败但 Network 显示 200」先怀疑路径打错；
  - fallback 只注册了 `app.get`，**非 GET 的未知路径老实 404**——HTML 兜底只该服务文档导航类请求；
  - 通配注册之后再挂任何具名 GET 路由都是死路由（会被 fallback 先吃掉）——顺序不是风格问题是正确性问题。

**验证（先别急着上 Docker，本机直跑一遍生产形态）：**

```bash
pnpm build       # tsc -b && vite build，产物进 dist/
pnpm start       # NODE_ENV=production node --import tsx server/index.ts
```

然后逐项打（另开终端）：

```bash
curl -i http://localhost:3003/health                      # {"status":"ok"}，注意：没有 Access-Control-Allow-Origin 头
curl -i http://localhost:3003/reader/some-book-id         # 200 + HTML（fallback 生效，不是 404！）
curl -s http://localhost:3003/assets/ | head              # 从 dist/index.html 里抄一个真实 asset 路径，应返回 JS 内容
curl -i -X POST http://localhost:3003/anything            # 404（非 GET 不兜底）
```

`/health` 无 CORS 头这一点值得亲手确认一次——它就是「生产同源不需要 CORS」的直接证据。

**开发环境的判决表（对照用，L21 考点）：** 同一张表换到 `pnpm dev` 下大幅简化——静态托管与 fallback 根本不存在：

| 请求 | 第一站 | 结局 |
|---|---|---|
| `POST /api/analyze` | ai 子应用命中 | 业务处理（同生产） |
| `GET /assets/index-xxx.js` | 无匹配（dist 不被托管） | **404**——前端资源由 Vite 在 5174 提供 |
| `GET /reader/abc` | 无匹配 | **404**——前端路由只在 5174 的页面上存在 |
| 其他未知路径 | 无匹配 | 404 |

换句话说：**3003 在开发期是纯 API 服务器**。如果你在浏览器直接访问 `localhost:3003/` 看到 404，这不是 bug，而是两个世界差异最直观的体现。

---

## Step 2 · 浏览器验证：刷新任意路由不 404

curl 证明的是「服务端行为」，浏览器证明的是「用户体验」。

1. 打开 `http://localhost:3003/` → 应用正常渲染（浅色 Snow 主题说明 M10 的构建产物也被正确托管）。
2. 进入一本书，读到某个句子，把地址栏 URL 改成任意深层路径（比如 `/reader/任意字符串`）按回车 → **页面正常渲染应用而不是 404 白屏**——这就是 SPA fallback 在真实浏览器里的样子：刷新不会丢路由。
3. 打开 DevTools → Network，刷新首页：`document` 请求返回 index.html，`/assets/index-*.js`、`.css` 各返回 200，且 JS/CSS 文件名带内容哈希（`index-a1b2` 这类）——Vite 的指纹产物。
4. 试一个真实 API：设置面板里配好 AI Key 后发一次分析请求，Network 里看 `POST /api/analyze` 同源 200。

**一个必须知道的缓存语义（面试点）：** 带哈希的 assets 内容一变文件名就变，可以放心让浏览器「永久缓存」；不带哈希的 index.html 是唯一指向 assets 的入口，必须每次拿最新版——否则新版本删掉旧哈希文件后，老用户拿着缓存的旧 HTML 去请求已删除的文件 → 404 → 白屏。本项目 serveStatic 默认行为已够用，将来上 CDN 就按「HTML no-cache + assets 一年强缓存」配。

---

## Step 3 · .env.example：配置面契约

**`.env.example`**（新增，完整文件）：

```bash
# Server
PORT=3003

# TTS
TTS_DEFAULT_PROVIDER=microsoft    # microsoft | voicevox
VOICEVOX_ENGINE_URL=http://localhost:50021
TTS_CACHE_MAX_BYTES=125829120     # 120 MB

# CORS (production only — omit to allow same-origin only)
# CORS_ORIGIN=https://your-domain.example.com

# AI keys (optional — the app uses BYOK by default)
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GOOGLE_API_KEY=
```

**逐项讲解（每个变量都能对应到代码里的真实读取点）：**

| 变量 | 默认值 | 代码读取位置 | 说明 |
|---|---|---|---|
| `PORT` | `3003` | `server/index.ts`: `Number(process.env.PORT ?? 3003)` | 服务监听端口 |
| `TTS_DEFAULT_PROVIDER` | `microsoft` | `server/tts/index.ts`: `process.env.TTS_DEFAULT_PROVIDER ?? 'microsoft'` | 默认引擎 |
| `VOICEVOX_ENGINE_URL` | `http://localhost:50021` | `server/tts/voicevox.ts` 构造函数 | compose 里被 environment 覆写为 `http://voicevox:50021`（Step 5） |
| `TTS_CACHE_MAX_BYTES` | `125829120`（120MB） | `server/tts/index.ts` LRU 缓存上限 | 超出按 lastAccessAt 驱逐 |
| `CORS_ORIGIN` | 注释掉（不设） | `server/index.ts`: 仅 `isProd` 且设置了才生效 | 生产跨域白名单 |

两个要点：
- **`.env` 的加载发生在 Node 侧**：`--env-file-if-exists=.env` 让 `.env` 成为可选通道（文件不存在不报错，容器里尤其方便）。**注意 `CORS_ORIGIN` 在开发环境配了也不生效**——读取它的代码在 `if (isProd)` 分支内，`NODE_ENV` 没设就是死代码。读配置必须连着消费它的控制流一起读。
- **三个 AI Key 全是注释掉的**。本项目 BYOK：Key 存在浏览器 localStorage、随请求体传给 `/api/analyze`，服务端环境变量只是给想省事的自托管者的可选项——`.env.example` 的注释本身就是产品决策的文档。

---

## Step 4 · Dockerfile：两阶段构建

**`.dockerignore`**（新增，完整文件——先写它，`COPY . .` 才安全）：

```gitignore
node_modules
dist
.git
.gitignore
.vscode
.idea
.DS_Store
*.epub
images/
.alma-snapshots
.vibe-learn
.claude
*.md
```

**`Dockerfile`**（新增，完整文件）：

```dockerfile
# -- build stage --
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# -- runtime stage --
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/tsconfig*.json ./
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3003
CMD ["pnpm", "start"]
```

**概念速成（镜像/层/容器）：** 镜像是只读的文件系统快照，由一条条 Dockerfile 指令产出的**只读层**堆叠而成；容器 = 镜像 + 一块临时可写层在跑进程，删除容器不损坏镜像。层一旦生成不可变且可被多个镜像共享——`node:22-alpine` 的基础层被你机器上所有基于它的镜像共享，这就是第二个 alpine 项目几乎不再占磁盘的原因。

**缓存三规则（决定 COPY 顺序）：**
1. 指令文本变了 → 该层失效；
2. COPY 的源文件内容变了 → 失效（只看校验和）；
3. 某一层失效 → 它之后**所有层**失效。

所以依赖清单先 COPY、先 install，源码后 COPY——**改一行业务代码不必重新 `pnpm install`**。`.dockerignore` 排除 `*.md` 后，连改 README 都不会触发 `COPY . .` 层失效。

**逐层讲解：**

- **builder 阶段**——全量依赖 + 编译，产物只有 `dist/` 被带走：
  - `node:22-alpine`：与仓库要求一致（Node ≥ 22），alpine 变体基础镜像只有 ~50MB；
  - `corepack enable && corepack prepare pnpm@latest --activate`：Node 自带的包管理器管理器，免掉单独装 pnpm 的一层。⚠️ `pnpm@latest` 不带版本号，远端发新版后这层输入实质变了，可能偶发全量重建——CI 里钉死版本（`pnpm@10`）更稳；
  - `pnpm install --frozen-lockfile`：严格按 lock 文件装，lock 与 package.json 不一致直接报错——保证构建可复现；
  - `pnpm run build` 即 `tsc -b && vite build`（M0 脚本），产出前端静态资源 `dist/`。
- **runtime 阶段**——只带运行所需。**关键问题：为什么运行镜像里还有 `server/` 和 `src/types/` 这些 TS 源码？** 因为 `pnpm start` 是 `node --import tsx server/index.ts`——**后端生产态也不预编译，靠 tsx 直跑 TS**。于是需要：
  - `server/`：后端 TS 源码本体；
  - `src/types/`：`server/providers.ts` 第一行 `import type { AIProviderType } from '../src/types/settings'`——类型被跨目录引用，必须一起带（真实 import 证据）；
  - `tsconfig*.json`：tsx 解析编译选项需要；
  - `pnpm install --frozen-lockfile --prod`：只装 dependencies，Vite/TypeScript 等 devDependencies 不进镜像；
  - `--env-file-if-exists=.env` 在 CMD 的脚本里：容器运行时从环境变量读配置（compose environment 注入），这就是「配置面」在运行时的落点。
- `EXPOSE 3003` 是文档性声明；真正映射端口靠 compose 的 `ports`。

**镜像体积优化（本项目已用的 vs 可再做的）：** 已用——alpine 基础镜像、多阶段构建（工具链留在 builder）、`--prod` 安装、`.dockerignore`（`.git`、`*.epub`、`images/` 可能几百 MB 不进 context）。可再做——消灭 tsx（加一步 tsc 编译 server，换成纯 JS 运行，能去掉 tsx 依赖甚至 pnpm/corepack）；`CMD ["node", "dist-server/index.js"]` 后 pnpm 都可以不要。

---

## Step 5 · docker-compose.yml + profiles

**`docker-compose.yml`**（新增，完整文件）：

```yaml
services:
  app:
    build: .
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - PORT=3003
      - TTS_DEFAULT_PROVIDER=microsoft
      - VOICEVOX_ENGINE_URL=http://voicevox:50021
    depends_on:
      voicevox:
        condition: service_started
        required: false

  voicevox:
    image: voicevox/voicevox_engine:latest
    ports:
      - "50021:50021"
    profiles:
      - voicevox
```

**三个设计点逐个讲：**

1. **`VOICEVOX_ENGINE_URL=http://voicevox:50021` 用的是 service 名而非 localhost。** compose 会建内部网络，service 名就是 DNS 名；容器之间走内网，`50021` 的宿主端口映射只是给宿主机调试用的。这行 environment 覆写了 `.env.example` 里的默认值（`http://localhost:50021`）——容器内 localhost 是容器自己，不通。
2. **`depends_on.voicevox.condition: service_started + required: false`。** 两个语义分开读：`service_started` 是弱保证（只保证容器进程被拉起，不是服务就绪）；`required: false` 是关键——**即使 voicevox 没启动，app 也照常起**。VOICEVOX 引擎冷启动要加载几十秒模型，绝不能让它挡住主应用。（对照面：`service_healthy` 是强保证，要等健康检查连续通过——本仓库选择弱保证 + 应用层容错，是权衡不是疏漏。）
3. **profiles 按需启动。** `docker compose up -d` 默认只启动没有 profile 的 service（只有 app，默认 microsoft 引擎零额外配置）；标了 `profiles: [voicevox]` 的 service 要显式 `--profile voicevox` 才启动：

```bash
docker compose up -d                        # 只有 app
docker compose --profile voicevox up -d      # app + voicevox（首次拉取约 2GB）
```

适合「可选重型组件」——不用语音功能的用户完全不必拉取 2GB 的引擎镜像。

**验证（整条链路，Docker Desktop 运行中）：**

```bash
docker compose up -d --build          # 首次构建约几分钟，观察分层缓存日志
docker compose ps                     # app 容器 STATUS 是 Up
open http://localhost:3003            # Windows 用 start；页面渲染 = 镜像里的 dist 托管成功
curl http://localhost:3003/health     # {"status":"ok"}
docker compose logs app               # 看到 "Server running on http://localhost:3003"
docker compose down
```

**改动验证层缓存的正确姿势：** 改一行业务代码 → `docker compose up -d --build` → 日志里 `COPY . .`、`pnpm run build` 重跑，而 `pnpm install` 显示 `CACHED`——这就是「先锁文件后源码」的收益可视化。

**`docs/self-hosting.md`（新增，给用户的交付物）。** 结构照抄真实仓库：前提条件（Docker Desktop + 一个 AI Key）→ 快速开始（`git clone` + `docker compose up -d` + 访问 3003 + 设置里填 Key）→ 可选 VOICEVOX（`--profile voicevox`，说明镜像约 2GB）→ 环境变量表 → 不用 Docker 的方式（`pnpm install && pnpm build && pnpm start`）→ 停止/更新（`docker compose down` / `git pull && docker compose up -d --build`）→ FAQ（页面空白看 `docker compose logs app`；VOICEVOX 无声确认 profile 与设置；Key 安全：只存浏览器 localStorage）。写完后可以逐条照着操作一遍验证文档无坑。

---

## Step 6 · 生产排障速查（把 L21/L29 的坑固化成清单）

部署形态跑通后，把两类最常见的故障现象和判定方法写进你的操作手册——它们都不是「bug」，而是**对两个世界差异的误判**：

| 现象 | 判定 | 处置 |
|---|---|---|
| 页面打开空白 | 构建是否成功？`docker compose logs app` 有无报错 | 先看日志再怀疑代码；`docker compose up -d --build` 重构建 |
| VOICEVOX 没声音 | 是否用了 `--profile voicevox` 启动？设置里引擎是否切到 VOICEVOX？ | 引擎没起就用 Microsoft；`docker compose logs voicevox` 看引擎状态 |
| 「JSON 解析失败」但 Network 显示 200 | **API 路径拼错被 fallback 兜住**，fetch 拿到的是 index.html | 核对 `/api/xxx` 拼写；`curl -s <path> | head` 看响应头 |
| 生产环境配了 `CORS_ORIGIN` 不生效 | 是否在用 `pnpm dev` 跑？读取代码在 `if (isProd)` 内 | `NODE_ENV=production` 才走生产分支 |
| `pnpm start` 起不来 | 端口被占 / dist 不存在 / 依赖没装 | `lsof -i :3003` 查占用；先 `pnpm build` 再 `pnpm start` |
| 镜像 build 每次全量重装 | 改了 `pnpm-lock.yaml`？`corepack prepare pnpm@latest` 拿到新版本？ | 依赖变化重装是正常的；钉死 pnpm 版本可消除后者 |

**验证：** 主动制造一次「API 路径拼错」（把 `fetch('/api/analyze')` 临时改成 `/api/analyz')`），观察 Network 里的 200 + 解析异常——亲眼见过这个坑，以后排障快十倍。记得还原。

---

## 收尾验收清单

- [ ] `pnpm build && pnpm start` 后 `http://localhost:3003` 正常渲染应用
- [ ] 浏览器刷新任意深层路径（如 `/reader/xxx`）返回应用页面而非 404（SPA fallback）
- [ ] `curl -i /health` 响应**没有** `Access-Control-Allow-Origin` 头（生产同源、默认最严）
- [ ] 配了 `CORS_ORIGIN` 的 .env 在生产态生效、开发态不生效（读代码能讲出为什么）
- [ ] `docker compose up -d --build` 一条命令跑起整个应用
- [ ] 改业务代码后 rebuild，`pnpm install` 层显示 `CACHED`（层缓存生效）
- [ ] `docker compose --profile voicevox up -d` 能多拉起 voicevox；不带 profile 启动则只有 app
- [ ] `.env.example` 每个变量都能说出读取它的代码位置
- [ ] 能讲出：为什么运行镜像要带 `server/` 和 `src/types/` / 为什么生产不配 CORS 最安全 / `required: false` 在防什么
- [ ] 自托管文档里的命令逐条操作过一遍

## 与最终代码的差异复盘

1. **Microsoft TTS 引擎**：真实仓库的 `b1b0206` 同批合入了 Microsoft TTS（`server/tts/microsoft.ts`）——生产默认引擎需要免费无配置的兜底方案，这是「部署 + 语音」一起交付的原因。如果你 M8 只做了 VOICEVOX，这里是一个明确的功能缺口：`TTS_DEFAULT_PROVIDER=microsoft` 会因找不到实现而回退或报错，要么补引擎，要么把默认值改成 voicevox。
2. **compose 健康检查**：真实仓库没有给 app 配 `healthcheck`（L29 把它列为思考题）。`docker compose ps` 的 STATUS 只会是 `Up` 而非 `(healthy)`。要加的话：`HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:3003/health || exit 1`（alpine 自带 busybox wget）。
3. **`corepack prepare pnpm@latest`**：真实 Dockerfile 就是 `latest`（非钉死）。稳定构建的工程化做法是钉版本，本卡保留真实写法并在讲解里标注风险。
4. **server/index.ts 与最终版一致**：36 行逐字相同。M4 建好的 CORS 分支原样保留，本里程碑只加了两行静态托管 + fallback——注意别为了「整洁」重排顺序，顺序本身就是行为。
5. **`*.md` 进 .dockerignore**：意味着 README/课程文档不进镜像——文档是仓库的，不是容器的。这个取舍让 `COPY . .` 层对文档改动免疫。

## 设计注记（历史弯路）

- **部署是一次合入的（commit `b1b0206`）。** 真实提交把 production server、Docker、Microsoft TTS、security（CORS 白名单策略）打包成一个 feat——AI 一步生成的典型形态。拆开看，它们其实是三个独立决策：**单进程托管**（serveStatic + fallback）、**可移植运行**（Docker）、**默认语音可用**（Microsoft TTS 免费免配置）。我们复刻拆成两步（M8 语音、M11 部署），每步单独可验收。
- **死代码清理与文档同批（`1d25db3`）。** README、self-hosting 文档、删除 269 行死代码（SentencePairCard 的遗留逻辑）在同一次 commit。规律：**文档补全的时刻，往往是顺手清理的时刻**——因为写文档逼你通读所有路径，读到死代码就删。
- **「不配 CORS 反而最安全」是反直觉但正确的结论。** 很多自托管项目默认 `cors()` 全开，用户拿到就能跑，但生产同源部署下这是纯暴露面。本项目的默认是「最严白名单 = 只有自己」，需要跨域的人才主动开——安全默认值优先于方便默认值。
- **tsx 直跑 TS 的取舍。** 生产不预编译意味着运行镜像必须带 `server/`、`src/types/`、`tsconfig`——镜像「不纯」。换来的是零构建步骤、零产物路径管理。面试被问「生产环境为什么还带着 TS 源码」就讲这条链路，并给出消灭它的方案（L29 优化思路第 5 条）。

## 下一步

进入 [M12 · 收尾打磨](./M12-polish.md)——首次运行引导（WelcomeGuide）+ 防御性修复 + 全链路回归，把项目从「能跑」推到「能交付」。
