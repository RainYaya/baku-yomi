# M4 · 从零构筑：后端与 AI 分析

> 目标：给回译练习接上 AI 大脑——从 M0 的骨架长出一条完整的「BYOK 哑管道」：Hono 子路由 + 内存限流 + 多厂商工厂 + 前端 prompt 封装与评分解析，再配上能填 Key 的设置面板与能显示结果的分析组件。
> 产出形态：`POST /api/analyze` 四态分明（400/429/500/200）；设置面板可填 API Key；`AnalysisPanel` 能显示一条分析结果。
> 关联课程：L20（Hono 框架）、L21（服务入口精读）、L22（AI SDK）、L23（工厂与 BYOK）、L24（Prompt 工程）、L25（限流与可靠性）。
> 前置：M0 双进程骨架已通（`pnpm dev` 起 5174 + 3003）；M3 的 store 体系已建（settingsSlice 存在）。开始前 `pnpm dev` 应能跑起来、`/health` 有响应。

## 构筑总览（本里程碑结束时的项目结构）

```
baku-yomi/
├── server/
│   ├── index.ts             # CORS 双策略 + /api 挂载（本卡重写）
│   ├── routes/
│   │   └── ai.ts            # POST /analyze + 内存限流（本卡新建）
│   └── providers.ts         # createProvider 四分支工厂（本卡新建）
└── src/
    ├── lib/ai/
    │   ├── prompts.ts       # 三个 build*Prompt（本卡新建）
    │   └── client.ts        # fetch 封装 + 评分正则（本卡新建）
    ├── stores/
    │   └── settingsSlice.ts # 补 AI 供应商档案字段与 action（本卡扩充）
    ├── components/
    │   ├── settings/AISettingsPanel.tsx  # 最小版供应商表单（本卡新建）
    │   └── analysis/AnalysisPanel.tsx    # 最小可显示（本卡新建）
    └── types/settings.ts    # AIProviderType / AIProviderConfig / DEFAULT_MODELS（M3 已有）
```

**最终差异说明**（对照最终仓库，本卡只做到标出的程度）：
- `server/index.ts` 最终还有 `serveStatic` + SPA fallback（M11 生产部署加）
- `server/routes/ai.ts` 最终顶部还挂了 `/tts` 子路由（M8 TTS 加）
- `settingsSlice` 最终还有语音/阅读偏好字段（voicevox*、blindMode 等，随 M2/M8 各卡补齐）
- `AnalysisPanel` 最终版把纯文本渲染换成了行级 Markdown 解析器（M5 加）

一次请求的旅程：浏览器 `client.ts` → `POST /api/analyze` 五字段 → 限流（超限 429）→ 字段校验（缺失 400）→ `createProvider` 工厂 → `generateText`（异常 500 透传 / 成功 `{text}`）。本卡结束时要能亲手走通这条链。

---

## Step 1 · 重写 server/index.ts：CORS 双策略与 /api 挂载

M0 的后端只有 `/health`。本步升级成「开发/生产双世界」入口：中间件先行、子路由挂载、启动监听。M11 才加静态托管，本步**不要**写 `serveStatic`。

```ts
import { serve } from '@hono/node-server';
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

const port = Number(process.env.PORT ?? 3003);
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
```

**讲解：** `isProd` 是全文唯一的环境分支开关（`pnpm start` 注入 `NODE_ENV=production`，`pnpm dev` 不设），两处分支都引用它，避免散落字符串比较。CORS 三态（L21 核心结论）：开发时 Vite 在 5174、后端在 3003，跨源必须放行 → `cors()` 无参 = 允许所有源；生产配了 `CORS_ORIGIN` → 精确白名单；生产没配 → 不注册 CORS 中间件 → **同源最严格**（同源部署时浏览器根本不触发 CORS 流程，「不配反而最安全」）。`app.route('/api', ai)` 把子应用挂到 `/api` 前缀下——子应用内部写 `/analyze`，对外就是 `/api/analyze`，改挂载点不用动子应用一行。

**验证：** `pnpm dev:server` → `curl http://localhost:3003/health` 返回 `{"status":"ok"}`；`GET /api/analyze` 此时 404（子路由下一步才建，正常）。

## Step 2 · server/routes/ai.ts：限流 + POST /analyze

