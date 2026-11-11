# baku-yomi UI v2 — interaction spec

Status: approved direction (2026-11-10). This is the implementation contract for the reader workbench.

## 1. Product model

baku-yomi is a bilingual Japanese reader with back-translation practice. Reading is the default state; practice and explanation are deliberate second steps.

There are two practice depths, both kept:

1. **S1 · 句内随手练** — a practice card expands directly under the selected sentence, inside the reading column. No right rail. Best for 30 seconds to 2 minutes.
2. **S2 · 整页专注练** — a full-page desk: source sheet left, writing sheet center, AI feedback right. Best for 5 minutes or more.

They are the same sentence, the same draft, the same analysis. S1 is the quick surface; S2 is the focused surface.

## 2. State machine

One machine, `readerSessionMachine`, owns the surface and the practice phase.

```ts
type ReaderSurface = 'reading' | 'selected' | 'inline' | 'desk';
type ReaderPhase = 'idle' | 'analyzing' | 'reviewed' | 'failed';

interface ReaderSessionState {
  surface: ReaderSurface;
  pairId: string | null;
  phase: ReaderPhase;
  requestId?: number;
  message?: string;
}
```

Events:

- `SELECT { pairId, hasAnalysis }` — reading/selected → selected; if the same pair is selected again, go to reading.
- `DESELECT` / `CLOSE` — any → reading.
- `OPEN_INLINE` — selected → inline; phase preserved.
- `OPEN_DESK` — inline/selected → desk; phase preserved.
- `BACK` — desk → inline → selected → reading. Phase preserved.
- `SUBMIT { requestId }` — inline/desk → analyzing.
- `ANALYSIS_SUCCEEDED { requestId }` — analyzing → reviewed, gated by requestId.
- `ANALYSIS_FAILED { requestId, message }` — analyzing → failed, gated by requestId.

`j/k` only sends `SELECT`; it never opens a surface. `P` sends `OPEN_INLINE`. `Shift+P` or the card's `练习桌 ↗` sends `OPEN_DESK`. `Esc` sends `BACK`; from `selected` it sends `DESELECT`.

## 3. Surfaces

### Reading

- The sentence cards are the only content. Selection is a quiet highlight plus a left bar.
- A selected card shows a small action row: `練習 P`, `講解 E`, `练习桌 ⇧P`.
- Clicking a sentence selects it; clicking it again deselects. Text selection does not select the card.
- `j/k` moves the selection and keeps it in view with scrolloff. It never opens a card.

### S1 · Inline practice card

Rendered immediately after the selected sentence, inside the reading column.

- Header: tabs `練習` / `講解`; `第 N 句`; `练习桌 ↗`; `收起 Esc`.
- Practice tab:
  - Pinned source: Japanese + Chinese, always visible. A `遮住原文` toggle can blur the Japanese for strict recall; off by default.
  - Composer: textarea, character count, `Ctrl + Enter` submit.
  - Feedback: score, notes, provenance; `追问` link.
  - Secondary actions: `获取提示`, `编辑译文`, `添加笔记`.
- Explain tab:
  - Pinned sentence and selected fragment immediately, before the answer.
  - Action chips: 读懂 / 拆句 / 用法 / 语感; depth toggle.
  - Streaming status with a cancel button; timeout after 45 s with retry.
  - Anchored units after completion; provenance note.
- The card is in the reading flow, so the sentences before and after stay visible.

### S2 · Practice desk

A full-page surface, rendered over the reader. The reader stays mounted underneath, preserving scroll.

- Topbar: brand, `阅读 / 練習` switch, book/chapter, progress, settings.
- Source sheet: pinned Japanese + Chinese, previous/next sentence, `在原文中定位`.
- Writing sheet: prompt, large ruled composer, `提交批改`, `获取提示`, `Esc 回到句内卡片`.
- Feedback sheet: score, notes, provenance, `追问这一条`.
- Explain tab: the same explain content as S1, occupying the center/right area; the source sheet stays pinned.

## 4. Persistence

- Draft: `practiceStore.translations[pairId]`, already persisted.
- Analysis: `practiceStore.analyses[pairId]`, already persisted.
- Notes/hints: existing stores.
- Surface: transient; not persisted. Reopening the app starts in reading.
- Scroll position: existing chapter progress; returning from S2 restores the reading scroll.
- The selected pair and last surface can be remembered in memory while the session is alive; do not persist across reloads.

## 5. Explain request lifecycle

- `useExplain` owns one request at a time, gated by `requestId`.
- On start: show the pinned source and a `正在生成讲解…` status immediately.
- On delta: append text; keep the newest text in view.
- On completion: anchor units, strip the unit table from the prose, show provenance.
- On failure: plain-language message + retry.
- On timeout (45 s): abort, show `讲解生成超时，请重试`, allow retry.
- On unmount or surface change: abort.
- Escape closes the explain tab / returns to practice; it never leaves the card open with no exit.

## 6. Visual system

Two themes, one structure:

- **Paper** (light): warm desk `#e5ddcd`, paper `#fbf6ea`, ink `#2b2620`, red `#c4553d`, hand-written labels, serif Japanese/Chinese reading faces.
- **Night** (dark): ground `#12100e`, surface `#1a1714`, ink `#efe6d8`, amber `#d9a441`, same layout and hierarchy.

The old six weather themes and canvas overlays are removed. The theme control becomes a labeled `纸张 / 夜读` switch, not six unlabeled dots.

## 7. Accessibility requirements

- Import is a real button that triggers a hidden file input; keyboard users can import.
- Settings, welcome guide, and shortcut help are dialogs with `role="dialog"`, `aria-modal`, focus trap, and initial focus.
- Theme control is labeled and at least 24×24; primary controls at least 44×44 where practical.
- Text contrast meets WCAG AA (4.5:1 normal text) in both themes.
- `prefers-reduced-motion` disables transitions, pulses, and any remaining canvas animation.
- Every icon-only button has an accessible name.
- Error messages are visible text with a retry, never console-only or raw JSON.

## 8. Implementation phases

1. **Core surface** — new reader session machine, inline card, desk, remove the old right rail; build passes.
2. **Themes** — paper/night tokens, theme switch, remove weather overlays.
3. **Explain** — pinned source, timeout/cancel, embedded tabs, Escape.
4. **Accessibility & errors** — dialogs, import, contrast, touch targets, reduced motion, visible TTS/analysis errors.
5. **Verification** — build, tests, live app screenshots at 1440×900 and 1024×768.

## 9. Non-goals

- No drill/workbook mode, no forced next-sentence progression.
- No queue of sentences in the desk; one sentence at a time.
- No mobile-first redesign; desktop is the target, but the layout must not overflow at 1024×768.
- Do not rewrite the AI provider, Bilibili free endpoint, or explain prompts; keep the current uncommitted API/explain work.

---

## See also

- `docs/design/ui-refactor-playbook.md` — the reusable process behind this spec: brief, toolchain, artboards, verification, and templates.
