# M10 · 从零构筑：六主题系统与 Canvas 氛围特效

> 目标：给 M9 的书架/阅读双视图穿上六套可持久化、可平滑过渡、带雨雪粒子特效的皮肤。做完这一步，应用有了真正的「氛围」——换个主题不只是换颜色，还换了天气。
> 关联课程：L08（Tailwind 4 与 CSS 变量主题体系）。
> 前置：M9 完成（TopBar 里挂 ThemeIndicator 需要它）；`pnpm dev` 能跑、M10 之前所有里程碑的代码都在。

## 构筑总览（本里程碑结束时的项目结构）

```
baku-yomi/
├── vite.config.ts              # 改动：注册 @tailwindcss/vite 插件
├── index.html                  # 改动：挂 Noto JP 字体（M0 的「留白」在此兑现）
├── src/
│   ├── main.tsx                # 改动：用 ThemeProvider 包住 App
│   ├── index.css               # 改动：主题变量体系 + 特效层 + 指示器样式
│   └── theme/                  # 新增目录
│       ├── themeStore.ts       # ThemeMode 类型、四张表、useThemeStore、applyBodyClass
│       ├── ThemeProvider.tsx   # body class 同步 + 快捷键分发 + Context 提供
│       ├── ThemeIndicator.tsx  # 顶栏六个圆点按钮
│       ├── ThemeOverlays.tsx   # 雨/雪特效层容器（条件挂载 Canvas）
│       └── overlays/
│           ├── RainCanvas.tsx  # 雨滴粒子（最小版）
│           └── SnowCanvas.tsx  # 雪花粒子（最小版）
```

**最终差异说明（先看清楚本里程碑的边界）：**
真实仓库的 `src/theme/` 里还有 `MoonCanvas.tsx`、`StarsCanvas.tsx`，以及 `ThemeOverlays.tsx` 中的月光层（moon-light-beam + 星星 + 月亮）；雨和雪的粒子也远比本卡做的最小版复杂——雨是三层不同深度、带落地水花（splash），雪是三层、每片雪花画六臂晶体结构、带辉光与风阵。**本里程碑只做「最小可用的雨 + 雪」**：颗粒是直的、雪是圆点。先把机制链路跑通（mode → body class → CSS 变量 → Canvas 条件挂载），复杂度全部留到「与最终代码的差异复盘」里对照。

数据流全貌（背下来，整章围绕它展开）：**操作 → `useThemeStore.mode`（persist）→ ThemeProvider effect → `applyBodyClass` → body class → CSS 变量重绘（400ms 过渡）；`mode` 同时决定 ThemeOverlays 是否挂载 Canvas。**

---

## Step 1 · 接入 Tailwind 4

Tailwind 4 的接入方式和 v3 完全不同：v3 需要 `tailwind.config.js` + PostCSS 配置 + 三条 `@tailwind` 指令；v4 把这些全部收编进一个 Vite 插件，CSS-first。

```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

**`vite.config.ts`**（改动后）：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3003",
    },
  },
});
```

**`src/index.css` 第一行**（其他内容 M10 后续步骤逐步加）：

```css
@import "tailwindcss";
```

**`index.html`**（M0 留白清单里承诺的字体，现在补上）：

```html
<!-- Google Fonts: Japanese Typography -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600&family=Noto+Serif+JP:wght@300;400;500;600&display=swap" rel="stylesheet">
```

**逐行讲解：**
- `plugins: [react(), tailwindcss()]`——插件挂进 Vite 转换管线：请求 CSS 时把 `@import "tailwindcss"` 展开成 theme/base/utilities 三层，且**只生成源码里实际出现的类名**（基于 Vite 模块图发现，不需要 v3 的 `content` glob，连 `postcss.config.js` 都不存在）。
- 「双轨制」是本项目的样式哲学：**原子类做布局间距**（Sidebar 的 `flex items-center`、`truncate flex-1 text-sm`），**语义化 CSS 类做皮肤**（`.app-sidebar-link` 等，颜色全引用 CSS 变量）。纯原子类写主题会陷入每个暗色变体都要 `dark:` 前缀的地狱；纯手写 CSS 又丢掉布局效率。
- 字体先 `preconnect` 再加载，省一次握手延迟；Noto JP 作日文回退（`--font-body` 主栈是等宽字体，Step 2 见）。

