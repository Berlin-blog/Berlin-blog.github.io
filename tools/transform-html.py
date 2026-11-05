#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
一次性改造脚本：把模板页改造成「单 CSS + 单 JS + WebP + 无第三方地图 + 无失效表单」的形态。

每个替换都带断言，模板被手改过会直接报错，不会静默改坏页面。

    python tools/transform-html.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((Path(__file__).resolve().parent / "image-manifest.json").read_text(encoding="utf-8"))

SITE = "https://berlin-blog.github.io"
MAIN_PAGES = ["index.html", "blog-single.html", "blog2.html", "lvyou.html"]

META = {
    "index.html": (
        "Berlin Li 的个人网站",
        "香港计算机系毕业生的个人主页：一点代码、一堆游戏、几张画，以及偶尔更新的旅行 plog。",
        "Berlin Li 个人主页, 香港, 计算机, 前端, 旅行, 画画",
    ),
    "blog-single.html": (
        "第一篇 Blog | Berlin's Blog",
        "2024 年 7 月 18 日，个人网站上线当天的随笔：台风、上班，以及一点点开心。",
        "博客, 随笔, Berlin",
    ),
    "blog2.html": (
        "半夜随笔 | Berlin's Blog",
        "凌晨写下的几百字，关于想念和一些说不清的情绪。",
        "博客, 随笔, 情绪",
    ),
    "lvyou.html": (
        "近期 plog | Berlin's Blog",
        "把最近几个月出门拍的照片整理成一篇 plog：光、云、街道和吃饭。",
        "旅行, plog, 摄影, 香港",
    ),
}

