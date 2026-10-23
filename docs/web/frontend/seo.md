---
title: 前端与 SEO
description: 从搜索引擎“抓取、渲染、索引”的过程讲起，修复单页应用每页标题都一样、分享卡片不对、hash 路由不被收录、不存在的页面返回 200、测试环境的 noindex 带到生产等常见 SEO 问题。
---

# 前端与 SEO

SEO（搜索引擎优化）听起来像是运营的事，但很多致命问题出在前端：

- 用 Vue 做的官网，搜索结果里所有页面的标题都一样；
- 文章链接分享到微信或其他社交平台，卡片上显示的永远是首页的标题和图片；
- 地址是 `/#/article/12` 的形式，文章页一直不被收录；
- 一次发布后，整站从搜索结果里消失了——原来是把测试环境的 `noindex` 带到了生产。

这篇先讲搜索引擎是怎么“读”网页的，再逐个解决这些问题。

::: tip 读完这篇你会
- 理解抓取、渲染、索引的过程，知道为什么单页应用容易出问题
- 为每个页面设置正确的标题、描述、规范链接和分享信息
- 避开 hash 路由、软 404、环境配置串用等坑
:::

## 1. 原理：搜索引擎像一位图书管理员

搜索引擎处理一个网页，大致分四步：

```text
抓取（下载 HTML）→ 渲染（执行 JS，得到完整内容）→ 索引（理解内容、存进目录）→ 排名（按搜索词推荐）
```

可以把它想成一位图书管理员：先把书收进来（抓取），翻开读一读（渲染），给它编目录卡片（索引），有人来问时再推荐（排名）。

问题出在“渲染”这一步。纯客户端渲染的单页应用（SPA），下载下来的 HTML 几乎是空的：

```html
<body>
  <div id="app"></div>
  <script src="/assets/index.js"></script>
</body>
```

内容要等 JS 执行完才出现。部分搜索引擎会执行 JS，但会排队延后、有资源限制；有些搜索引擎和大多数**社交平台的分享卡片抓取程序**不执行 JS，它们看到的就是这本“空白的书”。

## 2. 让内容直接出现在 HTML 里

| 渲染方式 | 初始 HTML | 适合 |
| --- | --- | --- |
| 客户端渲染（CSR） | 空壳，内容靠 JS 生成 | 登录后才能用的后台系统，不需要 SEO |
| 服务端渲染（SSR） | 服务器每次请求时生成完整 HTML | 内容经常变化：电商、资讯 |
| 静态生成（SSG） | 构建时生成完整 HTML 文件 | 内容不常变：博客、文档、官网 |

你正在看的这个博客就是用 VitePress 静态生成的：每篇文章在构建时就变成了一个完整的 HTML 文件，搜索引擎下载下来就能读到全文。Vue 项目需要 SSR 时，可以使用 Nuxt，详见 [SSR 与 Nuxt 入门](/web/vue/ssr)。

## 3. 每个页面都要有自己的“名片”

```html
<head>
  <title>JavaScript 原型链详解 - 野塘漫水</title>
  <meta name="description" content="用“自己不会就问师傅”的方式理解原型链，并避开常见坑。" />
  <link rel="canonical" href="https://example.com/web/JavaScript/prototype" />

  <!-- 分享卡片 -->
  <meta property="og:title" content="JavaScript 原型链详解" />
  <meta property="og:description" content="理解原型链，看懂 class 背后发生了什么。" />
  <meta property="og:image" content="https://example.com/og/prototype.png" />
</head>
```

| 标签 | 作用 |
| --- | --- |
| `<title>` | 搜索结果里的标题，最重要的一项，每页唯一 |
| `description` | 搜索结果里的摘要，不直接影响排名，但影响用户是否点击 |
| `canonical` | 告诉搜索引擎“这个页面的标准地址是哪个” |
| `robots` | 是否允许收录、是否跟随页面上的链接 |
| `og:*` | 社交平台分享卡片的标题、描述和图片 |

### 坑一：所有页面的标题都一样，分享卡片也一样

**现象**：搜索结果里网站的十几个页面标题全是“XX 官网”；把文章链接分享出去，卡片显示的是首页的介绍。

**原因**：单页应用只有一个 `index.html`，`<title>` 和 meta 写死在里面。切换路由时没有更新它们；就算用 JS 更新了，不执行 JS 的分享抓取程序也看不到。

**修复**：

- 至少在路由切换时更新标题和描述：

```js
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 野塘漫水` : '野塘漫水'
})
```

- 更完善的做法是使用 `@unhead/vue` 这类工具管理每个页面的 head 信息；
- 需要正确的分享卡片、需要被搜索收录的页面，使用 SSR 或 SSG，让 meta 信息直接出现在服务器返回的 HTML 里。

## 4. 坑二：hash 路由的页面不被收录

**现象**：网站的地址都是 `https://example.com/#/article/12` 这种形式，搜索引擎只收录了首页。

**原因**：URL 里 `#` 后面的部分叫片段（fragment），它**不会发送给服务器**，搜索引擎通常也把带不同片段的地址视为同一个页面。对它们来说，整个网站只有一个页面。

