#!/usr/bin/env node
/**
 * HTML 体检：每个页面都应该有 title、viewport 和 description。
 * 游戏页可以没有 description，但其余页面必须有。
 *
 *   node tools/check-html.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set([".git", "node_modules", ".tmp", "tools"]);
const EXEMPT_DESC = [/choujiang\//, /chat\//, /wechatjump\//, /xiuxian\//];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) await walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

const problems = [];
for (const file of await walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const html = await readFile(file, "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (!title) problems.push(`${rel}: 缺少 <title>`);
  if (!/name=["']viewport["']/i.test(html)) problems.push(`${rel}: 缺少 viewport`);
  if (!/charset=["']?utf-8/i.test(html)) problems.push(`${rel}: 未声明 UTF-8`);
  if (!EXEMPT_DESC.some((re) => re.test(rel)) && !/name=["']description["']/i.test(html)) {
    problems.push(`${rel}: 缺少 meta description`);
  }
  if (/<title>\s*<\/title>/i.test(html)) problems.push(`${rel}: 空 title`);
}

console.log(`检查了 ${(await walk(ROOT)).length} 个页面`);
if (problems.length) {
  console.error(`\n❌ ${problems.length} 个问题：`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("✅ 页面元信息齐全");
