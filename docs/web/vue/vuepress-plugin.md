---
title: VitePress 内容能力
description: 不装插件也能把文档写好：Frontmatter、侧边栏、本地搜索、提示容器、代码块高亮和引入、在 Markdown 里用 Vue 组件、扩展默认主题，以及侧边栏不高亮、自定义组件构建报错等常见问题。
---

# VitePress 内容能力

文档站好不好用，主要取决于内容组织，而不是插件数量。VitePress 自带的能力已经覆盖了绝大多数需求：页面信息、导航和侧边栏、本地搜索、提示框、代码块增强、在 Markdown 里用 Vue 组件。这篇介绍这些能力的用法，以及使用过程中常遇到的问题。

::: tip 读完这篇你会
- 用 Frontmatter、导航和侧边栏组织文档结构
- 用提示容器、代码块增强让技术文章更好读
- 扩展默认主题、在文章里使用 Vue 组件，并避开常见的构建问题
:::

## 1. Frontmatter：每篇文章的“说明书”

每篇 Markdown 顶部的 YAML 区块，用来设置这一页的信息：

```md
---
title: Axios 请求层
description: 把请求配置、登录态和错误处理收进一个请求层。
outline: [2, 3]
---
```

- `title`：浏览器标签页标题、搜索结果标题；
- `description`：搜索引擎摘要和分享卡片的描述，写“读者能解决什么问题”，而不是重复标题；
- `outline`：右侧目录显示哪几级标题。

## 2. 导航和侧边栏

顶部导航放少量一级入口，侧边栏放当前主题下的连续阅读路径：

```js
// docs/.vitepress/config.mjs
export default defineConfig({
  themeConfig: {
    nav: [
      { text: '前端', link: '/web/JavaScript/ES6' },
      { text: '后端', link: '/backend/overview' }
    ],
    sidebar: {
      '/web/vue/': [
        {
          text: 'Vue 与站点',
          items: [
            { text: 'Axios 请求层', link: '/web/vue/axios' },
            { text: '路由与页面状态', link: '/web/vue/router' }
          ]
        }
      ]
    }
  }
})
```

`sidebar` 的键是路径前缀：访问 `/web/vue/` 开头的页面时，显示这一组侧边栏。

### 坑一：页面能打开，侧边栏却不高亮

**现象**：点击侧边栏进入文章后，当前文章在侧边栏里没有高亮；或者进入某篇文章时侧边栏整个消失了。

**原因**：侧边栏里的 `link` 和页面实际地址不一致，比如多写了 `.md` 后缀、大小写不一致、少了开头的 `/`；侧边栏消失则通常是页面路径不匹配任何一个 `sidebar` 的前缀。

**修复**：`link` 统一写成以 `/` 开头、不带后缀、与文件路径完全一致的形式，比如文件 `docs/web/vue/axios.md` 对应 `/web/vue/axios`。

## 3. 本地搜索

```js
export default defineConfig({
  themeConfig: {
    search: { provider: 'local' }
  }
})
```

内置的本地搜索在构建时生成索引，不需要任何外部服务。搜索效果主要取决于内容：标题写清楚、段落开头直接回答问题，比调整搜索配置有效得多。文章很多时索引文件会变大，构建时可能出现“chunk 超过 500KB”的提示，这是索引体积的正常表现，可以按需调整提示阈值。

## 4. 提示容器：让重点跳出来

VitePress 内置了几种提示容器，本站文章里的“读完这篇你会”就是用它做的：

```md
::: tip 小提示
一般性的建议。
:::

::: warning 注意
容易出错的地方。
:::

::: danger 危险
可能造成数据丢失或安全问题的操作。
:::

::: details 点击展开
默认折叠的补充内容，适合放进阶说明。
:::
```

效果如下：

::: warning 注意
容器适合放真正需要强调的内容。一页里到处都是提示框，读者反而不知道该看哪里。
:::

## 5. 代码块增强

技术文章里，代码块是最重要的内容之一。VitePress 提供了几种实用的增强：

**高亮指定行**：在语言名后面写行号，比如 `js{2,4-5}`，第 2 行和第 4～5 行会被高亮。

```js{2}
const http = axios.create({
  timeout: 15_000, // 这一行被高亮了
  baseURL: import.meta.env.VITE_API_BASE_URL
})
```

**标出增删的行**：在行尾加上注释标记 `// [!code ++]` 或 `// [!code --]`，渲染时会显示为新增（绿色）或删除（红色），非常适合写“修改前后”的对比。类似地，`// [!code focus]` 可以聚焦某一行，`// [!code error]` 和 `// [!code warning]` 可以标出错误和警告。