**修复**：改用 history 模式的路由（`createWebHistory()`），地址变成 `/article/12`。同时必须配置服务器：所有找不到对应文件的路径都返回 `index.html`，否则用户刷新页面时会得到 404。以 Nginx 为例：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 5. 坑三：不存在的页面返回了 200

**现象**：搜索结果里出现了一堆“页面不存在”的页面。

**原因**：单页应用对任何路径都返回 `index.html`，HTTP 状态码是 200，前端路由再显示“404 页面”。在搜索引擎看来，这是一个**正常的页面**，内容恰好是“页面不存在”，于是把它收录了。这叫**软 404**。

**修复**：

- SSR 项目在找不到数据时，让服务器返回真正的 404 状态码；
- 纯前端项目至少给 404 页面加上 `<meta name="robots" content="noindex">`，告诉搜索引擎不要收录。

## 6. 坑四：测试环境的配置被带到了生产

**现象**：一次发布后，网站在搜索结果中的流量断崖式下跌。排查发现，生产环境的 `robots.txt` 里写着 `Disallow: /`。

或者反过来：测试环境的地址出现在了搜索结果里，里面还有未发布的内容和测试数据。

**原因**：测试环境为了不被收录，配置了禁止抓取；但这个配置写死在代码里，随着发布带到了生产。

**修复与预防**：

- `robots.txt` 和 `noindex` 按环境区分生成，不要写死在通用代码里；
- 测试环境除了禁止收录，最好还加上访问限制（登录、IP 白名单），`robots.txt` 只是“君子协定”；
- 发布后自动检查一次生产环境的 `robots.txt` 和首页的 robots meta。

```text
# 生产环境的 robots.txt
User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
```

## 7. 坑五：一个页面有好几个地址

**现象**：同一篇文章被收录了好几次，地址分别带着不同的参数：`?from=weixin`、`?utm_source=newsletter`、末尾带不带斜杠。

**原因**：对搜索引擎来说，参数不同就是不同的 URL。重复内容会分散页面的权重。

**修复**：每个页面都声明 `canonical`，指向不带追踪参数的标准地址；站内链接统一使用这个标准地址（统一是否带末尾斜杠）。

## 8. 语义化 HTML 和结构化数据

搜索引擎通过标签理解内容的结构和重点：每页一个 `<h1>`，标题按层级使用，正文放在 `<main>` 和 `<article>` 里。这些做法同时也让读屏软件更好用，见 [可访问性实战](/web/frontend/accessibility)。

结构化数据用 JSON-LD 告诉搜索引擎“这是一篇文章、作者是谁、什么时候发布的”，有机会在搜索结果中显示更丰富的信息：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "JavaScript 原型链详解",
  "datePublished": "2026-08-09",
  "author": { "@type": "Person", "name": "作者名" }
}
</script>
```

## 9. sitemap 和性能

- **sitemap.xml**：列出网站所有重要页面的地址和更新时间，帮助搜索引擎发现新页面。静态站点生成器大多可以自动生成。
- **性能**：页面体验（LCP、INP、CLS）也是排名的参考因素之一，而且慢页面的跳出率更高，见 [性能与加载体验](/web/frontend/performance)。

## 排查思路

1. **看搜索引擎拿到的 HTML**：右键“查看网页源代码”（不是 Elements 面板，Elements 显示的是 JS 执行后的结果）。源代码里没有正文和正确的 meta，就说明依赖 JS 渲染。
2. **禁用 JS 再看一遍**：DevTools → Ctrl/Cmd + Shift + P → 输入 Disable JavaScript，刷新页面，看到的内容接近不执行 JS 的抓取程序看到的。
3. **用搜索引擎的站长工具**：例如 Google Search Console 的“网址检查”能显示它实际抓取和渲染的结果，以及页面是否被收录、为什么没被收录。国内搜索引擎也有对应的站长平台。
4. **用 `site:你的域名` 搜索**，看收录了哪些页面，有没有不该出现的（测试环境、404 页面、带参数的重复地址）。
5. **每次发布后检查** `robots.txt`、首页的 robots meta 和 canonical。

## 检查清单

- [ ] 需要被搜索到的页面使用 SSR 或 SSG
- [ ] 每个页面有唯一的 `<title>`、`description` 和 `canonical`
- [ ] 需要分享的页面有正确的 `og:*` 信息，且出现在服务器返回的 HTML 里
- [ ] 使用 history 路由，服务器配置了回退到 `index.html`
- [ ] 404 页面返回 404 状态码，或至少设置了 `noindex`
- [ ] `robots.txt` 和 `noindex` 按环境生成，测试环境另有访问限制
- [ ] 提供 sitemap，站内链接使用标准地址

## 延伸阅读

- [SSR 与 Nuxt 入门](/web/vue/ssr)：服务端渲染怎么做
- [路由与页面状态](/web/vue/router)：history 模式与路由配置
- [性能与加载体验](/web/frontend/performance)：Core Web Vitals
