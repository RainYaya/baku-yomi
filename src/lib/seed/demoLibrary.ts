import type { Book } from '../../types';
import { buildTextChapters } from '../import/textMaterial';

/**
 * First-run library.
 *
 * Everything here is either public domain in Japan or written for this demo.
 * Real books and newspaper columns stay out: the app stores user imports
 * locally, and shipping someone else's text to every visitor would be
 * redistribution, not a sample.
 */
const SEED_IMPORTED_AT = Date.UTC(2026, 10, 1);

interface SeedInput {
  id: string;
  title: string;
  author: string;
  description: string;
  text: string;
  collection?: boolean;
}

function makeSeedBook(input: SeedInput, order: number): Book {
  const { chapters, nextSeq } = buildTextChapters({
    bookId: input.id,
    text: input.text,
  });

  return {
    id: input.id,
    title: input.title,
    author: input.author,
    description: input.description,
    chapters,
    importedAt: SEED_IMPORTED_AT + order,
    source: input.collection ? { kind: 'collection' } : { kind: 'text' },
    chapterSeq: input.collection ? nextSeq : undefined,
    demo: true,
  };
}

const ASAGO_TEXT = `# 朝の光
朝の光は、部屋の隅までゆっくりと届く。
清晨的光，慢慢照到房间的每个角落。
急がなくても、一日はちゃんと始まる。
不必着急，一天也会好好开始。
コーヒーを一杯いれて、窓の外を見る。
泡一杯咖啡，望向窗外。
今日はどんな小さな発見があるだろう。
今天会有什么小小的发现呢。

# 言葉の温度
言葉には温度がある。
语言是有温度的。
同じ「ありがとう」でも、朝と夜では響きが違う。
同样是“谢谢”，早晨和夜晚听起来也不一样。
急いで言った言葉は冷たく、ゆっくり言った言葉は温かい。
匆忙说出的话是冷的，慢慢说出的话是温的。
今日は、一つだけ言葉を選んでみよう。
今天，就试着挑选一句话吧。

# 道草
帰り道、いつもより遠回りをした。
回家的路上，我比平时绕了远路。
知らない路地に、小さな花屋があった。
陌生的巷子里，有一家小小的花店。
店先に並ぶ花の名前を、一つずつ読んでみる。
我试着把店前摆着的花名一个个读出来。
急がなければ、街はもっと優しく見える。
只要不着急，街道看起来就会温柔许多。

# 雨の日
雨の日は、音が近くなる。
下雨天，声音会变得很近。
傘に当たる粒の音、遠くの車の音、自分の足音。
打在伞上的雨点声、远处的车声、自己的脚步声。
普段は聞こえないものが、急に主役になる。
平时听不见的东西，忽然成了主角。
だから雨の日は、少しだけ歩くのが遅くなる。
所以下雨天，我走路会稍微慢一点。

# 手紙
久しぶりに、手紙を書いてみた。
我久违地写了一封信。
書き出しの「拝啓」だけで、少し背筋が伸びる。
光是开头的“敬启”，就让人稍稍挺直了背。
伝えたいことは、案外少ない。
想说的话，意外地少。
それでも、書いてしまうと少し嬉しい。
可即便如此，写完之后还是有点开心。`;

const NEKO_TEXT = `# 吾輩は猫である（冒頭）
吾輩は猫である。名前はまだ無い。
我是一只猫。名字还没有。
どこで生れたかとんと見当がつかぬ。
在哪里出生的，我完全摸不着头脑。
何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。
只记得自己在一片昏暗潮湿的地方喵喵地哭着。
吾輩はここで始めて人間というものを見た。
我在这里第一次见到了所谓人类。
しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。
后来听说，那是个叫“书生”的人，在人类里算是最凶恶的一类。
この書生というのは時々我々を捕えて煮て食うという話である。
据说这种书生有时会抓住我们，煮了吃掉。
しかしその当時は何という考もなかったから別段恐しいとも思わなかった。
不过当时我什么也不懂，所以并不觉得特别可怕。
ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。
只是被放在他掌心里轻轻托起来时，有种轻飘飘的感觉。`;

const MEROS_TEXT = `# 走れメロス（冒頭）
メロスは激怒した。
梅洛斯愤怒了。
必ず、かの邪智暴虐の王を除かなければならぬと決意した。
他下定决心，一定要除掉那个邪恶暴虐的国王。
メロスには政治がわからぬ。
梅洛斯不懂政治。
メロスは、村の牧人である。
他是村里的牧人。
笛を吹き、羊と遊んで暮して来た。
他吹着笛子，与羊群嬉戏，就这样生活过来。
けれども邪悪に対しては、人一倍に敏感であった。
然而，对于邪恶，他比常人更加敏感。
今日未明、メロスは村を出発した。
今天天还没亮，梅洛斯就离开了村子。
父の妹の葬儀のためであった。
是为了参加父亲妹妹的葬礼。`;

const SEEDS: SeedInput[] = [
  {
    id: 'seed-asa-short',
    title: '朝の短評 · 示例',
    author: 'baku-yomi 示例',
    description: '五篇原创短评，示范“每天加一篇文章”的合集用法。',
    text: ASAGO_TEXT,
    collection: true,
  },
  {
    id: 'seed-neko',
    title: '吾輩は猫である（冒頭）',
    author: '夏目漱石',
    description: '公版作品节选，带中文对照。',
    text: NEKO_TEXT,
  },
  {
    id: 'seed-meros',
    title: '走れメロス（冒頭）',
    author: '太宰治',
    description: '公版作品节选，带中文对照。',
    text: MEROS_TEXT,
  },
];

export function buildDemoLibrary(): Book[] {
  return SEEDS.map((seed, index) => makeSeedBook(seed, index));
}
