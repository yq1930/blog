---
title: SSR 与 Nuxt 入门
description: 理解 SSR、SSG、SPA 的差别，知道什么时候该用、什么时候纯属增加复杂度。
---

# SSR 与 Nuxt 入门

服务端渲染（SSR）不是银弹。它在某些场景下能显著改善体验，但代价是构建、部署、调试的全部复杂度上升。先用对工具，再决定要不要 SSR。

## 先搞清楚三种渲染模式

| 模式 | HTML 由谁生成 | 首屏速度 | SEO | 适合 |
| --- | --- | --- | --- | --- |
| SPA | 浏览器 JS 运行时 | 慢（要等 JS 下载执行） | 差（初始 HTML 几乎空） | 后台管理系统、需要登录的工具型应用 |
| SSR | 服务器每次请求生成 | 快 | 好 | 内容频繁更新、强 SEO、个性化内容（电商、新闻） |
| SSG | 构建时预先生成 | 最快 | 好 | 博客、文档、营销页（内容不常变） |

> SPA 也不是 SEO 必然差——现代爬虫（Google）能执行 JS，但百度、社交分享抓取仍依赖初始 HTML。要不要 SSR/SSG，先看你的流量来源。

## 为什么用 SSR

SSR 的核心收益是**首屏 HTML 直接可见**，用户不需要等 JS 下载、解析、执行完才看到内容。次要收益是 SEO 和社交分享（Open Graph、Twitter Card 抓的是 HTML）。

它带来的成本：

- 需要一个 Node 服务器（或 Edge Runtime）持续运行。
- 代码必须能在 Node 环境跑——`window`、`document`、`localStorage` 都不能在服务端直接用。
- 部署复杂度上升：不能直接扔到静态主机或 Nginx。
- 调试链路变长：报错可能来自服务端或客户端。

## 同构代码：window/document 是第一道坎

同一份代码会在服务器和浏览器都跑一遍。任何对浏览器 API 的直接引用，在服务端会爆炸：

```js
// 反例：服务端立即执行就崩
const width = window.innerWidth

// 正例：用生命周期或判断环境
import { onMounted } from 'vue'

onMounted(() => {
  // 只在浏览器执行
  const width = window.innerWidth
})

// 或显式判断
if (typeof window !== 'undefined') {
  // 浏览器专属逻辑
}
```

> `onMounted` 只在客户端触发，是放浏览器 API 调用最安全的位置。`created` / `setup` 顶层会在服务端执行，那里别碰 DOM。

## 数据预取：决定首屏是否"真快"

SSR 真正快的前提是**服务端把数据也取好，渲染进 HTML**。如果服务端只渲染骨架，数据全靠客户端 `onMounted` 再取，那和 SPA 没本质区别，只是多了服务端这一跳。

Nuxt 里用 `useFetch` / `useAsyncData` 在服务端预取：

```vue
<script setup>
const { data: article } = await useFetch(`/api/articles/${id}`)
</script>
```

它们会在服务端执行一次拿到数据，序列化进 HTML，客户端 hydration 时直接复用，不会重复请求。

## Hydration：把静态 HTML 接回响应式

服务端输出的 HTML 是静态的，没有事件绑定、没有响应式。客户端 JS 加载后，Vue 会"注水（hydrate）"——在已有 DOM 节点上附加事件监听和响应式系统，而不是重新渲染。

hydration 要求**服务端和客户端渲染出结构一致的 DOM**。否则 Vue 会警告并回退到重新渲染，浪费一次开销。常见踩坑：

- 用了 `Date.now()`、`Math.random()`，两端结果不一致。
- 用了 `localStorage` 里的值，服务端没有。
- 用了只在浏览器生效的第三方库改了 DOM。

> 把"依赖客户端环境"的渲染逻辑包在 `<ClientOnly>` 里，让它在 hydration 后才出现。

## 什么时候 SSR、SSG、SPA

具体决策参考：

- **博客、文档、营销官网、个人主页**：SSG。内容稳定、SEO 重要、部署简单（纯静态）。
- **电商、新闻、社交、社区**：SSR（或 SSR + SPA 混合）。内容更新频繁、SEO 重要、有个性化数据。
- **后台管理系统、内部工具、设计工具、编辑器**：SPA。SEO 不重要、登录后使用、交互复杂。
- **混合**：首页 SSG、动态页 SSR、管理后台 SPA，可以在一个项目里共存（Nuxt 支持）。

## Nuxt 的选择

Nuxt 3 把这三种模式做成可配置项，默认 SSR：

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: true // 默认。设为 false 变成 SPA 模式
})
```

按路由粒度选择渲染模式：

```ts
// 某些路由用 SSG（构建时预渲染）
defineRouteRules({
  '/about': { prerender: true },
  '/admin/**': { ssr: false } // 后台用 SPA
})
```

> 不要为了"用 Nuxt"而用 Nuxt。纯 SPA 的项目用 Vite + Vue Router 更轻；纯静态内容站点用 VitePress 比 Nuxt 更省心。Nuxt 的价值在于"同一个项目里灵活混合 SSR/SSG/SPA"。

## 检查表

- 先判断流量来源、内容更新频率、是否需要登录，再决定渲染模式。
- SSR 代码里所有浏览器 API 调用放进 `onMounted` 或 `ClientOnly`。
- 关键数据用 `useFetch` / `useAsyncData` 在服务端预取，别只渲染骨架。
- 警惕 hydration mismatch：避免在渲染中使用 `Date.now()`、随机值、客户端专属数据。
- 部署前确认服务器环境（Node 版本、内存、冷启动），SSR 不是扔上静态主机就完事。
