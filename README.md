# 个人网站说明

[berlin-blog.github.io](https://berlin-blog.github.io) 的源码。

一个纯静态站点：主页是一张卡片式的自我介绍，外加十个小作品（象棋、五子棋、水果忍者、
three.js 许愿树、抽奖机、跳一跳、修真世界、匿名聊天室和两个小工具）。没有后端，
所有计算都发生在浏览器里，靠 GitHub Pages 托管。

## 结构

```
/
├─ index.html            主页（单页卡片：关于 / 经历 / 能力 / 照片 / 博客 / 联系）
├─ blog-single.html      博文：第一篇 Blog
├─ blog2.html            博文：半夜随笔
├─ lvyou.html            博文：近期 plog
├─ labs/index.html       作品集索引
├─ chess.html            中国象棋（Canvas + AI）
├─ wuziqi.html           五子棋
├─ fruit.html            水果忍者
├─ happytree.html        许愿树（three.js + Bloom）
├─ choujiang/            3D 抽奖机（three.js + CSS3D）
├─ wechatjump/           跳一跳
├─ xiuxian/              修真世界（单文件）
├─ chat/                 MQTT + AES 的匿名聊天室（实验品）
├─ workoff.html          工时倒计时
├─ cleanlead.html        Excel 清洗工具（SheetJS）
├─ css/  js/  images/    样式、脚本、图片
├─ tools/                构建与巡检脚本
├─ 404.html  robots.txt  sitemap.xml
└─ .github/workflows/    CI：死链检查 + 页面巡检
```

## 开发

站点是「源码即产物」，只有两件事需要构建：CSS 和 JS 的合并压缩。

```bash
npm install          # 只装 esbuild
npm run build        # 生成 css/site.min.css 与 js/site.min.js
npm run build:img    # 把 images/ 下的照片转成 WebP（需要 Pillow）
npm run check        # 检查所有本地链接 / 资源是否存在
npm run verify       # 无头 Chrome 逐页巡检（控制台报错、4xx、断图）
npm run serve        # 本地预览 http://127.0.0.1:8080
```

改了 `css/*.css` 或 `js/*.js` 之后要重新 `npm run build`，页面里只引构建产物。
小项目页面（chess、choujiang 等）各自独立，不走这套构建。

## 图片

`images/` 与 `choujiang/img/` 下的照片都已转成 WebP（保留两个尺寸用于 `srcset`），
原始 JPG 已经删掉，需要时用 `git log -- images/` 找回。

## 说明

- 站点里没有表单后端，联系一律走邮箱。
- `choujiang/` 与 `chat/` 在 `robots.txt` 里被排除索引，属于内部使用。
- 抽奖页的照片是同学的真实姓名和头像，仅用于班级活动，不做公开宣传。

## License

代码部分 MIT，文字与图片保留所有权利。
