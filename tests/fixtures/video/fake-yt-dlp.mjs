// A stand-in for yt-dlp used by tests and manual checks. It never touches the
// network: it writes a small Japanese VTT into the `-o` directory and prints
// the same four metadata lines the real command prints.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const template =
  outputIndex >= 0 ? args[outputIndex + 1] : join(process.cwd(), '%(id)s.%(ext)s');
const directory = template.slice(0, template.lastIndexOf('/'));
const id = 'abcdefghijk';

writeFileSync(
  join(directory, `${id}.ja.vtt`),
  `WEBVTT

00:00:01.000 --> 00:00:03.000
こんにちは。

00:00:03.500 --> 00:00:05.000
元気ですか？
`
);

process.stdout.write(
  `散歩VLOG\nあかね\n642\nhttps://i.ytimg.com/vi/${id}/hq.jpg\n`
);