「哑管道」本体：限流 → 校验 → 工厂 → 生成 → 透传。注意**限流在解析 body 之前**——被拒的请求不浪费解析成本。

```ts
import { Hono } from 'hono';
import { generateText } from 'ai';
import { createProvider } from '../providers';

const ai = new Hono();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // requests per window

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Sweep stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000);

ai.post('/analyze', async (c) => {
  // Rate limit check
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    return c.json({ error: 'Rate limit exceeded. Try again shortly.' }, 429);
  }

  const body = await c.req.json();
  const { provider, apiKey, model, baseUrl, prompt } = body;

  if (!provider || !apiKey || !model || !prompt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  try {
    const llm = createProvider(provider, apiKey, model, baseUrl);

    const result = await generateText({
      model: llm,
      prompt,
    });

    return c.json({ text: result.text });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});


export default ai;
```

**讲解：** 限流三参数是模块级常量（60 秒窗口 / 每 IP 30 次 / 5 分钟清扫），`rateBuckets` 是**模块级** Map——放请求处理器里会随请求数泄漏定时器且限流失效；清扫的 `setInterval` 放模块顶层，整个进程只有一个。取 IP 是四段式防御链（头缺失 → split 空串 → 空白 → 兜底 `'unknown'`）；开发环境无 XFF → 全部共享 `unknown` 桶，这是刻意的保守。「先自增再比较」：第 30 个放行、第 31 个拒绝。字段校验用最朴素真值判断、**不上 zod**——`provider/apiKey/model/prompt` 缺一即 400，`baseUrl` 可选（仅 openai-compatible 用）。`try/catch` 把厂商异常（Key 无效、模型名打错）的 message 原文透传成 500 `{error}`——BYOK 场景「让用户看到厂商原话自己排查」优先于错误分类。成功永远 `{text}`、失败永远 `{error}`。

**验证：** 后端 `--watch` 已自动重启，先跑两类不需要真实 Key 的响应：

```bash
# 缺字段 → 400
curl -i -X POST http://localhost:3003/api/analyze -H 'Content-Type: application/json' -d '{"provider":"openai","apiKey":"sk-test","model":"gpt-4o"}'
# → HTTP/1.1 400  {"error":"Missing required fields"}

# 未知 provider → 500（进程不崩）
curl -i -X POST http://localhost:3003/api/analyze -H 'Content-Type: application/json' -d '{"provider":"deepseek","apiKey":"x","model":"m","prompt":"hi"}'
# → HTTP/1.1 500  {"error":"Unknown provider type: deepseek"}
```

## Step 3 · server/providers.ts：四分支工厂 + 安装依赖

把「哪种厂商、什么凭据、哪个模型」收敛成一个同步函数，返回统一的 `LanguageModelV1`——从这行往下，路由对「背后是 GPT 还是 Claude」无感。

```ts
import type { AIProviderType } from '../src/types/settings';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

export function createProvider(
  type: AIProviderType,
  apiKey: string,
  model: string,
  baseUrl?: string
): LanguageModelV1 {
  switch (type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai.chat(model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }
    case 'openai-compatible': {
      const openai = createOpenAI({ apiKey, baseURL: baseUrl });
      return openai.chat(model);
    }
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
```

**讲解：** `import type { AIProviderType } from '../src/types/settings'` 是跨层但**仅限类型**的引用——前后端共享同一份联合类型，UI 下拉与服务端 switch 永远对得上。四个参数恰好是 `AIProviderConfig` 的一比一投影。每分支两步：`createXxx({ apiKey })` 得到携带凭据的厂商连接器（Key 从此活在闭包里、不落盘），再传模型名产出模型（OpenAI 写 `openai.chat(model)` 是因为其 SDK 有 chat/completions 两套端点）。`openai-compatible` 只换 `baseURL`——OpenAI 的 `/v1/chat/completions` 是行业事实标准，Ollama/LM Studio/DeepSeek 都兼容，这是本地零成本跑通本项目的钥匙。`default: throw` 是运行时防线（请求体来自网络，联合类型管不到）。工厂是**同步**的：只做对象构造、无 IO。

