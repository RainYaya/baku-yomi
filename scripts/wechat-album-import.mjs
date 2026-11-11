#!/usr/bin/env node
/**
 * Local-only WeChat album importer.
 *
 * It uses Kaze's browser session to read article pages (server-side fetch is
 * blocked by WeChat's verification page), then writes:
 *   local-data/wechat-album-<albumId>.json  structured articles
 *   local-data/wechat-album-<albumId>.md    one "# title" chapter per article
 *
 * The output is personal reading material. local-data/ is gitignored; do not
 * commit it or ship it as the app's default data.
 *
 * Usage:
 *   pnpm import:wechat
 *   node scripts/wechat-album-import.mjs
 *
 * Optional overrides:
 *   WECHAT_ALBUM_URL=...        another album
 *   WECHAT_LIMIT=60             more articles
 *   WECHAT_TITLE_INCLUDES=""    keep every item in the album
 *   WECHAT_FRESH=1              ignore the existing JSON and scrape again
 *   KAZE_MCP=...                another kaze-mcp.cmd path
 *
 * Kaze must be running with Settings -> External Agents enabled. The script
 * resumes: rerunning it only fetches articles missing from the JSON.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CONFIG = {
  albumUrl:
    process.env.WECHAT_ALBUM_URL ||
    "https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzU1NDQ5NDIwNQ==&action=getalbum&album_id=1517697240977440769&scene=173&from_msgid=2247526887&from_itemidx=1&count=3&nolastread=1",
  /** Stop after this many matching articles. */
  limit: Number(process.env.WECHAT_LIMIT || 30),
  /** Keep only titles containing this string; set to "" to keep everything. */
  titleIncludes:
    process.env.WECHAT_TITLE_INCLUDES === undefined
      ? "天声人语・有声版"
      : process.env.WECHAT_TITLE_INCLUDES,
  /** "oldest" reverses the newest-first album so the collection reads forward. */
  order: process.env.WECHAT_ORDER || "oldest",
  /** Milliseconds between article pages. */
  delayMs: Number(process.env.WECHAT_DELAY_MS || 1200),
  /** Articles per browser batch. */
  batchSize: Number(process.env.WECHAT_BATCH_SIZE || 5),
  /** Set WECHAT_FRESH=1 to ignore the existing JSON and scrape everything again. */
  fresh: process.env.WECHAT_FRESH === "1",
};

const KAZE_BRIDGE =
  process.env.KAZE_MCP ||
  "C:\\Users\\Neal\\AppData\\Roaming\\Kite\\bin\\kaze-mcp.cmd";
const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "local-data"
);

class McpClient {
  constructor(command) {
    this.child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.buffer = "";
    this.stderr = "";
    this.pending = new Map();
    this.nextId = 1;

    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.child.on("exit", (code) => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(
          new Error(
            `Kaze bridge exited (${code}). ${this.stderr.slice(0, 400)}`
          )
        );
      }
      this.pending.clear();
    });
  }

  onData(chunk) {
    this.buffer += chunk.toString();
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id == null || !this.pending.has(message.id)) continue;
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  }

  request(method, params, timeoutMs = 600_000) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
    return promise;
  }

  notify(method, params) {
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
    );
  }

  async init() {
    await this.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "baku-yomi-wechat-import", version: "1.0" },
      },
      30_000
    );
    this.notify("notifications/initialized", {});
  }

  async tool(name, args, timeoutMs = 600_000) {
    const result = await this.request(
      "tools/call",
      { name, arguments: args },
      timeoutMs
    );
    const text = (result?.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    if (result?.isError) throw new Error(text || `tool ${name} failed`);
    return text;
  }

  async js(code, timeoutMs = 600_000) {
    const text = await this.tool(
      "js",
      { code, timeoutMs, maxChars: 120_000 },
      timeoutMs + 30_000
    );
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Kaze can prepend Node warnings to the REPL result; keep the JSON part.
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
          return text;
        }
      } else {
        return text;
      }
    }
    if (parsed?.ok === false) {
      throw new Error(
        parsed.error?.message || JSON.stringify(parsed.error ?? parsed)
      );
    }
    return parsed?.value ?? parsed;
  }

  close() {
    this.child.kill();
  }
}

