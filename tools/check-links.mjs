#!/usr/bin/env node
/**
 * 死链检查：扫描所有 HTML / CSS，确认站内引用的文件真的存在。
 *
 *   node tools/check-links.mjs
 *
 * 只检查「本地相对路径」，外链（http、mailto、#锚点）跳过 ——
 * 外链检查交给 CI 里的 lychee，避免本脚本依赖网络。
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", ".tmp", "tools", "fonts"]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = await walk(ROOT);
const pages = files.filter((f) => f.endsWith(".html"));
const styles = files.filter((f) => f.endsWith(".css"));

const problems = [];
let checked = 0;

function checkRef(page, ref) {
  if (!ref) return;
  if (/^(https?:|mailto:|tel:|javascript:|data:|#|\/\/)/i.test(ref)) return;
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean || clean.includes("{{")) return; // Vue 绑定之类
  checked++;
  // 以 / 开头的是站点根路径（GitHub Pages 的用户站根目录）
  const target = clean.startsWith("/")
    ? path.join(ROOT, decodeURIComponent(clean))
    : path.resolve(path.dirname(page), decodeURIComponent(clean));
  if (!existsSync(target)) {
    problems.push(`${path.relative(ROOT, page)} → ${ref}`);
    return;
  }
  // 目录链接要能落到 index.html
  if (statSync(target).isDirectory() && !existsSync(path.join(target, "index.html"))) {
    problems.push(`${path.relative(ROOT, page)} → ${ref}（目录下没有 index.html）`);
  }
}

for (const page of pages) {
  const html = (await readFile(page, "utf8")).replace(/<!--[\s\S]*?-->/g, "");
  // (?<!:) 跳过 Vue 的 :src 之类的动态绑定
  for (const m of html.matchAll(/(?<!:)\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) checkRef(page, m[1]);
  for (const m of html.matchAll(/url\(["']?([^"')]+)["']?\)/g)) checkRef(page, m[1]);
}

for (const file of styles) {
  const css = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const ref = m[1];
    if (/^(data:|https?:|\/\/)/i.test(ref)) continue;
    checkRef(file, ref);
  }
}

console.log(`扫描 ${pages.length} 个页面 / ${styles.length} 个样式，检查 ${checked} 处引用`);
if (problems.length) {
  console.error(`\n❌ 发现 ${problems.length} 处失效引用：`);
  for (const p of [...new Set(problems)]) console.error("  " + p);
  process.exit(1);
}
console.log("✅ 站内链接全部有效");