安装依赖（写完 import 就得装，否则模块找不到）：

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
```

**讲解：** `ai`（核心包，提供 `generateText`）+ 三个厂商适配器，对应当前仓库的 `ai@^6`、`@ai-sdk/*@^3`。**依赖跟着功能走**——M1-M3 完全不需要它们。

**验证：** `npx tsc -b` 通过（Step 2 的 500 已顺带验证工厂 default 分支）。

## Step 4 · src/lib/ai/prompts.ts：三个 prompt 工厂

「prompt 即接口契约」：前端拼完整字符串，后端零语义。三个纯函数——回译提示、译文改写、评分分析。评分 prompt 里的【综合评分】是**被正则消费的契约行**：格式漂移，UI 直接显示 0 分。

```ts
/**
 * 回译提示 prompt - 帮助用户从中文思考日语表达
 */
export function buildHintPrompt(
  original: string,
  chinese: string
): string {
  return `你是日语教育专家。请为以下句子提供**回译练习提示**，帮助学习者从中文翻译成日语时思考正确的日语表达，而不是照抄原文语序。

## 输入
**日语原文:** ${original}
**中文翻译:** ${chinese}

## 输出要求

请从以下几个角度提供提示（选择2-4个最相关的）：

1. **语法结构**：指出原文中重要的语法点（如～際、～際に、～たところ等）
2. **语序与连接**：提示原文中从句/主句的连接方式
3. **时态与体态**：说明原文的时态和体态如何表达
4. **主语与对象**：提示动作主体和对象的表达方式
5. **动词活用**：提示重要动词的形态
6. **固定表达**：提示文中的惯用表达

## 格式
使用以下格式：
【语法结构】提示内容...
【语序连接】提示内容...
【时态体态】提示内容...

## 注意事项
- 只提示方向，不要给出原文的具体日语表达
- 回答使用中文`;
}

/**
 * 优化译文 prompt - 将机翻译文改写成适合回译的版本
 */
export function buildBacktranslateHintPrompt(
  original: string,
  chinese: string
): string {
  return `你是日语教育专家。请将中文翻译改写成**适合回译练习**的版本。

## 什么是"适合回译的译文"？

好的机翻译文往往太流畅、太符合中文习惯，导致学习者看到后会下意识地按照中文的语序和表达方式来翻译日语，失去了回译练习的意义。

适合回译的译文应该：
- **保留日语的结构感**：比如日语的倒装、状语位置、从句前置等特点在中文中也要体现
- **提示时态和体态**：日语的时态（过去/现在/未来）和体态（完成/进行/反复）在中文中要能看出来
- **保留动词形态暗示**：日语动词的各种活用形态在中文中要有迹可循
- **不过度意译**：中文表达应该尽量贴近原文的字面意思

## 输入
**日语原文:** ${original}
**中文翻译:** ${chinese}

## 输出要求

请直接输出改写后的中文译文，不要其他解释。

改写时要：
1. 调整语序，使中文更接近日语的原始结构
2. 使用更直译的表达，而不是地道的中文惯用语
3. 必要时添加提示性的词语来暗示时态、体态、语态等

## 示例

输入：那个人非常有礼貌地鞠了一躬，然后走出了房间。
改写：那个人用非常有礼貌的方式，躬了躬，然后从房间里走了出去。

输入：从五岁生日开始学会祈祷。
改写：会变成祈祷的是从五岁的生日开始的。

输入：她虽然很累，但还是坚持完成了工作。
改写：她虽然是在累的状态，但还是把工作坚持了完成。`;
}

export function buildAnalysisPrompt(
  original: string,
  chinese: string,
  userTranslation: string
): string {
  return `你是日语教育专家。请分析学习者根据中文翻译回译成日语的结果。

## 输入信息

**日语原文:** ${original}
**中文翻译:** ${chinese}
**学习者回译:** ${userTranslation}

## 分析指示

请对比学习者的回译与原文，按以下格式输出分析结果：

【综合评分】X/100

【错误与差异分析】
请按以下分类分析每个错误：
- 语法 / 词汇 / 助词 / 敬语 / 时态 / 表达 / 语序 / 其他

每个错误的格式：
#### N. 分类：简洁说明
- **回译文:** （相关部分）
- **原文:** （相关部分）
- **分析:** 具体说明

【优点】
请列举学习者回译中做得好的地方。

【总体建议】
给出1-2句学习建议。

## 注意事项
- 即使与原文不完全一致，只要意思和语法正确，就不要标记为错误
- 如果有更自然的日语表达替代方案，也请提供
- 请使用日语回答`;
}
```

**讲解（Prompt 四要素，L24）：** 角色设定（日语教育专家）+ 任务与输入（`## 输入` 插值）+ 输出格式约定 + 约束与反例。`buildHintPrompt` 的核心是「只提示方向，不要给出原文的具体日语表达」——回译的价值在检索记忆，但这是自然语言约束、没有机械保证；「选择2-4个」用数字圈住范围逼模型做相关性判断。`buildBacktranslateHintPrompt` 用 **few-shot 示例**（三个「输入→改写」对）锚定「适合回译」这种无法言传的改写幅度。`buildAnalysisPrompt` 的输出模板即接口契约：`【综合评分】X/100` 第一行是前端正则的消费目标，`【错误与差异分析】`/`#### N. 分类`/`- **回译文:**` 是 M5 行级渲染器的输入格式。

