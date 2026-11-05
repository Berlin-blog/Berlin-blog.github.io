#!/usr/bin/env node
/**
 * 构建脚本：把散落的 CSS / JS 合并压缩成单一文件。
 *
 *   node tools/build.mjs            # 全量构建
 *   node tools/build.mjs --only=css
 *   node tools/build.mjs --only=js
 *
 * 设计原则：源码即产物。构建只做「合并 + 压缩」，不做转译，
 * 因此任何一个中间文件出问题，都可以用原文对照。
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const p = (...s) => path.join(ROOT, ...s);

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

const CSS_ENTRY = ["css/bootstrap.css", "css/style.css", "css/responsive.css"];
const CSS_OUT = "css/site.min.css";

// 远程字体已经提升到 HTML 的 <link>，这里直接丢掉 @import，避免阻塞式串行请求
const DROP_REMOTE_IMPORTS = [/^https?:/i];

function expandImports(file, seen = new Set()) {
  if (seen.has(file)) return "";
  seen.add(file);
  const abs = p(file);
  const css = require_read(abs);
  return css.replace(/@import\s+url\((['"]?)([^'")]+)\1\)\s*;/g, (m, q, target) => {
    if (DROP_REMOTE_IMPORTS.some((re) => re.test(target))) return "";
    if (!/\.css$/i.test(target)) return "";
    const child = path.posix.join(path.posix.dirname(file.replace(/\\/g, "/")), target);
    return expandImports(child, seen);
  });
}

function require_read(abs) {
  if (!existsSync(abs)) throw new Error(`缺少文件: ${abs}`);
  // 同步读取即可，构建是一次性的
  return readFileSync(abs, "utf8");
}

async function buildCss() {
  const parts = [];
  for (const entry of CSS_ENTRY) {
    parts.push(`/* ==== ${entry} ==== */\n` + expandImports(entry));
  }
  const merged = parts.join("\n");
  const { code } = await esbuild.transform(merged, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });
  await writeFile(p(CSS_OUT), code);
  const before = CSS_ENTRY.reduce((n, f) => n + (existsSync(p(f)) ? statSync(p(f)).size : 0), 0);
  report(CSS_OUT, before, code.length);
}

/* ------------------------------------------------------------------ */
/* JS                                                                  */
/* ------------------------------------------------------------------ */

// 顺序即依赖顺序，不要随意调整
const JS_ORDER = [
  "js/jquery.js",                 // ① jQuery
  "js/bootstrap.min.js",          // ② Bootstrap 3
  "js/wow.js",                    // ③ 滚动入场动画
  "js/appear.js",                 // ④ appear 插件（knob 依赖）
  "js/element-in-view.js",        // ⑤
  "js/jquery.fancybox.js",        // ⑥ 灯箱
  "js/knob.js",                   // ⑦ 环形进度（#about 里的 4 个 dial）
  "js/mousemoveparallax.js",      // ⑧ 鼠标视差
  "js/pagenav.js",                // ⑨ 单页导航
  "js/jquery-type.js",            // ⑩ 打字机
  "js/jquery.nicescroll.min.js",  // ⑪ 卡片内滚动条
  "js/particle-alone.js",         // ⑫ 背景粒子
  "js/script.js",                 // ⑬ 站点业务脚本（必须最后）
];
const JS_OUT = "js/site.min.js";

async function buildJs() {
  const chunks = [];
  let before = 0;
  for (const file of JS_ORDER) {
    const abs = p(file);
    if (!existsSync(abs)) throw new Error(`缺少文件: ${file}`);
    const src = await readFile(abs, "utf8");
    before += Buffer.byteLength(src);
    // 逐个压缩再拼接：避免 esbuild 把 classic script 当成 ESM 处理
    const { code } = await esbuild.transform(src, {
      loader: "js",
      minify: true,
      target: "es2017",
      legalComments: "none",
    });
    chunks.push(`/* ${file} */\n${code}`);
  }
  const out = "/* 由 tools/build.mjs 生成，请勿直接编辑 */\n" + chunks.join(";\n") + ";\n";
  await writeFile(p(JS_OUT), out);
  report(JS_OUT, before, Buffer.byteLength(out));
}

/* ------------------------------------------------------------------ */

function report(file, before, after) {
  const kb = (n) => (n / 1024).toFixed(1).padStart(7);
  const pct = before ? (((before - after) / before) * 100).toFixed(0) : "0";
  console.log(`${file.padEnd(20)} ${kb(before)} KB → ${kb(after)} KB  (-${pct}%)`);
}

const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const t0 = Date.now();
if (!only || only === "css") await buildCss();
if (!only || only === "js") await buildJs();
console.log(`构建完成，用时 ${Date.now() - t0} ms`);
