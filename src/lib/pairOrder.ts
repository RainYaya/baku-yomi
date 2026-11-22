export type PairOrder = 'ja-zh' | 'zh-ja';

export const PAIR_ORDER_LABELS: Record<PairOrder, string> = {
  'ja-zh': '日中',
  'zh-ja': '中日',
};

/** The visible line order: index 0 is the primary line, index 1 the gloss. */
export function pairOrderLines(order: PairOrder): Array<'ja' | 'zh'> {
  return order === 'zh-ja' ? ['zh', 'ja'] : ['ja', 'zh'];
}
