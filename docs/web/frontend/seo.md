---
title: 前端与 SEO
description: 从语义化 HTML、meta 标签到结构化数据，做搜索引擎和用户都能理解的内容。
---

# 前端与 SEO

SEO（搜索引擎优化）不是上线后再补的"优化项"，而是从写 HTML 时就该考虑的内容架构。搜索引擎爬虫读的是 HTML，不是渲染后的视觉——一个对爬虫友好的页面，通常也对屏幕阅读器和慢网络用户友好。本篇讲前端能掌控的 SEO 要点：语义化、meta、SSR/SSG、结构化数据和性能。SPA 的 SEO 挑战会单独说明。

## 语义化 HTML 是 SEO 的地基

爬虫通过 HTML 标签理解页面结构和内容权重。用语义标签明确告诉它"这是标题、这是导航、这是正文"：

| 标签 | SEO 作用 |
| --- | --- |
| `<h1>` | 页面主标题，每页一个，权重最高 |
| `<h2>`~`<h6>` | 内容层级，按顺序使用 |
| `<main>` | 主内容区 |
| `<nav>` | 导航 |
| `<article>` | 独立完整的内容（文章、帖子） |
| `<section>` | 内容分区 |
| `<header>` / `<footer>` | 页头页脚 |

```html
<!-- 差：全 div，爬虫看不出结构和权重 -->
<div class="title">JavaScript 原型链</div>
<div class="content">...</div>

<!-- 好：语义标签，层级清晰 -->
<article>
  <h1>JavaScript 原型链</h1>
  <section>
    <h2>原型链如何工作</h2>
    <p>...</p>
  </section>
</article>
```

> 标题层级要按顺序：`<h1>` 后直接接 `<h2>`，不要跳过 `<h3>` 直接用 `<h4>`。爬虫用标题层级构建内容大纲，跳跃会打乱理解。

## meta 标签：页面的元信息

`<head>` 里的 meta 标签告诉搜索引擎页面的基本信息：

```html
<head>
  <title>JavaScript 原型链详解 - 技术博客</title>
  <meta name="description" content="从对象的原型链理解 class 语法，包含代码示例和调试技巧。" />
  <link rel="canonical" href="https://example.com/js/prototype" />
  <meta name="robots" content="index, follow" />
</head>
```

| 标签 | 作用 |
| --- | --- |
| `<title>` | 浏览器标签标题，搜索结果的主链接文字（极重要） |
| `<meta description>` | 搜索结果摘要（不直接影响排名，影响点击率） |
| `<link canonical>` | 标准化 URL，避免重复内容被当作不同页面 |
| `<meta robots>` | 控制是否索引、是否跟随链接 |
| `<meta og:*>` | 社交分享时的卡片信息 |

`title` 要独特、含关键词、长度合适（50-60 字符，太长会被截断）。`description` 是给用户看的"广告语"，写清楚这页讲什么，别堆关键词。

## SSR / SSG：让爬虫看到完整内容

这是 SPA（单页应用）最大的 SEO 挑战。纯客户端渲染的 SPA 初始 HTML 是空壳，内容靠 JS 执行后填充。爬虫如果执行 JS 不完整或延迟，就看不到内容：

| 方案 | 初始 HTML | SEO 友好度 |
| --- | --- | --- |
| CSR（纯 SPA） | 空壳，靠 JS 填充 | 差，依赖爬虫执行 JS |
| SSR（服务端渲染） | 服务端生成完整 HTML | 好 |
| SSG（静态生成） | 构建时生成完整 HTML | 好，且最快 |
| ISR（增量静态再生） | 静态 + 按需更新 | 好 |

| 场景 | 推荐 |
| --- | --- |
| 博客、文档、营销页（内容稳定） | SSG |
| 电商、社交（数据动态） | SSR |
| 后台管理系统（无需 SEO） | CSR 即可 |

```text
内容型网站（需要被搜索到）→ SSR 或 SSG
应用型网站（登录后才用）→ CSR 无所谓
```

> 谷歌爬虫能执行 JS，但有延迟和成本。百度等爬虫对 JS 渲染支持更弱。面向国内用户的内容站，SSR/SSG 几乎是必需。

## 结构化数据：让爬虫"理解"内容

Schema.org 结构化数据用 JSON-LD 告诉爬虫"这是一个文章、作者是谁、发布日期是多少"。爬虫理解后可能在搜索结果里展示富摘要（rich snippet）：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "JavaScript 原型链详解",
  "author": { "@type": "Person", "name": "作者" },
  "datePublished": "2026-08-09",
  "image": "https://example.com/img/prototype.png",
  "mainEntityOfPage": "https://example.com/js/prototype"
}
</script>
```

常见的结构化数据类型：`Article`、`Product`、`Recipe`、`FAQPage`、`BreadcrumbList`。用 Google 的结构化数据测试工具验证格式是否正确。

## sitemap 和 robots.txt

告诉爬虫"有哪些页面可以抓、哪些不要抓"：

```text
# robots.txt（放在站点根目录）
User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
```

```xml
<!-- sitemap.xml：列出所有重要页面 -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/js/prototype</loc>
    <lastmod>2026-08-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

> 动态站点自动生成 sitemap，确保新页面能被发现。但 sitemap 只是"提示"，最终是否索引由爬虫决定——内容质量才是根本。

## 性能也是 SEO 因素

谷歌把 Core Web Vitals（核心网页指标）纳入排名因素：

| 指标 | 含义 | 目标 |
| --- | --- | --- |
| LCP（最大内容绘制） | 主内容加载完成时间 | < 2.5s |
| INP（交互到下一次绘制） | 交互响应速度 | < 200ms |
| CLS（累积布局偏移） | 视觉稳定性 | < 0.1 |

```text
LCP 慢 → 图片太大、关键 CSS 阻塞 → 见 CSS 性能优化
CLS 高 → 图片没设尺寸、字体加载跳动 → 给图片预留宽高
INP 慢 → 主线程被长任务阻塞 → 拆分长任务
```

详见 [性能与加载体验](./performance.md) 和 [CSS 性能优化](../css/performance.md)。性能好的页面不仅排名好，用户留存也高。

## URL 结构和链接

清晰的 URL 帮助爬虫和用户理解页面关系：

| 原则 | 例子 |
| --- | --- |
| 短且有语义 | `/js/prototype` 而非 `/article?id=123` |
| 层级反映结构 | `/blog/category/post-slug` |
| 用连字符分词 | `prototype-chain` 而非 `prototype_chain` |
| 小写 | 避免大小写敏感问题 |

内部链接让爬虫发现页面，也让权重在站内流动。重要的页面应该从首页或导航能到达，而不是埋在五层点击之后。

## 务实的检查清单

- 是否用了语义化 HTML，每页一个 `<h1>`，标题层级不跳跃？
- `<title>` 和 `description` 是否每页独特、含关键词？
- 内容型页面是否用了 SSR/SSG，而不是纯 CSR？
- 是否加了 Schema.org 结构化数据（JSON-LD）？
- 是否提供了 sitemap.xml 和 robots.txt？
- Core Web Vitals 是否达标（LCP/INP/CLS）？
- URL 是否语义化、小写、用连字符？

SEO 不是 trick 和 hack，而是"让内容被正确理解"。做对语义化 HTML、保证可抓取、提供完整内容，剩下的交给时间和内容质量。前端的职责是搭好让内容被发现的舞台。
