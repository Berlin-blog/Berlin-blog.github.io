#!/usr/bin/env node
/**
 * 无头 Chrome 巡检：逐页加载本地站点，收集
 *   - 控制台报错 / 未捕获异常
 *   - 4xx / 5xx 响应、加载失败的请求
 *   - 截图（可选）
 *
 *   node tools/verify-pages.mjs                        # 默认检查主站页面
 *   node tools/verify-pages.mjs --shots                # 同时截图到 .tmp/shots
 *   node tools/verify-pages.mjs --urls=/labs/,/chess.html
 *
 * 依赖：本机 Chrome；Node 22+ 自带的 WebSocket。
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 9333;
const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));

const args = process.argv.slice(2);
const SHOTS = args.includes("--shots");
const urlsArg = args.find((a) => a.startsWith("--urls="));
const evalArg = args.find((a) => a.startsWith("--eval="));
const URLS = urlsArg
  ? urlsArg.split("=")[1].split(",")
  : ["/", "/blog-single.html", "/blog2.html", "/lvyou.html", "/labs/", "/404.html", "/chess.html"];

if (!CHROME) {
  console.error("找不到 Chrome，无法巡检");
  process.exit(2);
}

const tmp = path.join(os.tmpdir(), "dsh-chrome-profile");
await rm(tmp, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmp}`,
  "--window-size=1440,900",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools 未就绪");
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
  close() {
    this.ws.close();
  }
}

const wsUrl = await waitForDevtools();
const cdp = new CDP(wsUrl);
await cdp.ready;

const report = [];

for (const url of URLS) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const errors = [];
  const bad = [];

  const handler = (msg) => {
    if (msg.sessionId !== sessionId) return;
    const { method, params } = msg;
    if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails;
      errors.push(`uncaught: ${d.exception?.description || d.text}`);
    }
    if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      errors.push("console.error: " + params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    }
    if (method === "Log.entryAdded" && params.entry.level === "error") {
      errors.push(`log: ${params.entry.text} ${params.entry.url || ""}`.trim());
    }
    if (method === "Network.responseReceived") {
      const { status, url: u } = params.response;
      if (status >= 400) bad.push(`${status} ${u}`);
    }
    if (method === "Network.loadingFailed") {
      if (params.errorText !== "net::ERR_ABORTED") bad.push(`failed(${params.errorText}) ${params.requestId}`);
    }
  };
  cdp.on(handler);

  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp.send("Page.navigate", { url: BASE + url }, sessionId);
  await sleep(4500);

  if (evalArg) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: evalArg.slice("--eval=".length),
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    if (r.exceptionDetails) console.log("  eval 出错:", JSON.stringify(r.exceptionDetails.text));
    else console.log("  eval →", JSON.stringify(r.result.value));
    await sleep(1600);
  }

  const metrics = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      title: document.title,
      imgs: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.currentSrc || i.src),
      bytes: performance.getEntriesByType('resource').reduce((n, e) => n + (e.transferSize || e.decodedBodySize || 0), 0),
      requests: performance.getEntriesByType('resource').length,
      docHeight: document.body.scrollHeight
    })`,
    returnByValue: true,
  }, sessionId);
  const info = JSON.parse(metrics.result.value);

  if (SHOTS) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    const dir = path.join(ROOT, ".tmp", "shots");
    await mkdir(dir, { recursive: true });
    const name = url === "/" ? "home" : url.replace(/[\/]/g, "_").replace(/^_/, "");
    await writeFile(path.join(dir, `${name}.png`), Buffer.from(shot.data, "base64"));
    info.shot = `.tmp/shots/${name}.png`;
  }

  report.push({ url, ...info, errors, failedRequests: bad });
  cdp.listeners = cdp.listeners.filter((f) => f !== handler);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
}

cdp.close();
chrome.kill();

let failed = 0;
for (const r of report) {
  const kb = (r.bytes / 1024).toFixed(0);
  const brokenImgs = r.imgs.length ? ` 断图:${r.imgs.length}` : "";
  console.log(`\n${r.url}  「${r.title}」`);
  console.log(`  ${r.requests} 个请求 / ${kb} KB / 高度 ${r.docHeight}px${brokenImgs}`);
  if (r.imgs.length) console.log("  断图:", r.imgs.slice(0, 5).join(", "));
  if (r.failedRequests.length) {
    failed++;
    console.log("  失败请求:", r.failedRequests.slice(0, 6).join("\n            "));
  }
  if (r.errors.length) {
    failed++;
    console.log("  报错:", r.errors.slice(0, 6).join("\n        "));
  }
  if (!r.failedRequests.length && !r.errors.length && !r.imgs.length) console.log("  ✅ 干净");
}

console.log(`\n结论：${failed ? `❌ ${failed} 个页面有问题` : "✅ 全部通过"}`);
process.exit(failed ? 1 : 0);