**验证：** 纯函数无副作用，`npx tsc -b` 通过即可；行为验证等 Step 5 之后。

## Step 5 · src/lib/ai/client.ts：fetch 封装与评分正则

三个函数对应三个 prompt，共享同一骨架：`build*Prompt` → POST `/api/analyze` 五字段 → `!ok` 抛错 → 取 `data.text`。下面给出「评分分析」的完整实现（含正则抠分）；另外两个（`generateBacktranslateHints` 用 `buildHintPrompt`、`optimizeTranslationForBacktranslation` 用 `buildBacktranslateHintPrompt`）与之完全同构，只差 prompt 选择与错误前缀（`'AI hint generation failed'` / `'AI optimization failed'`），照着抄即可。

```ts
import type { AIProviderConfig, AnalysisResult } from '../../types';
import { buildAnalysisPrompt, buildHintPrompt, buildBacktranslateHintPrompt } from './prompts';

export async function analyzeTranslation(
  config: AIProviderConfig,
  original: string,
  chinese: string,
  userTranslation: string,
  pairId: string
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(original, chinese, userTranslation);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: config.type,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      prompt,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI analysis failed: ${err}`);
  }

  const data = await response.json();
  const rawMarkdown: string = data.text;

  // Extract score
  const scoreMatch = rawMarkdown.match(/【综合评分】\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  return {
    pairId,
    userTranslation,
    originalJapanese: original,
    score,
    errors: [],
    strengths: [],
    suggestions: [],
    rawMarkdown,
    analyzedAt: Date.now(),
  };
}
```

**讲解：** `apiKey` 从浏览器发往服务器是 BYOK 模式的标志；`prompt` 是前端拼好的完整字符串，后端纯「文本进文本出」。错误检查用 `response.text()` 而非 `.json()`——错误 body 可能是网关 HTML，先当文本拿到手；body 原文拼进 Error 消息，前端能直接看到服务端的 429/500 文案。评分解析 `/【综合评分】\s*(\d+)/` 抠不到就 `?? 0` 兜底、**不报错**——格式契约写在 prompt 里，解析做得再聪明也防不住模型自由发挥。`errors/strengths/suggestions` 先给空数组占位，真正的结构化解析留给第 30 课的 `generateObject`。`AnalysisResult` 形状见 `src/types/analysis.ts`。

**验证：** 浏览器控制台 `await analyzeTranslation(config, '今日は雨です。', '今天下雨。', '今日は雨だ。', 'pair-1')`——配好真实 Key 能拿到 `{score, rawMarkdown, ...}`；不配 Key 收到 500 且 Error 里含服务端文案。

## Step 6 · settingsSlice 补 AI 供应商档案

M3 已建 settingsSlice 与 persist（`version: 2` + `migrate`）。本步把 AI 供应商档案加进去——字段与 action 全部来自最终源码，插进 M3 对应位置即可，persist 配置不用动。

```ts
// interface SettingsState 里新增（与 M3 已有字段并列）：
//   aiProviders: AIProviderProfile[];  activeAIProviderId: string;
//   getActiveAIProvider / addAIProvider / removeAIProvider /
//   setActiveAIProviderId / updateAIProvider 六个 action 签名

// interface 之后新增档案类型与模块级工具：
export interface AIProviderProfile extends AIProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
}