const INIT_CODE = String.raw`
const cfg = globalThis.__bakuConfig;
const parsed = new URL(cfg.albumUrl);
const biz = parsed.searchParams.get("__biz");
const albumId = parsed.searchParams.get("album_id");
if (!biz || !albumId) throw new Error("albumUrl 需要包含 __biz 和 album_id");

const fs = await import("node:fs/promises");
const path = await import("node:path");
await fs.mkdir(cfg.outputDir, { recursive: true });
const jsonPath = path.join(
  cfg.outputDir,
  "wechat-album-" + albumId + ".json"
);

let existingArticles = [];
try {
  const existing = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  existingArticles = Array.isArray(existing.articles) ? existing.articles : [];
} catch {
  existingArticles = [];
}
const done = new Set(
  existingArticles.map(
    (article) => String(article.msgid) + "_" + String(article.itemidx)
  )
);

const matching = [];
const seen = new Set();
let beginMsgid = "";
let beginItemidx = "";
let pageCount = 0;

while (matching.length < cfg.limit && pageCount < 60) {
  const api = new URL("https://mp.weixin.qq.com/mp/appmsgalbum");
  api.searchParams.set("action", "getalbum");
  api.searchParams.set("__biz", biz);
  api.searchParams.set("album_id", albumId);
  api.searchParams.set("f", "json");
  api.searchParams.set("count", "10");
  if (beginMsgid) {
    api.searchParams.set("begin_msgid", beginMsgid);
    api.searchParams.set("begin_itemidx", beginItemidx);
  }

  const response = await fetch(api);
  const json = await response.json();
  const list = json?.getalbum_resp?.article_list ?? [];
  if (!list.length) break;

  for (const item of list) {
    if (matching.length >= cfg.limit) break;
    const key = String(item.msgid) + "_" + String(item.itemidx);
    if (seen.has(key)) continue;
    seen.add(key);
    if (cfg.titleIncludes && !String(item.title).includes(cfg.titleIncludes)) {
      continue;
    }
    matching.push({
      title: String(item.title).trim(),
      url: String(item.url).replace(/^http:/, "https:").replace(/#rd$/, ""),
      msgid: String(item.msgid),
      itemidx: String(item.itemidx),
      createTime: Number(item.create_time) || 0,
    });
  }

  const last = list[list.length - 1];
  if (!last) break;
  if (String(last.msgid) === beginMsgid && String(last.itemidx) === beginItemidx) {
    break;
  }
  beginMsgid = String(last.msgid);
  beginItemidx = String(last.itemidx);
  if (Number(json?.getalbum_resp?.continue_flag) !== 1) break;
  pageCount += 1;
  await new Promise((resolve) => setTimeout(resolve, 400));
}

if (cfg.order === "oldest") matching.reverse();

const articles = cfg.fresh
  ? matching
  : matching.filter(
      (article) =>
        !done.has(String(article.msgid) + "_" + String(article.itemidx))
    );

const tab = await browser.tabs.new(
  "data:text/html,<title>baku-yomi import</title>"
);
globalThis.__bakuImporter = {
  cfg,
  biz,
  albumId,
  articles,
  existingArticles,
  tab,
  results: [],
  failures: [],
  index: 0,
};

({
  total: articles.length,
  existing: existingArticles.length,
  first: articles[0]?.title ?? null,
  last: articles[articles.length - 1]?.title ?? null,
});
`;

