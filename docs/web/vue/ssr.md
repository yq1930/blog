---
title: SSR 与 Nuxt 入门
description: 用“先看样板间照片、再接通水电”理解服务端渲染和注水（hydration），讲清何时选 SSR、SSG 或 SPA，并修复 window is not defined、注水不匹配、时区导致日期差 8 小时、数据请求两次、不同用户数据串号等问题。
---

# SSR 与 Nuxt 入门

服务端渲染（SSR）能让首屏更快、对搜索引擎更友好，但它同时让构建、部署和调试都变复杂了。第一次做 SSR 的人，几乎都会遇到这些问题：

- 服务器启动就报 `window is not defined`；
- 控制台出现 `Hydration mismatch` 警告；
- 页面上的时间在服务器渲染时和浏览器里差了 8 小时；
- 同一个接口在服务器请求了一次，浏览器又请求了一次；
- 最危险的：用户 A 的页面上出现了用户 B 的名字。

::: tip 读完这篇你会
- 说清 SSR 的完整流程和“注水”（hydration）是什么
- 根据业务选择 SPA、SSR 或 SSG
- 写出能同时在服务器和浏览器运行的代码，避开上面这些坑
:::

## 1. 原理：先给照片，再接通水电

SSR 的过程可以分成两段：

```text
① 服务器：收到请求 → 运行 Vue 应用、获取数据 → 生成完整的 HTML → 返回给浏览器
② 浏览器：立刻显示这份 HTML（用户已经能看到内容）
          → 下载 JS → Vue 在已有的 DOM 上绑定事件、建立响应式（注水 hydration）→ 页面可以交互
```

可以把它想成买房看样板间：服务器先给你一张装修好的**照片**（HTML），你马上就能看到房子长什么样；随后施工队（JS）进场，把水电接通（注水），房子才能真正使用。

这里有个前提：**施工队手上的图纸必须和照片一致**。如果浏览器上渲染出来的结构和服务器给的 HTML 对不上，Vue 就会报“注水不匹配”，并可能丢弃服务器的结果重新渲染。很多 SSR 的坑都来自这一点。

## 2. 三种渲染方式怎么选

| 方式 | HTML 在哪里生成 | 首屏 | SEO | 适合 |
| --- | --- | --- | --- | --- |
| SPA | 浏览器里，由 JS 生成 | 要等 JS 下载执行 | 差 | 后台管理、需要登录的工具 |
| SSR | 服务器，每次请求时 | 快 | 好 | 内容经常变化且需要被搜索：电商、资讯 |
| SSG | 构建时预先生成 | 最快 | 好 | 内容不常变：博客、文档、官网 |

几个判断问题：

- 页面需要被搜索引擎收录、或者需要正确的分享卡片吗？不需要的话，SPA 最简单；
- 内容多久变一次？构建时就能确定的，用 SSG；每次请求都可能不同的，用 SSR；
- 团队有能力维护一个长期运行的 Node 服务吗？SSR 不能像 SPA 那样直接扔到静态托管上。

纯静态的内容站点（比如这个博客）用 VitePress 更省心；需要在一个项目里混合 SSR、SSG 和 SPA 时，Nuxt 的价值才真正体现出来。

## 3. 坑一：服务器报 `window is not defined`

**现象**：本地 SPA 开发时一切正常，接入 SSR 后，服务器一启动或一渲染页面就报错 `ReferenceError: window is not defined`（也可能是 `document`、`localStorage`）。

**原因**：同一份组件代码会在服务器（Node.js）上运行一次。Node.js 里没有浏览器的 `window`、`document`、`localStorage`。`setup` 顶层的代码、`created` 钩子都会在服务器上执行。

**修复**：

```js
import { onMounted } from 'vue'

// ❌ setup 顶层，服务器上也会执行
const width = window.innerWidth

// ✅ onMounted 只在浏览器里执行
onMounted(() => {
  width.value = window.innerWidth
})
```

第三方库在**被导入时**就访问 `window` 的，放在 `onMounted` 里也没用，因为 `import` 在文件开头就执行了。这时要在浏览器端动态导入：

```js
onMounted(async () => {
  const { default: Editor } = await import('some-browser-only-editor')
  editor = new Editor(el.value)
})
```

Nuxt 里还可以用 `import.meta.client` 判断当前环境，或者用 `<ClientOnly>` 组件包住只在浏览器渲染的部分，用 `.client.js` 后缀的插件只在浏览器加载。

## 4. 坑二：注水不匹配，时间差了 8 小时

**现象**：控制台出现 `Hydration text content mismatch`；页面上的“发布时间”刚打开时显示 `02:00`，一闪变成了 `10:00`。

**原因**：服务器和浏览器渲染出的内容不一样：