const makeProvider = (id: string, type: AIProviderType = 'openai'): AIProviderProfile => ({
  id,
  name: `供应商 ${id.slice(-4)}`,
  type,
  apiKey: '',
  model: type === 'anthropic' ? 'claude-sonnet-4-20250514' : type === 'google' ? 'gemini-2.0-flash' : 'gpt-4o',
  enabled: true,
});

const DEFAULT_PROVIDER_ID = 'provider-default';
const FALLBACK_AI_PROVIDER: AIProviderConfig = { type: 'openai', apiKey: '', model: 'gpt-4o' };

// create() 初始 state 新增两项（其余保持 M3）：
aiProviders: [{ id: DEFAULT_PROVIDER_ID, name: '默认供应商', type: 'openai', apiKey: '', model: 'gpt-4o', enabled: true }],
activeAIProviderId: DEFAULT_PROVIDER_ID,

// actions 实现（放进 (set, get) => ({ ... })）：
getActiveAIProvider: () => {
  const state = get();
  const active =
    state.aiProviders.find((p) => p.id === state.activeAIProviderId && p.enabled) ??
    state.aiProviders.find((p) => p.enabled) ??
    state.aiProviders[0];
  return active ?? FALLBACK_AI_PROVIDER;
},
addAIProvider: (type = 'openai') =>
  set((state) => {
    const id = `provider-${Date.now()}`;
    const next = makeProvider(id, type);
    return { aiProviders: [...state.aiProviders, next], activeAIProviderId: id };
  }),
removeAIProvider: (id) =>
  set((state) => {
    const remaining = state.aiProviders.filter((p) => p.id !== id);
    if (remaining.length === 0) {
      const fallback = makeProvider(DEFAULT_PROVIDER_ID, 'openai');
      return { aiProviders: [fallback], activeAIProviderId: fallback.id };
    }
    const nextActive = state.activeAIProviderId === id ? remaining[0].id : state.activeAIProviderId;
    return { aiProviders: remaining, activeAIProviderId: nextActive };
  }),
setActiveAIProviderId: (id) => set({ activeAIProviderId: id }),
updateAIProvider: (id, config) =>
  set((state) => ({
    aiProviders: state.aiProviders.map((p) => (p.id === id ? { ...p, ...config } : p)),
  })),
```

**讲解：** `AIProviderProfile extends AIProviderConfig` 在 M3 的配置形状（type/apiKey/model/baseUrl）上加档案字段（id/name/enabled）。`getActiveAIProvider` 三段兜底：当前档案停用 → 任一启用档案 → 数组第一项 → `FALLBACK_AI_PROVIDER`——**任何情况下都返回可用配置**，M5 的调用方不用判空。`removeAIProvider` 删到最后一个时自动重建默认档案，不允许「零供应商」。新档案用 `provider-${Date.now()}` 当 id，天然唯一。全部不可变更新（展开 + map/filter），延续 M3 纪律；新字段随 `settings-store` 自动持久化。

**验证：** 浏览器控制台 `useSettingsStore.getState().addAIProvider('google')` → 刷新页面 → DevTools → localStorage → `settings-store` 里能看到两个档案且 `activeAIProviderId` 指向新档案。

## Step 7 · AISettingsPanel 最小版

能新增/切换供应商、改类型/Key/模型的表单（最终版补的名称字段、启用开关、删除按钮在复盘里列）。M2 已建设置面板（SettingsModal + uiStore 的 `settingsOpen`/`closeSettings`），本步把设置内容区换成这个组件即可。

```tsx
import { useMemo } from 'react';
import { useSettingsStore } from '../../stores/settingsSlice';
import type { AIProviderType } from '../../types';
import { DEFAULT_MODELS } from '../../types';

const PROVIDERS: { value: AIProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
];