CSS_BLOCK = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Work+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<link href="css/site.min.css" rel="stylesheet">"""

SCRIPT_BLOCK = """<!-- 全站脚本已由 tools/build.mjs 打包成单文件 -->
<script src="js/site.min.js" defer></script>"""

VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">'


def assert_sub(s: str, old: str, new: str, count: int | None = None, label: str = "") -> str:
    n = s.count(old)
    if count is None:
        assert n >= 1, f"[{label}] 未找到片段: {old[:60]!r}"
    else:
        assert n == count, f"[{label}] 期望 {count} 处，实际 {n} 处: {old[:60]!r}"
    return s.replace(old, new)


def rewrite_head(name: str, s: str) -> str:
    s = s.lstrip("\ufeff")
    s = assert_sub(s, '<html lang="en">', '<html lang="zh-CN">', 1, name)
    s = re.sub(r'<meta http-equiv="Content-Type" content="text/html; charset=[^"]*"\s*/?>',
               '<meta charset="utf-8">', s, count=1)

    # viewport：允许缩放（原来把 user-scalable 关掉了）
    s, n = re.subn(r'<meta name="viewport"[^>]*>', VIEWPORT, s, count=1)
    assert n == 1, f"[{name}] viewport 未替换"

    # 主题色 / 描述 / Open Graph
    title, desc, keywords = META[name]
    extra = (
        f'<meta name="description" content="{desc}">\n'
        f'<meta name="keywords" content="{keywords}">\n'
        f'<meta name="author" content="Berlin Li">\n'
        f'<meta name="theme-color" content="#9147ff">\n'
        f'<link rel="canonical" href="{SITE}/{"" if name == "index.html" else name}">\n'
        f'<meta property="og:type" content="website">\n'
        f'<meta property="og:site_name" content="Berlin\'s Blog">\n'
        f'<meta property="og:title" content="{title}">\n'
        f'<meta property="og:description" content="{desc}">\n'
        f'<meta property="og:url" content="{SITE}/{"" if name == "index.html" else name}">\n'
        f'<meta property="og:image" content="{SITE}/images/gallery/mao.webp">\n'
        f'<meta name="twitter:card" content="summary_large_image">\n'
    )
    s, n = re.subn(r"(</title>\n)", r"\1" + extra, s, count=1)
    assert n == 1, f"[{name}] title 后插入失败"

    # 三个 CSS → 一个自托管 CSS + Google Fonts 外链（原来是 @import，会串行阻塞）
    s, n = re.subn(
        r'<link href="css/bootstrap\.css" rel="stylesheet">\s*'
        r'<link href="css/style\.css" rel="stylesheet">\s*'
        r'<link href="css/responsive\.css" rel="stylesheet">',
        CSS_BLOCK, s, count=1)
    assert n == 1, f"[{name}] CSS 链接替换失败"

    # 去掉 IE 条件注释（html5shiv / respond 只服务于 IE8-）
    s = re.sub(r'<!--\[if lt IE 9\]>.*?<!\[endif\]-->\s*\n?', "", s)
    return s


def rewrite_scripts(name: str, s: str) -> str:
    # 从 jquery.js 到「End Google Map APi」全部换成单文件
    pat = re.compile(
        r'<script src="js/jquery\.js"></script>.*?<!--End Google Map APi-->\s*\n?', re.S)
    s, n = pat.subn(SCRIPT_BLOCK + "\n", s, count=1)
    assert n == 1, f"[{name}] 脚本块替换失败"
    return s


def rewrite_images(name: str, s: str) -> str:
    def img_tag(m: re.Match) -> str:
        tag = m.group(0)
        src_m = re.search(r'\ssrc="([^"]+)"', tag)
        if not src_m:
            return tag
        src = src_m.group(1)
        info = MANIFEST.get(src)
        if not info:
            return tag
        attrs = dict(re.findall(r'\s([a-zA-Z-]+)="([^"]*)"', tag))
        alt = attrs.get("alt") or "Berlin 的作品照片"
        cls = f' class="{attrs["class"]}"' if attrs.get("class") else ""
        eager = any(k in src for k in ("tou.", "logo.", "favicon"))
        loading = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'

        srcset = info["srcset"]
        pairs = sorted(((int(w), p) for w, p in srcset.items()), reverse=True)
        srcset_attr = ", ".join(f"{p} {w}w" for w, p in pairs)
        sizes = "(max-width: 767px) 92vw, 460px" if "gallery" in src else "100vw"
        return (
            f'<img src="{info["webp"]}"'
            f' srcset="{srcset_attr}" sizes="{sizes}"'
            f' width="{info["width"]}" height="{info["height"]}"'
            f'{cls} alt="{alt}" {loading}>'
        )

    s = re.sub(r"<img\b[^>]*>", img_tag, s)
    # 背景图与灯箱大图
    for rel, info in MANIFEST.items():
        s = s.replace(f"url({rel})", f"url({info['webp']})")
        s = s.replace(f'"{rel}"', f'"{info["webp"]}"')
        s = s.replace(f"href=\"{rel}\"", f'href="{info["webp"]}"')
    return s


CONTACT_CARD = """<div class="col-md-6">
                                        <ul class="list-style-two">
                                            <li><span class="icon flaticon-note-1"></span>probleandfd@gmail.com<br>有事直接发邮件，回得比较快</li>
                                            <li><span class="icon flaticon-social"></span>微信 Berlin_0801<br>加我时说一句是看了网站来的</li>
                                            <li><span class="icon flaticon-signs"></span>香港<br>维港边偶遇概率不高，但可以约饭</li>
                                        </ul>
                                    </div>"""

MAILTO_BLOCK = """<div class="contact-form">
                                        <p class="text" style="margin-bottom:18px">
                                            站内表单已经下线（GitHub Pages 跑不了后端），
                                            想聊天的话直接给我发邮件最快 👇
                                        </p>
                                        <p>
                                            <a class="theme-btn btn-style-two"
                                               href="mailto:probleandfd@gmail.com?subject=%E6%9D%A5%E8%87%AA%E4%B8%AA%E4%BA%BA%E7%AB%99%E7%9A%84%E9%97%AE%E5%80%99">
                                               写封邮件给我
                                            </a>
                                        </p>
                                    </div>"""


def rewrite_contact(name: str, s: str) -> str:
    # 失效的 PHP 表单 → mailto 按钮
    s, n = re.subn(r'<form[^>]*sendemail\.php[^>]*>.*?</form>', MAILTO_BLOCK, s, flags=re.S)
    if n:
        print(f"    · {name}: 联系表单 → mailto")

    # 已下线的地图 → 联系方式卡片
    s, n = re.subn(
        r'<div class="col-md-6">\s*<div class="map-section">.*?</div>\s*</div>\s*</div>',
        CONTACT_CARD, s, flags=re.S)
    if n:
        print(f"    · {name}: Google 地图 → 联系方式卡片")

    if name == "index.html":
        s = assert_sub(s, "<li><strong>手机 :</strong>  +86 177-9652-6788</li>",
                       "<li><strong>坐标 :</strong>  香港</li>", 1, name)
        s = assert_sub(
            s,
            '<li><span class="icon flaticon-smartphone"></span>(+86) 177-9652-6788 <br>WeChat: Berlin_0801</li>',
            '<li><span class="icon flaticon-note-1"></span>probleandfd@gmail.com <br>WeChat: Berlin_0801</li>',
            1, name)
        s = assert_sub(
            s,
            '<li><span class="icon flaticon-note-1"></span>probleandfd@gmail.com <br>2088927145@qq.com</li>',
            '<li><span class="icon flaticon-social"></span>Weibo / X / Facebook <br>都在左边，点一下就到</li>',
            1, name)
        s = s.replace("红磡 九龙 香港 <br> 夜晚来维港偶遇我吧~", "香港 <br> 夜晚来维港偶遇我吧~")
    return s


def add_labs_entry(name: str, s: str) -> str:
    """侧栏留白有限，Labs 入口放在移动端菜单 + 左侧作者卡 + 博客卡片里。"""
    # 1) 移动端菜单
    s, n = re.subn(
        r'(<li><a href="(?:index\.html)?#contact">Contact</a></li>)',
        r'\1\n                            <li><a href="labs/index.html">Labs</a></li>',
        s, count=1)
    assert n == 1, f"[{name}] 移动菜单 Labs 插入失败"

    if name == "index.html":
        # 2) 左侧作者卡：多一个「我的作品」按钮
        s, n = re.subn(
            r'(<a href="#contact" class="theme-btn btn-style-one">联系我</a>\s*</div>)',
            lambda m: m.group(1).replace(
                '<a href="#contact" class="theme-btn btn-style-one">联系我</a>',
                '<a href="#contact" class="theme-btn btn-style-one">联系我</a>\n'
                '                            <a href="labs/index.html" class="theme-btn btn-style-two">我的作品</a>'),
            s, count=1)
        assert n == 1, f"[{name}] 作者卡 Labs 按钮插入失败"
    return s


def fix_anchors(name: str, s: str) -> str:
    """博文页没有 #about 之类的锚点，指回首页，避免点了没反应。"""
    if name == "index.html":
        return s
    for anchor in ("#home", "#about", "#resume", "#services", "#work", "#blog", "#contact"):
        s = s.replace(f'href="{anchor}"', f'href="index.html{anchor}"')
    s = s.replace('<a href="#" class="theme-btn btn-style-one">关于我</a>',
                  '<a href="index.html#about" class="theme-btn btn-style-one">关于我</a>')
    return s


def main() -> None:
    for name in MAIN_PAGES:
        path = ROOT / name
        s = path.read_text(encoding="utf-8")
        print(f"  → {name}")
        s = rewrite_head(name, s)
        s = rewrite_scripts(name, s)
        s = rewrite_images(name, s)
        s = rewrite_contact(name, s)
        s = add_labs_entry(name, s)
        s = fix_anchors(name, s)
        path.write_text(s, encoding="utf-8")
        print(f"    完成，{len(s)} 字符")


if __name__ == "__main__":
    main()