**代码组**：把同一段代码的不同写法放在一组标签页里：

````md
::: code-group

```sh [npm]
npm install -D vitepress
```

```sh [pnpm]
pnpm add -D vitepress
```

:::
````

**从文件引入代码**：在单独一行写 `<<< @/snippets/useCounter.js`（`@` 指向文档根目录），构建时会把那个文件的内容插入为代码块。示例代码放在真实文件里，可以单独运行和测试，避免文章里的代码“看起来对、实际跑不通”。

## 6. 在 Markdown 里使用 Vue 组件

因为每篇 Markdown 都会被编译成 Vue 组件，所以可以直接在文章里写组件，做出可交互的示例：

```md
<script setup>
import Counter from '../components/Counter.vue'
</script>

下面是一个可以点击的计数器：

<Counter :initial="3" />
```

### 坑二：自定义组件导致构建失败

**现象**：本地 `docs:dev` 时组件一切正常，`docs:build` 时报 `window is not defined` 或 `document is not defined`。

**原因**：开发时页面只在浏览器里渲染；构建时，VitePress 要在 Node.js 环境里**预渲染**每个页面，组件里直接访问浏览器 API 的代码会在服务器上执行，于是报错。原理和 [SSR 与 Nuxt 入门](/web/vue/ssr) 中讲的完全一样。

**修复**：浏览器 API 放进 `onMounted`；依赖浏览器环境的第三方库，在 `onMounted` 里动态导入；整个组件都只能在浏览器渲染时，用 VitePress 内置的 `ClientOnly` 组件包起来。

### 坑三：正文中的花括号和尖括号被当成模板

正文里出现的双花括号会被当成 Vue 插值，尖括号标签会被当成组件或 HTML 标签。凡是代码相关的内容，都用反引号或代码块包起来，详见 [从 VuePress 到 VitePress](/web/vue/vuepress)。

## 7. 扩展默认主题

需要改品牌色、字体时，先覆盖默认主题提供的 CSS 变量：

```js
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme
}
```

```css
/* docs/.vitepress/theme/custom.css */
:root {
  --vp-c-brand-1: #167f84;
  --vp-font-family-base: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

需要更大的改动（比如本站的首页是完全自定义的），可以提供自己的 `Layout` 组件：首页使用自定义组件，其他页面仍然使用默认主题的布局。

```vue
<!-- docs/.vitepress/theme/Layout.vue -->
<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import Home from './Home.vue'

const { frontmatter } = useData()
</script>

<template>
  <Home v-if="frontmatter.layout === 'home'" />
  <component :is="DefaultTheme.Layout" v-else />
</template>
```

改样式时，同时检查文章正文、侧边栏、移动端、键盘焦点样式，不要为了好看牺牲长文阅读体验。

## 8. 什么时候才需要插件

- 用配置、Markdown 写法或 CSS 能解决的，不装插件；
- 确实需要插件时，先看它的维护状态、支持的 VitePress 版本、对构建时间的影响；
- 插件配置集中放在 `.vitepress` 目录里，不要分散到每篇文章中。

## 排查思路

1. **侧边栏或导航异常**：对比 `config` 里的 `link` 和文件的实际路径，注意大小写和后缀。
2. **构建报错而开发正常**：多半是组件在服务端预渲染时访问了浏览器 API，或者正文里有被当成模板的花括号、标签。看报错信息里提到的文件名，定位到具体文章。
3. **样式不生效**：在 DevTools 里查看默认主题的变量名，确认覆盖的是正确的 CSS 变量。
4. **每次提交前**在本地运行一次 `npm run docs:build`，死链、模板错误都会在这里暴露。

## 检查清单

- [ ] 每篇文章都有准确的 `title` 和 `description`
- [ ] 侧边栏链接与文件路径完全一致
- [ ] 提示容器只用于真正需要强调的内容
- [ ] 修改前后的代码对比使用增删标记
- [ ] 文章中的自定义组件能在服务端预渲染
- [ ] 代码、标签名、模板语法都放在反引号或代码块中
- [ ] 主题定制优先使用 CSS 变量

## 延伸阅读

- [从 VuePress 到 VitePress](/web/vue/vuepress)：迁移步骤和部署
- [SSR 与 Nuxt 入门](/web/vue/ssr)：为什么构建时会报 `window is not defined`
- [CSS 变量与主题系统](/web/css/design-tokens)：主题定制的原理
