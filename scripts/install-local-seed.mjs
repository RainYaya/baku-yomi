#!/usr/bin/env node
/**
 * Install a scraped album as this deployment's local default library.
 *
 * Copies the Markdown to public/default-library.md and writes the manifest
 * public/default-library.json. Both files are gitignored, so the data stays on
 * this machine while every browser that opens the deployment (including a
 * phone on the same LAN) receives it on first load.
 *
 * Usage:
 *   pnpm seed:local
 *   pnpm seed:local -- --source local-data/wechat-album-123.md
 *   pnpm seed:local -- --title "天声人语" --id local-tenseijingo
 */
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DATA = path.join(ROOT, "local-data");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function latestAlbum() {
  const entries = await readdir(LOCAL_DATA).catch(() => []);
  const files = entries.filter(
    (name) => name.startsWith("wechat-album-") && name.endsWith(".md")
  );
  if (files.length === 0) return null;

  let best = null;
  for (const name of files) {
    const full = path.join(LOCAL_DATA, name);
    const info = await stat(full);
    if (!best || info.mtimeMs > best.mtimeMs) best = { full, mtimeMs: info.mtimeMs };
  }
  return best?.full ?? null;
}

async function main() {
  const sourceArg = option("source", "");
  const discovered = sourceArg ? null : await latestAlbum();
  if (!sourceArg && !discovered) {
    throw new Error(
      "local-data/ 里没有 wechat-album-*.md。先运行 pnpm import:wechat。"
    );
  }

  const source = path.resolve(ROOT, sourceArg || discovered);
  const title = option("title", "天声人语");
  const id = option("id", "local-tenseijingo");

  const info = await stat(source).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`找不到源文件：${source}`);
  }

  await mkdir(PUBLIC, { recursive: true });
  const manifest = {
    books: [
      {
        id,
        title,
        author: "合集",
        kind: "collection",
        file: "/default-library.md",
      },
    ],
  };

  await copyFile(source, path.join(PUBLIC, "default-library.md"));
  await writeFile(
    path.join(PUBLIC, "default-library.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  // If a production build already exists, refresh it too so `pnpm start`
  // picks up the data without a rebuild.
  const distExists = await stat(DIST).then(() => true).catch(() => false);
  if (distExists) {
    await copyFile(source, path.join(DIST, "default-library.md"));
    await writeFile(
      path.join(DIST, "default-library.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8"
    );
  }

  console.log(`已安装：${path.relative(ROOT, source)}`);
  console.log(`  合集：${title}（${id}）`);
  console.log(`  文件：public/default-library.md`);
  console.log(`  清单：public/default-library.json`);
  if (distExists) console.log("  已同步到 dist/，重启服务即可生效。");
  else console.log("  开发模式重启 Vite 即可；生产模式先 pnpm build。");
  console.log("  手机打开同一部署地址，首次进入会自动加载这份合集。");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