**验证：** `pnpm dev` 页面正常渲染（此时还没有主题变量，观感无变化）——「依赖装对、插件挂上、入口 import 生效」三步缺一就会白屏或样式全丢。

---

## Step 2 · CSS 变量主题体系（index.css 核心段）

原理一句话：把颜色抽成五个变量 `--bg / --text / --mid / --line / --accent`，全站样式只引用变量；切主题 = 给 `<body>` 换一个 class，class 里重新赋值变量，浏览器自动重绘所有引用处。**零 React 重渲染、零 JS 遍历 DOM。**

**`src/index.css`**（本里程碑的完整版，核心段）：

```css
@import "tailwindcss";

@property --bg { syntax: '<color>'; inherits: true; initial-value: #0b0d10; }
@property --text { syntax: '<color>'; inherits: true; initial-value: #b9b9b3; }
@property --mid { syntax: '<color>'; inherits: true; initial-value: #6d706f; }
@property --line { syntax: '<color>'; inherits: true; initial-value: #1f2224; }
@property --accent { syntax: '<color>'; inherits: true; initial-value: #7f8872; }

:root {
  --error-color: #b88484;
  --shadow-soft: none;
  --shadow-card: none;
  --font-body: "SF Mono", "Fira Code", "Cascadia Code", "Courier New", monospace;
  --font-ui: "SF Mono", "Fira Code", "Cascadia Code", "Courier New", monospace;
  --font-size-base: 15px;
  --line-height-body: 1.65;
}

body.midnight { --bg: #090909; --text: #b7b7b0; --mid: #555b62; --line: #17191c; --accent: #7a8fa6; }
body.light   { --bg: #f1eee8; --text: #1c1b19; --mid: #7f786d; --line: #d6d1c8; --accent: #867056; }
body.sunny   { --bg: #f6f0e3; --text: #26211c; --mid: #8a7761; --line: #ddd2c1; --accent: #b28b52; }
body.rain    { --bg: #4e565c; --text: #d7dce0; --mid: #99a1aa; --line: #667079; --accent: #b4c0cb; }
body.snow    { --bg: #dfe7ef; --text: #253241; --mid: #6b7a8c; --line: #c1cedb; --accent: #496076; }

*, *::before, *::after { box-sizing: border-box; }

html { font-size: var(--font-size-base); height: 100%; }

body {
  margin: 0;
  min-height: 100%;
  height: 100%;
  background: var(--bg);
  color: var(--text);
  --bg-paper: var(--bg);
  --bg-secondary: color-mix(in srgb, var(--bg) 92%, white 8%);
  --bg-sidebar: var(--bg);
  --ink-primary: var(--text);
  --ink-secondary: var(--mid);
  --ink-muted: color-mix(in srgb, var(--mid) 78%, var(--bg) 22%);
  --accent-primary: var(--accent);
  --accent-light: color-mix(in srgb, var(--accent) 82%, var(--text) 18%);
  --accent-subtle: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-secondary: color-mix(in srgb, var(--accent) 60%, var(--text) 40%);
  --border-color: var(--line);
  --border-light: color-mix(in srgb, var(--line) 72%, var(--bg) 28%);
  font-family: var(--font-body);
  transition: --bg 400ms ease, --text 400ms ease, --mid 400ms ease, --line 400ms ease, --accent 400ms ease;
  overflow: hidden;
  line-height: var(--line-height-body);
}

/* Light themes: mix with black for contrast (instead of white) */
body.light, body.sunny, body.snow { --bg-secondary: color-mix(in srgb, var(--bg) 93%, black 7%); }

#root {
  height: 100%;
  min-height: 100%;
}
```

**逐块讲解：**

