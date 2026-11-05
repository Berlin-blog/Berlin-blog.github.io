#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
图片优化：把站点里实际引用到的照片批量转成 WebP（多尺寸），
并输出 tools/image-manifest.json 供 HTML 重写脚本使用。

    python tools/optimize-images.py            # 全量
    python tools/optimize-images.py --dry-run  # 只打印计划

原始 JPG/PNG 在确认没有引用后会由 tools/transform-html.py 一并清理，
需要找回时用 `git log -- images/` 即可。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = Path(__file__).resolve().parent / "image-manifest.json"

# 站点里需要「照片级」压缩的目录（游戏精灵图、图标不动）
PHOTO_DIRS = ("images/gallery", "images/background", "images/resource", "choujiang/img")
# 这些是背景/装饰图，宽一点更保险
WIDTHS_LARGE = (640, 1280)
WIDTHS_SMALL = (400, 800)


def referenced_images() -> set[str]:
    """扫描 html/css/js 里出现的图片路径，只优化真正用到的。"""
    refs: set[str] = set()
    pattern = re.compile(r"(?:images|img|res)/[^\"')\s]+\.(?:jpe?g|png)", re.I)
    for ext in ("**/*.html", "**/*.js", "**/*.css"):
        for f in ROOT.glob(ext):
            if ".git" in f.parts or "node_modules" in f.parts:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for m in pattern.finditer(text):
                ref = m.group(0).lstrip("./")
                if ref.startswith("img/") and "choujiang" in f.parts:
                    # choujiang 页面里的 ./img/xxx 实际相对于 choujiang/
                    ref = "choujiang/" + ref
                refs.add(ref)
    return refs


def variants_for(path: Path) -> tuple[int, ...]:
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith("choujiang/img"):
        # 这三张是 3D/CSS3D 背景或大图，不能按缩略图尺寸压
        name = Path(rel).stem
        if name == "in_top_bj":
            return (1600,)
        if name == "starBg":
            return (960,)
        if name == "礼包":
            return (600,)
        return (400,)  # 抽奖卡片本身很小，一个尺寸足够
    if rel.startswith(("images/gallery", "images/background", "images/resource")):
        return WIDTHS_LARGE
    return WIDTHS_SMALL


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    refs = referenced_images()
    manifest: dict[str, dict] = {}
    total_before = total_after = 0
    made = 0

    for rel in sorted(refs):
        src = ROOT / rel
        if not src.exists():
            continue
        parent_rel = src.parent.relative_to(ROOT).as_posix()
        if not parent_rel.startswith(PHOTO_DIRS):
            continue
        if src.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue

        try:
            with Image.open(src) as im:
                im.load()
                has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
                base = im.convert("RGBA" if has_alpha else "RGB")
                w, h = base.size
                want = variants_for(src)
                limit = min(w, max(want))          # 绝不放大
                widths = sorted({x for x in want if x < limit} | {limit})

                stem = src.with_suffix("")
                biggest = None
                for width in widths:
                    height = round(h * width / w)
                    resized = base.resize((width, height), Image.LANCZOS)
                    suffix = "" if width == widths[-1] else f"-{width}"
                    out = stem.with_name(stem.name + suffix + ".webp")
                    if not args.dry_run:
                        resized.save(out, "WEBP", quality=72, method=6)
                    made += 1
                    if width == widths[-1]:
                        biggest = (out, width, height, out.stat().st_size if out.exists() else 0)

                if biggest:
                    out, bw, bh, size = biggest
                    total_before += src.stat().st_size
                    total_after += size
                    manifest[rel] = {
                        "webp": out.relative_to(ROOT).as_posix(),
                        "width": bw,
                        "height": bh,
                        "srcset": {
                            str(width): stem.with_name(
                                stem.name + ("" if width == widths[-1] else f"-{width}") + ".webp"
                            ).relative_to(ROOT).as_posix()
                            for width in widths
                        },
                    }
                    print(f"  {rel:48} {src.stat().st_size/1024:7.0f} KB → {size/1024:7.0f} KB")
        except Exception as exc:  # noqa: BLE001
            print(f"  ! 跳过 {rel}: {exc}", file=sys.stderr)

    if not args.dry_run:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"\n{len(manifest)} 张图 / {made} 个 WebP 变体，"
        f"{total_before/1024/1024:.2f} MB → {total_after/1024/1024:.2f} MB"
        f"（-{(1 - total_after/max(total_before,1))*100:.0f}%）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
