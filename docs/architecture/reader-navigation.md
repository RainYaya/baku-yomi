# 阅读器 j/k 导航

## 目标

`j` / `k` 应该像 Vim 的 `j` / `k`：选中句在可视区域内移动，页面只在必要时滚动；按住键时连续移动，不要排队一串互相打断的动画。

## 行为

| 操作 | 滚动方式 |
|---|---|
| 单击句子卡片 | 不滚动（避免打断文本选择） |
| 单次 `j` / `k` | 选中句进入「舒适带」边缘时才滚动，距离最小，`behavior: 'smooth'` |
| 按住 `j` / `k`（`event.repeat`） | 立即滚动（`behavior: 'auto'`），不排队动画 |
| 连续朗读自动切句 | 居中滚动（`scrollPairToCenter`） |
| 书签跳转 | 居中滚动（`scrollPairToCenter`） |

「舒适带」取视口高度的 18%，限制在 48–140px：

```ts
const margin = Math.min(140, Math.max(48, containerRect.height * 0.18));
```

选中的句子只要还在 `top + margin` 到 `bottom - margin` 之间就不滚动；越界时只滚动越界的距离。这对应 Vim 的 `scrolloff` 和 VS Code 的 `cursorSurroundingLines` 思路，也是虚拟列表 `scrollToIndex({ align: 'auto' })` 的默认行为。

实现位置：`src/components/reader/ReadingView.tsx` 的 `scrollPairIntoView`。

## 性能措施

1. **阅读进度节流**
   - 滚动事件只在「当前索引变化」时记录，最多每 200ms 写一次 store。
   - 切换章节/卸载时 flush 最后一次进度，不丢数据。
2. **持久化合并**
   - `src/lib/debouncedStorage.ts` 把 300ms 内的多次 `localStorage.setItem` 合并为一次。
   - `book-store`、`practice-store`、`settings-store` 都用它；`pagehide` / `beforeunload` 时 flush。
   - 这解决的是「每滚一像素就把整本书 + 封面 data URL 写进 localStorage」的问题。
3. **减少卡片重渲染**
   - `SentencePairCard` 用 `memo` 包装。
   - 所有卡片共享同一个稳定的 `handleCardSelect`，不再为每张卡片创建内联 `onSelect` / `ref` 回调。
   - DOM 查询改为 `[data-pair-id]`，不再维护 `pairRefs` Map。
4. **CSS**
   - `.reader-sentence-card` 加 `contain: layout paint`，让每句的布局/绘制互不影响。
   - 选中态只过渡颜色（`transition-colors`），不再 `transition-all`。

## 验证

在 500px 高的视口下（强制滚动）测量：

| 操作 | 结果 |
|---|---|
| `j` × 5 | scrollTop `0 → 34 → 132 → 258 → 356`，选中句始终在 62–285px 的舒适带内 |
| `k` × 3 | 反向回到 `354 → 257 → 159` |
| 按住 `j` | 立即移动，到章节末尾停止 |
| 5 次 `j` 期间 localStorage 写入 | 2 次（合并后），而不是每次滚动一次 |
| 刷新后 | 译文、进度、设置都保留 |

自动化浏览器的原生 smooth scroll 被禁用，所以测试时把 `behavior: 'smooth'` 临时改成 `'auto'` 来验证目标计算；真实浏览器里单次 `j`/`k` 走原生平滑滚动。

## 可调参数

- 舒适带比例：`0.18`（视口高度的 18%）
- 舒适带上下限：`48px` / `140px`
- 进度节流：`200ms`
- 持久化合并：`300ms`

如果仍觉得单次移动太慢，可以把单次 `j/k` 也改成 `behavior: 'auto'`（纯 Vim 手感）；如果觉得太快，可以调大舒适带比例。