1. **`@property` 五连——让变量可以过渡。** 普通 CSS 变量是「不透明字符串」，无法插值，`transition` 对它们无效。`@property --bg { syntax: '<color>'; inherits: true; initial-value: #0b0d10; }` 把变量注册成**有类型、可继承、有初值**的自定义属性，`body` 的 `transition: --bg 400ms ease, ...` 才有插值合法性——换肤平滑渐变而非生硬跳变。代价：每个要过渡的变量都须单独注册，本项目恰好只注册这五个。
2. **`:root` 双角色。** 前半段是**非颜色**的全局配置（错误色、阴影开关、字体栈、字号行高）；后半段的五色初值同时就是 **night 主题的配色**——night 不需要 body class，因为它的值就是 `@property` 的 `initial-value`，继承链上自动生效。
3. **五个 `body.xxx` 覆盖组——六套主题的五个值。** night 不占 class；其余五套各用一个 `body.xxx { --bg: …; … }` 覆盖。**新增一套主题 = 新增一段五行代码**。三个观察点：① 五变量各司其职——`--bg` 底色、`--text` 正文、`--mid` 次要文字、`--line` 边框分割线、`--accent` 强调色，任何主题都须五值齐全；② 浅色主题的 `--line` 明显比暗色亮——暗色靠「比背景更亮的边」分割，浅色相反；③ rain 是唯一的中等明度主题、文字用浅色——这套体系不预设非黑即白。

   五值一览（CSS 代码块上方已给出全部取值，这里只看模式到 class 的映射）：night 无 class；`day` 对应 `body.light` ⚠️（见下）；其余四套同名直映。

   ⚠️ **day → class 名是 `light`**：产品语义叫 day，CSS 类名却停留在早期版本的 `light`。为什么不改？`body.light { … }` 和下方浅色组选择器都依赖它，跨文件改名收益只是「名字好看」。项目选择把不一致**隔离在 `applyBodyClass` 的 switch 这一个映射点**（Step 3），其他代码只跟 mode 名打交道。

4. **`body` 派生层——用 `color-mix()` 从五色现算语义色。** 比如 `--bg-secondary: color-mix(in srgb, var(--bg) 92%, white 8%)` 混白提亮背景、`--accent-subtle: color-mix(in srgb, var(--accent) 12%, transparent)` 得到强调色淡背景。妙处：派生变量**来源仍是核心变量**，换主题自动跟着变，无需逐套手调；浅色主题还专门把 `--bg-secondary` 改成混黑——白底再混白会失去层次。账：五个手工维护的核心变量，换来十几个自动正确的衍生色。
5. **`overflow: hidden`**——全屏阅读布局的根基，配合 `#root { height: 100% }`，滚动发生在内部容器而非 body。

**验证：** DevTools → `document.body.classList.add('snow')` → 页面立即变浅色；再 `add('rain')` → 变灰蓝（后加 class 覆盖先加）；`document.body.classList = ''` → 回到 night。class 一换、全站变色——这套体系的魔力此刻亲手摸到。

---

## Step 3 · themeStore：模式状态 + 持久化 + body class 映射

**`src/theme/themeStore.ts`**（完整文件）：

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext, useContext } from 'react';

export type ThemeMode = 'night' | 'midnight' | 'day' | 'sunny' | 'rain' | 'snow';

export const MODES: ThemeMode[] = ['night', 'midnight', 'day', 'sunny', 'rain', 'snow'];

export const MODE_LABELS: Record<ThemeMode, string> = {
  night: 'Night',
  midnight: 'Moonlight',
  day: 'Day',
  sunny: 'Sunny',
  rain: 'Rain',
  snow: 'Snow',
};

export const MODE_SHORTCUTS: Record<ThemeMode, string> = {
  night: 'N',
  midnight: 'M',
  day: 'D',
  sunny: 'S',
  rain: 'R',
  snow: 'W',
};

export const KEY_MAP: Record<string, ThemeMode> = {
  n: 'night',
  m: 'midnight',
  d: 'day',
  s: 'sunny',
  r: 'rain',
  w: 'snow',
};

export interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'snow',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'baku-yomi-theme' }
  )
);

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export function applyBodyClass(mode: ThemeMode) {
  const body = document.body;
  body.classList.remove('midnight', 'light', 'sunny', 'rain', 'snow');

  switch (mode) {
    case 'night':
      break;
    case 'midnight':
      body.classList.add('midnight');
      break;
    case 'day':
      body.classList.add('light');
      break;
    case 'sunny':
      body.classList.add('sunny');
      break;
    case 'rain':
      body.classList.add('rain');
      break;
    case 'snow':
      body.classList.add('snow');
      break;
  }
}
```

**逐段讲解：**

- **类型先行。** `ThemeMode` 六字面量联合类型是唯一事实来源，`MODES`（渲染顺序）、`MODE_LABELS`（tooltip）、`MODE_SHORTCUTS`（提示文案）、`KEY_MAP`（按键→模式）四张表全由它派生；TS 会保证所有 switch 分支齐全。
- **store 只存一个 `mode` 字符串。** `persist` 把它序列化进 localStorage 的 `baku-yomi-theme` key，刷新后 rehydrate。**DOM 操作刻意排除在 store 外**——状态层纯净可测，副作用统一交给 Provider。
- **默认 `mode: 'snow'`，不是 night。** 真实仓库为此专门修过一次（commit `e9c1316`）：初版默认 night，产品想要的第一印象是明亮雪景。注意「默认值」只在**没有持久化数据**时生效——老用户存了 night 不会被新默认影响。
- **`applyBodyClass`——mode → body class 映射表。** 逐行读：
  - 先无条件 remove 全部候选 class 再 add，保证**幂等**（重复调用不残留）；
  - `night` 分支为空——颜色是 `@property` 初值，什么都不用加；
  - `day` 分支加的是 `light`——**mode 名 ≠ class 名**的唯一例外，隔离在这里；
  - **remove 列表是裸字符串数组，编译器不管它。** 新增主题时 TS 逼你补 switch 分支，但没人逼你补 remove 列表——忘了的话，切回 night 时旧 class 残留，之后任何模式都叠加那套变量值（同特异性下颜色取决于 CSS 顺序），隐性 bug。工程化防御：把 class 名清单抽成单一常量，remove/add 都从它取值。
- **`useTheme()` 为何在 Provider 外 throw？** Context 默认值是 `null`，忘包 Provider 时立刻报错而非渲染到一半崩掉——fail fast。

**验证（浏览器 Console）：**

```js
useThemeStore.getState().mode        // 需先 import；或用 devtools 观察
localStorage.getItem('baku-yomi-theme')  // {"state":{"mode":"snow"},"version":0}
```

此刻 body 还没有 class（Provider 未挂），手动调 `applyBodyClass('snow')` → body 出现 `snow`。

---

## Step 4 · ThemeProvider 挂载 + ThemeIndicator 圆点

**`src/theme/ThemeProvider.tsx`**（完整文件）：

```tsx
import { useEffect, type ReactNode } from 'react';
import { KEY_MAP, ThemeContext, applyBodyClass, useThemeStore } from './themeStore';
import { ThemeOverlays } from './ThemeOverlays';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  useEffect(() => {
    applyBodyClass(mode);
  }, [mode]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const nextMode = KEY_MAP[event.key.toLowerCase()];
      if (nextMode) {
        // Defer so other handlers (e.g. ReadingView's auto-read on 'r')
        // can call preventDefault first
        setTimeout(() => {
          if (!event.defaultPrevented) setMode(nextMode);
        }, 0);
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setMode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      <ThemeOverlays />
      {children}
    </ThemeContext.Provider>
  );
}
```

**`src/main.tsx`**（改动后）：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

**逐段讲解：**

- **数据流：persist 恢复/用户按键 → store.mode 变化 → effect 调 `applyBodyClass` → CSS 变量切换。** 第一个 effect 依赖 `[mode]`，首次挂载也跑一次——rehydrate 后把持久化主题写到 body 的时刻。`setMode` 不在此依赖里（zustand action 引用稳定，放进去只会反复重建监听器）。
- **快捷键 effect**（Step 6 细讲）：输入框守卫 + `setTimeout(0)` 延迟裁决。先记结论：**`r` 键同时是「自动朗读」和 Rain 主题的快捷键**，延迟到下一个宏任务检查 `event.defaultPrevented`，让阅读器 handler 先声明主权。
- **`<ThemeOverlays />` 放在 children 之前**——特效层是背景，先渲染保证 z 序在内容之下。
- **StrictMode 下 effect 双执行**：applyBodyClass 跑两遍——幂等设计第二次立功，classList 重复执行无副作用。

**`src/theme/ThemeIndicator.tsx`**（完整文件）：

```tsx
import { MODES, MODE_LABELS, MODE_SHORTCUTS, useTheme } from './themeStore';