const BATCH_CODE = String.raw`
const state = globalThis.__bakuImporter;
const batch = [];

while (batch.length < state.cfg.batchSize && state.index < state.articles.length) {
  const article = state.articles[state.index];
  state.index += 1;

  try {
    await state.tab.goto(article.url, {
      waitUntil: "load",
      timeoutMs: 45_000,
    });
    await state.tab
      .expect(
        { target: { selector: "#js_content" }, visible: true },
        { timeoutMs: 30_000 }
      )
      .catch(() => null);

    const data = await state.tab.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        return element && element.innerText ? element.innerText.trim() : "";
      };
      const content = document.querySelector("#js_content");
      if (!content) {
        return {
          missing: true,
          captcha: document.body.innerText.includes("环境异常"),
        };
      }
      const lines = content.innerText
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return {
        missing: false,
        captcha: false,
        pageTitle: read("#activity-name") || read(".rich_media_title"),
        account: read("#js_name"),
        publishTime: read("#publish_time"),
        lines,
      };
    });

    if (data.missing) {
      throw new Error(data.captcha ? "需要人工验证" : "没有找到正文");
    }

    const entry = {
      ...article,
      ...data,
      title: data.pageTitle || article.title,
    };
    batch.push(entry);
    state.results.push(entry);
  } catch (error) {
    state.failures.push({
      title: article.title,
      url: article.url,
      error: String(error && error.message ? error.message : error),
    });
  }

  await new Promise((resolve) => setTimeout(resolve, state.cfg.delayMs));
}

({
  done: state.results.length,
  total: state.articles.length,
  failures: state.failures.length,
  next: state.articles[state.index]?.title ?? null,
});
`;

const FINISH_CODE = String.raw`
const state = globalThis.__bakuImporter;
const fs = await import("node:fs/promises");
const path = await import("node:path");
await fs.mkdir(state.cfg.outputDir, { recursive: true });

const noise = [
  /^欢迎来到今天的天声人语$/,
  /^感谢下面同学义务提供稿件$/,
  /^(总负责人|翻译|朗读|校对|编辑|责任编辑|音频|制作|排版|监制|主播|录音)[：:]/,
  /^▲.*(不代表本公众号立场|仅供日语学习使用)/,
  /^图片来源[:：]/,
  /^点击上方.*(关注|蓝字)/,
  /^(往期推荐|往期回顾|相关阅读)/,
  /^(声明|版权声明)[：:]/,
  /^(微信号|公众号)[：:]/,
  /^(长按|扫描|识别).*(二维码|关注)/,
  /^(分享|收藏|点赞|在看|广告)$/,
  /^(预览时标签不可点|继续滑动看下一个|向上滑动看下一个|知道了|取消|允许)$/,
  /^微信扫一扫$/,
  /^使用完整服务$/,
  /^轻点两下取消(赞|在看)$/,
  /^视频$/,
  /^小程序$/,
];

const stop = [
  /^单词解析$/,
  /^単語解析$/,
  /^语法解析$/,
  /^文法解析$/,
  /^（完）$/,
  /^\(完\)$/,
  /^END$/,
  /^原文版权/,
  /^天声人语原文版权/,
  /^天声人语本日推送/,
  /^天声人语正版资源/,
  /^天声人语翻译直播课/,
  /^更多精彩推荐/,
  /^往期推荐/,
  /^往期回顾/,
  /^●/,
  /^扫描/,
  /^扫码/,
  /^QQ群/,
  /^微信添加/,
  /^想要加入/,
  /^还不赶快/,
  /^每月只需要/,
  /^课前预习/,
  /^学习翻译技巧/,
  /^西安外国语大学/,
  /^初心联盟/,
  /^未经允许/,
  /^版权归/,
  /^本文图片/,
  /^https?:\/\//,
  /^（也可复制链接/,
];

const cleanLines = (lines) => {
  const output = [];
  for (const raw of lines) {
    const line = String(raw).replace(/[▼▽]\s*$/, "").trim();
    if (!line) continue;
    if (stop.some((pattern) => pattern.test(line))) break;
    if (noise.some((pattern) => pattern.test(line))) continue;
    if (!/[A-Za-z一-龯ぁ-んァ-ヶー]/.test(line)) continue;
    if (output[output.length - 1] === line) continue;
    output.push(line);
  }
  return output;
};

const merged = [...state.existingArticles, ...state.results];
const byKey = new Map();
for (const entry of merged) {
  byKey.set(String(entry.msgid) + "_" + String(entry.itemidx), entry);
}
const ordered = [...byKey.values()].sort(
  (a, b) => (Number(a.createTime) || 0) - (Number(b.createTime) || 0)
);
const articles = ordered.map((entry) => ({
  title: entry.title,
  url: entry.url,
  msgid: entry.msgid,
  itemidx: entry.itemidx,
  createTime: entry.createTime,
  publishTime: entry.publishTime || "",
  account: entry.account || "",
  paragraphs: Array.isArray(entry.paragraphs)
    ? entry.paragraphs
    : cleanLines(entry.lines || []),
}));

const payload = {
  album: {
    biz: state.biz,
    albumId: state.albumId,
    sourceUrl: state.cfg.albumUrl,
    scrapedAt: new Date().toISOString(),
    count: articles.length,
  },
  articles,
  failures: state.failures,
};

const jsonPath = path.join(
  state.cfg.outputDir,
  "wechat-album-" + state.albumId + ".json"
);
const mdPath = path.join(
  state.cfg.outputDir,
  "wechat-album-" + state.albumId + ".md"
);

await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
const markdown = articles
  .map((article) => "# " + article.title + "\n" + article.paragraphs.join("\n"))
  .join("\n\n");
await fs.writeFile(mdPath, markdown, "utf8");
await state.tab.close();

({
  jsonPath,
  mdPath,
  articles: articles.length,
  failures: state.failures.length,
});
`;

