---
title: 从 VuePress 到 VitePress
description: 用迁移清单完成文档站升级，并以可重复的构建流程发布到 GitHub Pages。
---

# 从 VuePress 到 VitePress

VuePress 与 VitePress 都用 Markdown 构建文档站，但它们的配置、主题 API 和构建底层不同。迁移时先保护内容和链接，再逐步替换配置，不要把“升级依赖”和“重做站点”混成一次不可验证的大改动。

## 迁移前先盘点三类内容

| 内容 | 迁移重点 |
| --- | --- |
| Markdown | 标题层级、Frontmatter、内部链接、代码块 |
| 配置 | 导航、侧边栏、站点标题、部署路径 |
| 扩展 | VuePress 插件、主题覆盖、自定义组件 |

先列出原来的 URL，尤其是被外部引用的文章路径。迁移后的文件名和目录尽量保持不变；如必须调整，应明确配置重定向或保留旧入口。

## 最小 VitePress 项目结构

```text
docs/
├── .vitepress/
│   ├── config.mts
│   └── theme/
│       ├── index.ts
│       └── custom.css
├── index.md
└── web/
    └── vue/
        └── axios.md
```

安装并提供本地开发、构建、预览脚本：

```sh
npm install -D vitepress vue
npm run docs:dev
npm run docs:build
npm run docs:preview
```

实际命令应以项目 `package.json` 为准。团队使用锁文件时，CI 应通过 `npm ci` 等可复现的安装方式执行。

## 配置站点的公共信息

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '野塘漫水',
  description: '前端开发手记',
  cleanUrls: true,
  themeConfig: {
    nav: [{ text: '笔记首页', link: '/' }]
  }
})
```

`cleanUrls` 能让页面地址去掉 `.html`，但开启前应先确认部署平台是否支持无扩展名的静态路由。自定义域名站点通常以根路径发布；若发布在仓库子路径下，再设置 `base`。

## 用 GitHub Actions 发布

构建成功后，将 `docs/.vitepress/dist` 作为部署目录。工作流应只做三件事：检出代码、按锁文件安装依赖、运行构建并发布产物。

```yaml
- name: Install dependencies
  run: npm ci

- name: Build with VitePress
  run: npm run docs:build
```

不要在部署脚本中写入账号、令牌或私钥。发布权限应使用平台提供的临时令牌或仓库机密配置；域名信息则放在受版本控制的 `CNAME` 文件中。

## 迁移验收清单

- `npm run docs:build` 在干净环境中通过。
- 首页、每个侧边栏入口和文内链接都没有 404。
- 桌面与移动宽度下，导航、搜索和代码块可以正常使用。
- 自定义域名、站点根路径、图标和分享元信息正确。
- 对照原站确认关键 URL 未变化，或已提供兼容入口。

迁移的完成标志不是“页面看起来差不多”，而是内容、链接和发布流程都能被稳定地重复验证。
