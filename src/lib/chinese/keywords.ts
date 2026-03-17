const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '和', '也', '都', '就', '不', '没',
  '有', '把', '被', '让', '给', '对', '从', '到', '向', '以',
  '于', '与', '而', '或', '但', '又', '才', '已', '会', '能',
  '可以', '要', '得', '着', '过', '这', '那', '你', '我', '他',
  '她', '它', '们', '很', '非常', '最', '更', '太', '还',
  '一个', '一些', '将', '地', '所', '如果', '因为', '所以',
  '虽然', '可是', '然后', '就是', '只是', '不过', '这个', '那个',
  '什么', '怎么', '为什么', '哪', '谁', '多', '少', '几',
]);

export function extractKeywords(chinese: string): string[] {
  const segments = segmenter.segment(chinese);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const { segment, isWordLike } of segments) {
    if (!isWordLike) continue;
    const word = segment.trim();
    if (!word || STOP_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }

  return keywords;
}

export function shuffleKeywords(keywords: string[]): string[] {
  const result = [...keywords];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
