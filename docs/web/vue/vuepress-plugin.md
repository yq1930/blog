---
title: VitePress 内容能力
description: 用配置、Frontmatter 和主题扩展组织文档站，而不是为了功能堆叠插件。
---

# VitePress 内容能力

文档站的体验主要来自内容结构，而不是插件数量。VitePress 已经提供导航、侧边栏、本地搜索、页面元信息和主题扩展能力；先把这些基础能力组织好，再判断是否需要额外扩展。

## Frontmatter：页面的说明书

每篇 Markdown 顶部都可以放 YAML Frontmatter，为页面提供标题、描述和显示选项。

```md
---
title: Axios 请求层
description: 将请求配置、错误处理与业务接口分层。
outline: [2, 3]
---

# Axios 请求层
```

标题和描述会参与浏览器标题、搜索和分享预览。它们应描述读者能获得什么，而不是只重复文件名。

## 导航和侧边栏来自同一份信息架构

顶栏适合放少量一级入口；侧边栏适合放当前主题下的连续阅读路径。不要把每篇文章都塞进顶栏。

```ts
// docs/.vitepress/config.mts
import { defineConfig } from 'vitepress'

export default defineConfig({
  themeConfig: {
    nav: [
      { text: 'JavaScript', link: '/web/JavaScript/ES6' },
      { text: 'Vue', link: '/web/vue/axios' }
    ],
    sidebar: {
      '/web/vue/': [
        {
          text: 'Vue 与站点',
          items: [
            { text: 'Axios 请求层', link: '/web/vue/axios' }
          ]
        }
      ]
    }
  }
})
```

路径前缀和 Markdown 文件路径要保持一致，否则页面虽然能打开，侧边栏也可能无法高亮。

## 本地搜索优先满足知识库需求

对于内容量不大的个人或团队笔记，内置本地搜索无需额外服务即可工作。

```ts
export default defineConfig({
  themeConfig: {
    search: { provider: 'local' }
  }
})
```

搜索质量取决于内容：使用明确标题、段落开头直接回答问题、为代码示例添加上下文，比调整搜索界面更有效。

## 主题扩展只承担品牌与体验差异

默认主题已经覆盖文档页的主要交互。需要个性化时，先通过 CSS 变量调整颜色、字体、边框和代码块，再考虑替换布局组件。

```ts
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme
}
```

自定义样式要同时检查文档正文、侧栏、移动端、键盘焦点和减少动态效果偏好。视觉变化不能牺牲长文阅读和导航效率。

## 添加能力前的判断

- 用配置、Markdown 或 CSS 能解决的问题，不要引入插件。
- 外部插件要确认维护状态、体积、兼容的 VitePress 版本和失败降级方案。
- 将插件的用途和配置集中在 `.vitepress`，避免散落在每篇文章中。
- 每增加一项能力，都检查构建时间、移动端与无 JavaScript 降级体验。

好的文档站并不显得“功能很多”，而是读者总能找到下一步该去哪里。