export function ThemeIndicator() {
  const { mode, setMode } = useTheme();

  return (
    <div className="mode-indicator" aria-label="主题切换">
      {MODES.map((item) => (
        <button
          key={item}
          type="button"
          className={`mode-dot${item === mode ? ' active' : ''}`}
          data-mode={item}
          title={`${MODE_LABELS[item]} (${MODE_SHORTCUTS[item]})`}
          onClick={() => setMode(item)}
        />
      ))}
    </div>
  );
}
```

**TopBar 挂载**（M9 的 TopBar 加两处）：

```tsx
import { ThemeIndicator } from '../../theme/ThemeIndicator';
// ...
<div className="app-shortcuts">THEME N / M / D / S / R / W</div>
<ThemeIndicator />
```

**CSS**（追加到 index.css 末尾）：

```css
.mode-indicator {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.mode-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--mid);
  background: transparent;
  padding: 0;
}

.mode-dot.active, .mode-dot:hover {
  background: var(--accent);
  border-color: var(--accent);
}
```

**讲解：** 六个圆点由 `MODES` 数组 map 出来，当前模式的点加 `active` class 用 `--accent` 填充——注意圆点的「当前色」也来自主题变量，主题一变圆点自己跟着变。`title` 提示把快捷键带上，这是用户发现快捷键的第一入口。`onClick` 直接调 `setMode`，走的就是 Step 3 的 store → effect → body class 链路。

**验证：** 页面加载后 body 出现 `snow` class（默认主题生效）；点任意圆点 → body class 切换 + 全站颜色 400ms 平滑过渡；**刷新页面 → 主题保持**（persist 生效）。

---

## Step 5 · ThemeOverlays：Canvas 雨/雪粒子（最小版）

三层原理先讲清，再写代码：

1. **容器层**：`theme-overlay-layer` div 常驻 DOM，透明度由 CSS 控制（`body.rain .rain-overlay { opacity: 1 }`）——静态氛围便宜，常驻无妨。
2. **Canvas 层**：rAF 密集型的粒子动画**只在对应模式下挂载**（`mode === 'rain' ? <RainCanvas /> : null`）——切走即卸载，动画循环停止，CPU/GPU 归零。
3. **铁律**：`pointer-events: none`——再华丽的特效也不许挡住按钮。

**`src/theme/ThemeOverlays.tsx`**（本里程碑版本）：

```tsx
import { useTheme } from './themeStore';
import { RainCanvas } from './overlays/RainCanvas';
import { SnowCanvas } from './overlays/SnowCanvas';

export function ThemeOverlays() {
  const { mode } = useTheme();

  return (
    <>
      <div className="theme-overlay-layer rain-overlay" aria-hidden="true">
        <div className="rain-fog" />
        {mode === 'rain' ? <RainCanvas /> : null}
      </div>

      <div className="theme-overlay-layer snow-overlay" aria-hidden="true">
        <div className="snow-glow" />
        {mode === 'snow' ? <SnowCanvas /> : null}
      </div>
    </>
  );
}
```

**`src/theme/overlays/RainCanvas.tsx`**（最小版，完整文件）：

```tsx
import { useEffect, useRef } from 'react';