async function main() {
  const client = new McpClient(KAZE_BRIDGE);
  try {
    await client.init();

    await client.js(
      "globalThis.__bakuConfig = " +
        JSON.stringify({
          albumUrl: CONFIG.albumUrl,
          limit: CONFIG.limit,
          titleIncludes: CONFIG.titleIncludes,
          order: CONFIG.order,
          delayMs: CONFIG.delayMs,
          batchSize: CONFIG.batchSize,
          fresh: CONFIG.fresh,
          outputDir: OUTPUT_DIR,
        }) +
        ";\n" +
        INIT_CODE,
      120_000
    );

    const state = await client.js(
      "globalThis.__bakuImporter && ({ total: globalThis.__bakuImporter.articles.length, existing: globalThis.__bakuImporter.existingArticles.length })",
      30_000
    );
    const total = Number(state?.total ?? 0);
    const existing = Number(state?.existing ?? 0);
    if (total === 0 && existing === 0) {
      throw new Error(
        "没有找到匹配的文章。检查 albumUrl、titleIncludes，或该合集是否需要登录。"
      );
    }

    if (total === 0) {
      console.log(`没有需要抓取的新文章（已有 ${existing} 篇），正在整理…`);
    } else {
      console.log(
        `找到 ${total} 篇新文章${existing ? `（已有 ${existing} 篇）` : ""}，开始抓取…`
      );
      while (true) {
        const progress = await client.js(BATCH_CODE, 600_000);
        const done = Number(progress?.done ?? 0);
        const failures = Number(progress?.failures ?? 0);
        console.log(
          `已抓取 ${done}/${total}${failures ? `（失败 ${failures}）` : ""}`
        );
        if (done + failures >= total) break;
      }
    }

    const result = await client.js(FINISH_CODE, 120_000);
    console.log("完成：");
    console.log(`  JSON: ${result.jsonPath}`);
    console.log(`  Markdown: ${result.mdPath}`);
    console.log(`  文章: ${result.articles}，失败: ${result.failures}`);

    if (result.failures > 0) {
      const failures = await client.js(
        "globalThis.__bakuImporter.failures",
        30_000
      );
      for (const failure of failures ?? []) {
        console.log(`  - ${failure.title}: ${failure.error}`);
      }
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  console.error(
    "如果 Kaze 没有响应：请打开 Kaze → 设置 → External Agents，确认允许外部代理，然后重试。"
  );
  process.exit(1);
});