export function AISettingsPanel() {
  const { aiProviders, activeAIProviderId, addAIProvider, setActiveAIProviderId, updateAIProvider } =
    useSettingsStore();

  const active = useMemo(
    () => aiProviders.find((p) => p.id === activeAIProviderId) ?? aiProviders[0],
    [aiProviders, activeAIProviderId]
  );

  if (!active) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="settings-label !mb-0">AI 供应商</label>
        <button className="settings-mini-btn" onClick={() => addAIProvider('openai')}>新增</button>
      </div>

      <div className="space-y-2">
        {aiProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setActiveAIProviderId(provider.id)}
            className={`settings-provider-item ${provider.id === activeAIProviderId ? 'active' : ''}`}
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="text-left min-w-0">
                <div className="truncate" style={{ fontFamily: 'var(--font-ui)' }}>{provider.name}</div>
                <div className="text-xs opacity-50 truncate">{provider.type}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div>
        <label className="settings-label">提供商类型</label>
        <select
          value={active.type}
          onChange={(e) => {
            const type = e.target.value as AIProviderType;
            updateAIProvider(active.id, {
              type,
              model: DEFAULT_MODELS[type],
              baseUrl: type === 'openai-compatible' ? active.baseUrl : undefined,
            });
          }}
          className="settings-input"
        >
          {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div>
        <label className="settings-label">API Key</label>
        <input
          type="password"
          value={active.apiKey}
          onChange={(e) => updateAIProvider(active.id, { apiKey: e.target.value })}
          className="settings-input"
          placeholder="sk-..."
        />
      </div>

      <div>
        <label className="settings-label">模型名称</label>
        <input
          type="text"
          value={active.model}
          onChange={(e) => updateAIProvider(active.id, { model: e.target.value })}
          className="settings-input"
          placeholder={DEFAULT_MODELS[active.type]}
        />
      </div>

      {active.type === 'openai-compatible' && (
        <div>
          <label className="settings-label">Base URL</label>
          <input
            type="text"
            value={active.baseUrl ?? ''}
            onChange={(e) => updateAIProvider(active.id, { baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="settings-input"
          />
        </div>
      )}
    </div>
  );
}
```

**讲解：** `active` 用 `useMemo` 推导当前档案——派生值不进 state（M2 纪律延续）；`if (!active) return null` 兜底空数组。所有输入**受控 + 直接写 store**：`onChange` → `updateAIProvider`——设置面板是低风险高频写入，不需要 M2 那种草稿本地化保护。切类型时顺手把模型重置为 `DEFAULT_MODELS[type]` 并清掉 `baseUrl`（切走兼容类型时清残留），避免「静默回退到官方地址」的坑。SettingsModal 内容区渲染 `<AISettingsPanel />` 即可（最终版的 AI/语音双 tab 是 M8 加的）。

**验证：** `pnpm dev` → 打开设置面板：新增一个 Google 供应商、切过去填 Key、刷新页面配置仍在（persist 生效）；localStorage 能看到 `settings-store`。

## Step 8 · AnalysisPanel 最小可显示

M5 才把面板接进练习流程；本步先把「一条分析结果」的展示组件做出来——评分点阵（5 点 = score/20）+ 原始 Markdown 文本。行级 Markdown 解析器（【标题】/`####`/`- 列表`）是 M5 的活。

```tsx
import type { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

export function AnalysisPanel({ result }: Props) {
  return (
    <div className="mt-5 pt-5 animate-fade-in" style={{ borderTop: '1px dashed var(--border-color)' }}>
      {/* Score indicator */}
      {result.score > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs" style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-muted)', letterSpacing: '0.05em' }}>评分</span>
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full transition-colors"
                style={{ backgroundColor: i < Math.round(result.score / 20) ? 'var(--accent-primary)' : 'var(--border-color)' }} />
            ))}
            <span className="text-sm ml-1" style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-secondary)', fontWeight: 500 }}>
              {result.score}/100
            </span>
          </div>
        </div>
      )}
      {/* Raw markdown content */}
      <div className="text-reading" style={{ color: 'var(--ink-secondary)', fontSize: '0.9em', whiteSpace: 'pre-wrap' }}>
        {result.rawMarkdown}
      </div>
    </div>
  );
}
```

**讲解：** `result.score > 0` 才渲染评分条——**抠分失败时整块不渲染**，而不是显示误导性的 0 分（0 分与「没抠到」在 UI 上可区分）。五颗点 `i < Math.round(score / 20)` 把 score/100 映射到 5 点。颜色全走主题变量，M10 换主题不用改这里。本阶段用 `whiteSpace: 'pre-wrap'` 保留 AI 输出的换行——M5 换成按行解析的 `MarkdownContent`。

**验证：** 临时在 App 里渲染 `<AnalysisPanel result={/* 手造一条 AnalysisResult */} />`：能看到点阵与多行文本；score=0 时评分条不出现。

## 收尾验收清单

- [ ] curl 复现四态：缺字段 400 / 未知 provider 500 / 合法 Key 200 `{text}` / 第 31 个请求 429（`for i in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code}\n" …; done | sort | uniq -c` 应得 30 个非 429 + 1 个 429）
- [ ] 429 响应是 JSON 不是 HTML、错误消息可读；限流在字段校验之前（连缺字段的请求也消耗配额，能用 curl 验证）
- [ ] 开发环境无 XFF 时所有请求共享 `unknown` 桶；伪造 `X-Forwarded-For: 9.9.9.9` 能拿到独立配额（XFF 可伪造的演示）
- [ ] 从 5174 的 Vite 代理调 `/api/analyze` 成功（开发态 CORS 放行生效，浏览器 Network 无 CORS 报错）
- [ ] 设置面板能新增/切换供应商、改类型/Key/模型；选 openai-compatible 时出现 Base URL 输入框；刷新后配置仍在
- [ ] 配好真实 Key 后 `analyzeTranslation` 能拿到 `{score, rawMarkdown}`；AI 输出含「【综合评分】85」时 score=85，不含时 score=0 且不报错
- [ ] 后端代码没有任何读取 AI 厂商环境变量的调用；Key 只出现在浏览器 localStorage 与请求体里
- [ ] 能画出「浏览器 → 限流 → 校验 → 工厂 → generateText → 厂商」完整请求链，标出每层抛错/透传的位置
- [ ] 能说出 BYOK 三跳（浏览器 / 自建服务器 / 厂商）各自谁能看到 Key，以及自托管为何成立
- [ ] 能说出工厂为什么返回统一 `LanguageModelV1`，以及换厂商时改哪一行

## 与最终代码的差异复盘

1. `server/index.ts`——最终版在 `if (isProd)` 里多了 `serveStatic` + SPA fallback 两段（M11 部署加）；本卡的 CORS 双策略与 `/api` 挂载就是最终形态。
2. `server/routes/ai.ts`——最终版顶部有 `ai.route('/tts', tts)`（M8 加）；限流与 analyze 处理器本卡已到最终形态。
3. `client.ts`——最终版三个函数各自完整展开（刻意保留的三胞胎，L22）；本卡给了 `analyzeTranslation` 全量 + 另外两个的同构说明。
4. `settingsSlice`——最终版还有 `ttsProvider`/`voicevox*`（M8）、`blindMode`/`keywordMode`/`layoutMode`/`fontZoom`（随 M2/M9 各功能加）；`version: 2` + `migrate` 在 M3 已就位。
5. `AISettingsPanel`——最终版补了名称字段、启用开关、删除按钮与完整样式；本卡的 core CRUD 与之行为一致。
6. `AnalysisPanel`——最终版把 `whiteSpace: pre-wrap` 的原文渲染换成 `MarkdownContent` 行级解析器（M5 加）。

## 设计注记（历史弯路）

- 练习面板最初想用 keyword chips（b43caeb）：把原文里的语法点做成可点击的关键词块，后来被 AI grammar hints（663eb8f）完全取代——基于规则的关键词命中远不如 LLM 按上下文生成的提示。复刻直接做 AI 提示；这个对比很适合回答「为什么用 LLM 而不是规则」。
- 后端不是一开始就有的：dev 脚本最初只有纯 `vite` 单进程（219d22c 才改成双进程并发启动），为了让 AI 接口可用才加了 Hono 后端——功能顺序「先本地后 AI」也体现在本手册：M1-M3 完全不需要后端。
- 限流是后补的防线：早期 `/api/analyze` 无任何限流，公网部署后才补固定窗口 30 次/分/IP；其局限（重启清零、多实例各自计数、XFF 可伪造）在单机自托管场景全部可接受——选型跟着部署形态走。
- 错误透传是取舍沉淀：早期想给错误分类映射状态码，后来发现 BYOK 用户最需要「看到厂商原话自己排查」，于是接受「message 原文 + 一律 500」——不维护错误分类映射也是一种零维护成本的设计。

## 下一步

进入 [M5 · 练习面板](./M05-practice-panel.md)：把 AI 能力组装进回译练习的交互闭环——面板、提交状态机与结果渲染。