- 服务器运行在 UTC 时区，浏览器在北京时间（UTC+8），同一个时间戳格式化出来差了 8 小时；
- 渲染时用了 `Date.now()`、`Math.random()`，两边结果不同；
- 渲染时读取了 `localStorage` 里的值，服务器上没有。

**修复**：

- 格式化时间时**明确指定时区**，让两边结果一致：

```js
const formatted = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(article.publishedAt))
```

- 随机值、当前时间等由服务器生成一次，随数据一起传给浏览器复用；
- 依赖浏览器环境的内容（如“根据本地存储显示的个性化内容”），用 `<ClientOnly>` 包起来，只在浏览器渲染。

## 5. 坑三：同一个接口请求了两次

**现象**：Network 面板里，页面加载时又请求了一次文章接口，可文章内容明明已经在服务器返回的 HTML 里了。

**原因**：在 `setup` 里直接用 `fetch` / `$fetch` 获取数据，这段代码在服务器执行一次，到浏览器注水时又执行一次。

**修复**：Nuxt 里用 `useFetch` 或 `useAsyncData`。它们在服务器上获取数据后，会把结果序列化进 HTML；浏览器注水时直接复用这份数据，不再重复请求：

```vue
<script setup>
const route = useRoute()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`)
</script>
```

SSR 真正快的前提，就是**数据在服务器上就取好、和 HTML 一起返回**。如果服务器只渲染了一个空骨架、数据仍在浏览器里请求，那和 SPA 相比几乎没有优势。

## 6. 坑四：用户 A 看到了用户 B 的数据

**现象**：线上偶发事故：某个用户打开页面，右上角显示的却是另一个人的昵称。

**原因**：在服务器上，**同一个 Node 进程会同时处理很多用户的请求**。如果把用户信息存在模块顶层的变量里：

```js
// ❌ 模块顶层：服务器上所有请求共享这一个变量
export const currentUser = ref(null)
```

A 的请求刚把 `currentUser` 设成 A，B 的请求又把它改成了 B，A 的页面渲染时读到的就是 B。在浏览器里这样写没问题（一个浏览器只有一个用户），到了服务器就成了严重的数据泄露。

**修复**：所有和请求相关的状态都必须**按请求隔离**：

- Nuxt 里用 `useState('current-user', () => null)` 代替模块顶层的 `ref`，它在每个请求中是独立的；
- Pinia 在 Nuxt 中会为每个请求创建新实例，按 store 的方式使用即可；
- 自己搭建 SSR 时，每个请求都要创建新的应用实例、新的 router 和新的 store。

**怎么避免再犯**：SSR 项目里，审查所有“写在函数外面的可变状态”。

## 7. Nuxt 的渲染配置

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: true, // 默认开启；设为 false 则整个项目变成 SPA
  routeRules: {
    '/': { prerender: true },          // 首页构建时预渲染（SSG）
    '/blog/**': { prerender: true },   // 博客文章预渲染
    '/admin/**': { ssr: false }        // 后台只在浏览器渲染（SPA）
  }
})
```

`routeRules` 可以按路由选择渲染方式，一个项目里混合使用 SSR、SSG 和 SPA。

## 排查思路

1. **看服务器返回的 HTML**：右键“查看网页源代码”。内容在源代码里，说明服务器渲染生效了；源代码里只有空容器，说明数据或组件没在服务器上渲染。
2. **注水警告**：开发环境的控制台会指出不匹配的具体元素和内容，对照“服务器和浏览器有什么不同”（时间、随机数、本地存储、屏幕尺寸）去找。
3. **`window is not defined`**：看报错堆栈来自哪个文件。如果来自 `node_modules` 里的库，就是导入时访问了浏览器 API，需要改成浏览器端动态导入。
4. **数据串号**：在服务器日志里打印每个请求的请求 ID 和用户 ID，检查是否有模块级的可变状态。
5. **重复请求**：Network 面板里查看页面加载时浏览器发出的请求，和服务器已经获取过的数据对比。

## 检查清单

- [ ] 根据 SEO 需求、内容更新频率和团队运维能力选择渲染方式
- [ ] 浏览器 API 只在 `onMounted`、`<ClientOnly>` 或浏览器端动态导入中使用
- [ ] 时间格式化指定时区，渲染中不使用随机值和本地存储
- [ ] 首屏数据通过 `useFetch` / `useAsyncData` 在服务器获取
- [ ] 没有模块顶层的、按请求变化的可变状态
- [ ] 部署前确认服务器的 Node 版本、内存和进程守护方案

## 延伸阅读

- [前端与 SEO](/web/frontend/seo)：为什么搜索引擎需要服务器渲染的 HTML
- [Pinia 状态管理](/web/vue/pinia)：SSR 下 store 的隔离
- [从 VuePress 到 VitePress](/web/vue/vuepress)：静态生成的另一种选择
