/**
 * Prompts for the reading explanation feature.
 *
 * Design notes, learned from probing the free B站 model directly:
 *
 * - The model is a *translator* first. Left alone it will translate the
 *   fragment and stop. Every prompt therefore states the task, the output
 *   shape, and an explicit "do not just translate" guard.
 * - It follows heading contracts very reliably (`### X`), so the prose is
 *   shaped by headings rather than free-form, which also makes the renderer
 *   predictable.
 * - It will happily invent table rows. The table contract is therefore
 *   strict: quote verbatim, source order, no overlaps, and `unknown` when
 *   unsure. `anchor.ts` enforces the rest.
 * - It mirrors the language of the prompt, so the target language has to be
 *   named explicitly rather than implied.
 */
import type { ExplainAction, ExplainDepth, ExplainRequest } from '../../types';

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  'ja-JP': '日本語',
  en: 'English',
  ko: '한국어',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES['zh-Hans'];
}

const DEPTH_RULE: Record<ExplainDepth, string> = {
  concise: '简洁模式：正文控制在 150～250 字，只讲真正影响理解的部分。',
  detailed: '详细模式：可以展开到 400～600 字，逐层说明，但不要复述原文。',
};

const ACTION_RULES: Record<ExplainAction, string> = {
  meaning: `
用两个标题组织回答：

### 大意
用一句自然的话直接说出这段内容在讲什么。不要逐词翻译，不要重复原文。

### 关键点
1～3 条，只写真正会让人读错或读不懂的地方：省略了什么、指代谁、语气是什么。`.trim(),

  grammar: `
回答分两部分，**顺序不能变**。

第一部分：成分表（必须最先输出）

| Text | POS | Role | Meaning |
|------|-----|------|---------|
| （逐字复制原文片段） | 词性 | 作用 | 含义 |

规则：
- Text 必须从「原文」里**逐字复制**一段连续片段，按原文顺序排列，前后不重叠、不遗漏。
- 不要编造原文里没有的字，不要把词拆成两半，助词/助动词留在它所属的短语里。
- POS 用简短词性标签：名词 / 动词 / 形容词 / 助词 / 助动词 / 副词 / 接续词 / 连体词 / 名词短语 / 动词短语 …
- Role 先用一个短标签（主语 / 谓语 / 宾语 / 修饰语 / 状语 / 补语 / 主题 / 条件 / 引用 …），再用逗号接一句解释。
- Meaning 用目标语言写这一小段的意思。
- 最多 12 行。选中只是一个词或短语时，就只拆它本身，不要虚构整句。
- 拿不准就写 unknown，不要猜。

第二部分：正文（表格之后）

### 主干
先引用最简的主谓（或主题—述语）结构，一句话说清它的意思。

### 关键点
只讲 1～2 个最有帮助的语法关系，例如活用、接续、修饰范围。

如果选中的只是一个词或短语，就只说明它本身的结构与词性，**不要虚构完整句子、主语或从句**。

即使选了「简洁」模式，成分表也必须完整输出——它是这个动作的主体，正文可以短，表不能省。`.trim(),

  usage: `
用三个标题组织回答：

### 表达
挑出 1～2 个真正值得学的表达，写出它在**这一句里**的意思。

### 怎么用
说明常见搭配、接续方式和语感（正式 / 口语 / 书面 / 略带情绪）。如果它有容易混用的近义表达，点一句区别。

### 例句
给 2 个自然的日语例句，附目标语言的简短释义。例句必须是新造的，不要冒充原文语境。`.trim(),

  nuance: `
用三个标题组织回答：

### 字面
这句话字面上说了什么，一句话即可。

### 言外之意
说话人真正的态度：委婉、不满、客气、试探、强调……并指出是哪个词或哪种句式造成了这种语感。

### 换一种说法
给 1～2 个语感不同但意思接近的说法，并说明差别在哪里。`.trim(),
};

export function buildExplainSystemPrompt(request: ExplainRequest): string {
  const language = languageName(request.targetLanguage);
  return [
    '你是一位日语精读老师，正在帮一位中文母语的学习者读懂一句日语。',
    `用${language}解释，标题也用${language}。引用的原文片段和例句保持日语原文。`,
    DEPTH_RULE[request.depth],
    '直接从分析开始，不要寒暄，不要说「我将分析」，不要复述任务。',
    '用 **粗体** 突出少量关键概念，用 `原文片段` 标明依据。不要把整段都加粗。',
  ].join('\n');
}

export function buildExplainPrompt(request: ExplainRequest): string {
  const fragment = request.fragment.trim();
  const sentence = request.sentence.trim();
  const hasFragment = fragment.length > 0 && fragment !== sentence;

  const parts = [`## 任务\n${ACTION_RULES[request.action]}`];

  parts.push(`## 原文\n${sentence}`);

  if (hasFragment) {
    parts.push(
      `## 选中片段\n${fragment}\n\n重点解释这个片段在整句里的作用；整句只作为上下文，不要整句重讲。`
    );
  } else {
    parts.push('## 选中范围\n整句。');
  }

  return parts.join('\n\n');
}

/**
 * A follow-up turn. Kept separate so the conversation can be replayed with
 * the original answer as context instead of re-deriving it.
 */
export function buildFollowUpPrompt(question: string): string {
  return [
    '## 追问',
    question.trim(),
    '',
    '针对上面的讲解回答，只回答这个追问，不要重复已经说过的内容。如果问题超出了这句原文能支持的范围，直接说明。',
  ].join('\n');
}