export function RainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d')!;
    let width = 0, height = 0, active = true, raf = 0;

    interface Drop { x: number; y: number; len: number; speed: number; alpha: number }
    const drops: Drop[] = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnDrops() {
      drops.length = 0;
      for (let i = 0; i < 120; i++) {
        drops.push({
          x: Math.random() * width,
          y: Math.random() * height,
          len: 8 + Math.random() * 12,
          speed: 12 + Math.random() * 8,
          alpha: 0.15 + Math.random() * 0.2,
        });
      }
    }

    function tick() {
      if (!active) return;
      context.clearRect(0, 0, width, height);

      for (const drop of drops) {
        context.beginPath();
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x, drop.y + drop.len);
        context.strokeStyle = `rgba(200,210,225,${drop.alpha})`;
        context.lineWidth = 1;
        context.lineCap = 'round';
        context.stroke();

        drop.y += drop.speed;
        if (drop.y > height) {
          drop.y = -drop.len;
          drop.x = Math.random() * width;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    spawnDrops();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
```

**`src/theme/overlays/SnowCanvas.tsx`**（最小版，完整文件）：

```tsx
import { useEffect, useRef } from 'react';

export function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d')!;
    let width = 0, height = 0, active = true, raf = 0, time = 0;

    interface Flake {
      x: number; y: number; size: number; speed: number;
      wobbleAmp: number; wobblePhase: number; wobbleSpeed: number; alpha: number;
    }
    const flakes: Flake[] = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnFlakes() {
      flakes.length = 0;
      for (let i = 0; i < 140; i++) {
        flakes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 1 + Math.random() * 3,
          speed: 0.5 + Math.random() * 1,
          wobbleAmp: 0.4 + Math.random() * 0.8,
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.01 + Math.random() * 0.02,
          alpha: 0.2 + Math.random() * 0.5,
        });
      }
    }

    function tick() {
      if (!active) return;
      context.clearRect(0, 0, width, height);
      time += 1;

      for (const flake of flakes) {
        flake.y += flake.speed;
        flake.x += Math.sin(flake.wobblePhase + time * flake.wobbleSpeed) * flake.wobbleAmp;

        if (flake.y > height) {
          flake.y = -flake.size;
          flake.x = Math.random() * width;
        }

        context.beginPath();
        context.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${flake.alpha})`;
        context.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    spawnFlakes();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
```

**Canvas 生命周期逐行讲解（两份代码完全同构，一次讲透）：**

- **`resize()` 与 devicePixelRatio。** CSS 像素和物理像素在 Retina 屏上不是 1:1：`canvas.width = width * dpr` 用物理像素开画布、`canvas.style.width` 用 CSS 像素铺视口、`context.setTransform(dpr, 0, 0, dpr, 0, 0)` 放大坐标系——之后绘图代码用 CSS 像素思考即可。不做这步高清屏上的雨丝会糊。
- **粒子数组一次建好、循环复用。** `spawnDrops()` 挂载时跑一次（`drops.length = 0` 兜底防重复调用）；tick 里越界即重置回顶部——**不 push 不 splice**，避免动画循环里分配内存触发 GC 卡顿。
- **`tick()`：清屏 → 画全部粒子 → 更新位置 → 请求下一帧。** `requestAnimationFrame` 与屏幕刷新率同步（约 60fps）；标签页切后台浏览器自动暂停——省电是浏览器帮的忙。
- **`active` 标志 + `cancelAnimationFrame` 双重保险。** 卸载时先置 `active = false`（已排队的 tick 直接 return），再 `cancelAnimationFrame(raf)` 取消未执行的帧，最后移除 resize 监听。**漏掉任一步 = 组件卸载后还在跑动画/监听**——StrictMode 双挂载会立刻暴露。
- **`useEffect` 空依赖 + `canvasRef`。** effect 挂载时跑一次，闭包持有全部状态（width/height/drops/raf），不与 React 渲染周期纠缠——Canvas 组件的标准形态：**React 只管挂载/卸载，每一帧由 Canvas 自己驱动**。

**CSS**（追加到 index.css）：

```css
.theme-overlay-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  transition: opacity 700ms cubic-bezier(0.23, 1, 0.32, 1);
}

.rain-overlay canvas, .snow-overlay canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

body.rain .rain-overlay { opacity: 1; }

.rain-fog {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 100%, rgba(70, 80, 95, 0.15) 0%, transparent 45%),
    radial-gradient(ellipse at 20% 85%, rgba(60, 70, 85, 0.08) 0%, transparent 35%),
    radial-gradient(ellipse at 80% 90%, rgba(55, 65, 80, 0.06) 0%, transparent 30%);
  animation: fogDrift 25s ease-in-out infinite alternate;
}

body.snow .snow-overlay { opacity: 1; }

.snow-glow {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(53, 67, 82, 0.22) 0%, rgba(70, 88, 109, 0.12) 35%, rgba(25, 34, 46, 0.08) 100%),
    radial-gradient(ellipse at 18% 18%, rgba(255, 255, 255, 0.34) 0%, transparent 38%),
    radial-gradient(ellipse at 82% 26%, rgba(240, 247, 255, 0.22) 0%, transparent 34%),
    radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.12) 0%, transparent 55%);
  animation: snowGlowPulse 8s ease-in-out infinite alternate;
}

@keyframes fogDrift {
  0% { transform: translateX(-1.5%); opacity: 0.7; }
  100% { transform: translateX(1.5%); opacity: 1; }
}

@keyframes snowGlowPulse {
  0% { opacity: 0.6; }
  100% { opacity: 1; }
}
```

**讲解：** `position: fixed + inset: 0` 铺满全屏；`pointer-events: none` 是装饰层铁律；`z-index: 0` 压在正文之下；`opacity` 700ms 过渡负责淡入淡出——Canvas 条件挂载下，切主题时容器还在（淡出中）、粒子已卸载，视觉是「雨停 + 雾散」的连贯效果而非骤停。`rain-fog`/`snow-glow` 是纯 CSS 渐变 + 动画的静态氛围，零 JS 成本；`aria-hidden="true"` 向读屏器隐藏纯装饰层。

**验证：** 点 Snow → 白点缓缓飘落；切 Rain → 雨丝下落；切回 Day → 粒子消失。DevTools Performance 对比 Snow 与 Day 模式——Day 下 rAF 调用量为零，条件挂载生效。

---

## Step 6 · 快捷键切换主题（KEY_MAP 分发）

键盘链路在 Step 4 的 ThemeProvider 里已经写好，这一步把它讲透 + 验证。

**核心代码回顾：**

```tsx
useEffect(() => {
  function handleKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const nextMode = KEY_MAP[event.key.toLowerCase()];
    if (nextMode) {
      // Defer so other handlers (e.g. ReadingView's auto-read on 'r')
      // can call preventDefault first
      setTimeout(() => {
        if (!event.defaultPrevented) setMode(nextMode);
      }, 0);
    }
  }

  document.addEventListener('keydown', handleKey);
  return () => document.removeEventListener('keydown', handleKey);
}, [setMode]);
```

**三个设计点逐个拆：**

1. **输入框守卫。** 事件对象上的 `target` 是实际获得焦点的元素。用户在输入框打字时按 `s`，target 是 INPUT——直接 return，绝不抢输入。阅读页的 `gi` 进入回译输入框后同理。
2. **`KEY_MAP[event.key.toLowerCase()]`——一次查询完成判断。** `event.key` 可能是 `'S'`（Shift 按下时）或 `'s'`，统一小写后查表；查不到返回 undefined 走 `if` 短路。KEY_MAP 是普通对象不是 Map，因为键就是六个小写字母，查找 O(1) 且字面量可读。
3. **`setTimeout(0)` 延迟裁决——单一按键的多方竞争。** 全章最值钱的一行。监听器注册顺序：ThemeProvider 在 main.tsx 最外层先挂，ReadingView 在组件树深处后挂——`r` 键同时命中「自动朗读」和 Rain 主题。如果立刻 `setMode('rain')`，主题先执行，阅读器的 `preventDefault`（M6 已实现）就白喊了。推迟到**下一个宏任务**：事件冒泡完、所有监听器跑过、`defaultPrevented` 定型后再查——阅读器声明主权就不换，没声明就换。隐含约束：**`r` 键永远只触发一个动作**。

**验证（阅读页，需要 M6 的代码在场）：**
1. 书架页按 `N/M/D/S/R/W` → 六个主题逐一切换，body class 同步变化。
2. 阅读页选中一句后按 `R` → **开始连续朗读而非切 Rain**（仲裁生效）；按 `W` → 正常切 Snow。
3. 回译输入框聚焦后按 `d` → 打出 `d`，主题纹丝不动（守卫生效）。
4. 刷新页面 → 主题保持（persist）。

至此六步全部落地，进入验收。

---

## 收尾验收清单

- [ ] `pnpm dev` 启动后，页面默认 Snow 主题（浅色雪景），body 有 `snow` class
- [ ] 顶栏六个圆点存在，当前主题的点以强调色填充，hover 有反馈
- [ ] 点圆点切换主题：全站颜色 400ms 平滑过渡（非跳变）
- [ ] 刷新页面后主题保持（localStorage `baku-yomi-theme`）
- [ ] Snow 主题下有白色粒子飘落；Rain 主题下有雨丝；其他主题无粒子（rAF 停止）
- [ ] 切换主题时特效层 700ms 淡入淡出，无粒子骤停断裂感
- [ ] 快捷键 `N/M/D/S/R/W` 全量可用；阅读页按 `R` 触发朗读而非切主题
- [ ] 输入框聚焦时按快捷键不触发主题切换
- [ ] 能讲出：为什么需要 `@property` / 为什么 day 对应 class `light` / 为什么 Canvas 要条件挂载 / `setTimeout(0)` 在仲裁什么
- [ ] `pnpm build`（tsc -b && vite build）通过

## 与最终代码的差异复盘

1. **缺月光层**：最终版还有 `.moon-overlay` 容器（moon-light-beam + stars-container + MoonCanvas），`body.midnight` 时淡入——月光主题是特效最重的一套。
2. **RainCanvas 升级**：最终版是**三层雨**（远 120 根细弱慢、中 150 根、近 70 根粗快亮），每根带 `drift` 斜向漂移、落地概率产生**水花**（椭圆扩散 + 衰减）。本卡只有单层直落。
3. **SnowCanvas 升级**：最终版按 `detail` 级别画**六臂晶体结构**（0/1/2 三级分支），带旋转、辉光（radial halo）和**风阵**（`getWind` 三正弦叠加模拟阵风）。本卡是圆点 + 简单摆动。
4. **静态氛围细化**：`rain-fog`/`snow-glow` 参数经多轮微调，另有 `moon-canvas-wrap::before` 的 `haloPulse` 14s 脉动光晕。
5. **index.css 其余 1300+ 行**：本卡只写了核心段；所有 `.app-*`、`.bookshelf-*` 类都引用你这里定义的语义变量——这套变量是它们的唯一颜色来源。
6. **默认主题**：真实初版默认 night，`e9c1316` 改成一个字符——`mode: 'snow'`。改动极小但影响所有新用户的第一印象。

## 设计注记（历史弯路）

- **主题一次加 6 个（`34b3f50`）。** 真实提交一步合入「6 themes with dynamic overlays (moon, rain, snow, stars)」——全套一次到位。AI 一步生成意味着没有「先变量、再指示器、再特效」的渐进过程；复刻拆 6 步是为了**每层机制单独可验证**——一次写完发现粒子不显示，你无法判断是 store 没通、选择器写错还是 Canvas 生命周期 bug。
- **night → snow 的一个字符修复（`e9c1316`）。** 「默认值」不是随便拍的：决定新用户的第一印象，还决定 WelcomeGuide 文案（「默认主题现在是 Snow」）。产品要「明亮雪景」，初版却是深色 night——一个字符的 diff，一次产品决策的修正。
- **`day → light` 命名错位。** 源头是早期只有 dark/light 二态，主题化改名 day 却没同步 CSS 类名。**取舍**：跨文件改名成本高、收益只是美观，把不一致隔离在 switch 单点。面试被问「为什么 day 对应 light」就讲这段。
- **快捷键冲突是真实发生过的。** `r` 键双绑定不是虚构——M6 先占 `r`（朗读），M10 后到。`setTimeout(0)` 仲裁是对「同键多监听器」的现实回应；顺序反过来冲突也一样。

## 下一步

进入 [M11 · 生产部署](./M11-deploy.md)——把「前端 5174 + 后端 3003」的双进程形态，收敛成「一个端口、一个镜像、一条命令」的生产形态。
