---
title: 从 VuePress 到 VitePress
description: 以本博客的迁移为例，讲清 VitePress 的工作方式和迁移步骤，并整理正文里的花括号导致构建失败、死链拦截构建、子路径部署 404、最后更新时间全部相同、旧链接失效等真实踩过的坑。
---

# 从 VuePress 到 VitePress

这个博客最初用 VuePress 搭建，后来迁移到了 VitePress，并通过 GitHub Actions 自动发布到 GitHub Pages。迁移本身不难，难的是一些“构建突然失败”“上线后链接 404”之类的细节。这篇把迁移步骤和踩过的坑整理出来。

::: tip 读完这篇你会
- 理解 VitePress 怎么把 Markdown 变成网站
- 按清单完成迁移，并保证原有链接不失效
- 避开模板语法冲突、死链、部署路径、更新时间等常见问题
:::

## 1. 原理：每篇 Markdown 都会变成一个 Vue 组件

VitePress 的构建过程大致是：

```text
Markdown 文件
  → markdown-it 解析成 HTML
  → 包装成 Vue 单文件组件
  → 构建时预渲染成静态 HTML（每篇一个文件，搜索引擎直接可读）
  → 浏览器加载后注水，之后站内跳转像单页应用一样不刷新页面
```

理解第三步非常重要：**Markdown 正文会被当作 Vue 模板处理**。这意味着你可以在 Markdown 里直接使用 Vue 组件和插值语法，同时也意味着正文里的某些文字会被 Vue“误解”，后面的第一个坑就来自这里。

## 2. 迁移前先盘点

| 内容 | 要检查什么 |
| --- | --- |
| Markdown | 标题层级、Frontmatter 字段、内部链接写法、代码块 |
| 配置 | 导航、侧边栏、站点标题、部署路径 |
| 扩展 | VuePress 插件、主题覆盖、自定义组件分别用什么替代 |
| URL | 列出所有对外可访问的地址，尤其是被别人引用过的文章 |

原则：**先保住内容和链接，再改造样式和功能**。不要把“升级工具”和“重新设计网站”混在一次改动里，否则出了问题很难分清是哪一步造成的。

## 3. 最小项目结构

```text
docs/
├── .vitepress/
│   ├── config.mjs        # 站点配置
│   └── theme/
│       ├── index.ts      # 主题入口
│       └── custom.css    # 自定义样式
├── public/               # 原样复制的静态文件（图标、CNAME）
├── index.md              # 首页
└── web/
    └── vue/
        └── axios.md      # 对应 /web/vue/axios
```

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

```js
// docs/.vitepress/config.mjs
import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '野塘漫水',
  description: '前端开发手记',
  cleanUrls: true, // 地址不带 .html
  lastUpdated: true,
  themeConfig: {
    nav: [{ text: '笔记首页', link: '/' }]
  }
})
```

## 4. 坑一：正文里写了花括号，构建直接失败

**现象**：一篇讲 Vue 模板语法的文章，正文里写了一句“用双花括号插值显示变量”，并且直接写出了带变量名的双花括号。本地开发时页面报错，构建时失败。

**原因**：Markdown 会被当作 Vue 模板处理（见第 1 节），正文里的双花括号被 Vue 当成了插值表达式，去计算一个根本不存在的变量。同理，正文里直接写 `<script>`、或者某个组件名的尖括号标签，也可能被当成真正的标签。

**修复**：

- 代码、标签名、模板语法一律放在行内代码（反引号）或代码块里，VitePress 会自动跳过对它们的模板处理；
- 一大段内容都需要原样显示时，用 `v-pre` 容器把它包起来。

**怎么避免再犯**：写技术文章时养成习惯，凡是代码相关的内容都用反引号包起来。

## 5. 坑二：一个错误链接让整个构建失败

**现象**：改了一篇文章的文件名后，构建报错 `Found dead link /xxx in file yyy.md`，部署也停了。

**原因**：VitePress 默认会在构建时检查所有站内链接，发现指向不存在页面的链接（死链）就让构建失败。

**处理**：这其实是一道很好的保护，它能在发布前拦住失效的链接。正确的做法是修正链接，而不是关掉检查。确实需要保留的特殊链接（比如示例里的 `localhost` 地址），可以在配置里用 `ignoreDeadLinks` 精确地忽略特定模式。

**怎么避免再犯**：改文件名、移动文章时，全局搜索旧路径并一起更新；每次提交前在本地跑一次构建。

## 6. 坑三：部署后页面空白，资源全部 404

**现象**：网站部署到 `https://用户名.github.io/仓库名/` 后，页面空白，Network 面板里 CSS 和 JS 都是 404。

**原因**：VitePress 默认站点部署在域名根路径 `/`，资源地址是 `/assets/...`。部署在仓库子路径下时，正确的地址应该是 `/仓库名/assets/...`。

**修复**：部署在子路径时设置 `base`：

```js
export default defineConfig({
  base: '/仓库名/'
})
```

使用自定义域名（在 `docs/public/CNAME` 文件里写上域名）并以根路径访问时，就不需要设置 `base`。

## 7. 坑四：所有页面的“最后更新时间”都一样

**现象**：开启 `lastUpdated` 后，本地预览时每篇文章显示各自的修改时间；部署到线上后，所有页面的“最后更新”都变成了同一个时间。

**原因**：VitePress 通过 `git log` 读取每个文件最后一次提交的时间。GitHub Actions 的 checkout 默认只拉取最新的一个提交（浅克隆），没有历史记录，所有文件都只能拿到这一个提交的时间。

**修复**：checkout 时拉取完整历史：

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    fetch-depth: 0 # lastUpdated 需要完整的 git 历史
```

## 8. 坑五：迁移后，别人收藏的旧链接失效了

**现象**：迁移上线后，从搜索引擎和别人博客里点进来的链接大量 404。

**原因**：新旧站点的 URL 规则不同，比如旧站是 `/web/vue/axios.html`，新站开启 `cleanUrls` 后是 `/web/vue/axios`；或者迁移时顺手改了目录结构。

**修复**：

- 迁移时尽量保持文件名和目录不变；
- 部署平台支持时，配置旧地址到新地址的重定向；
- GitHub Pages 这类静态托管通常能同时响应带 `.html` 和不带后缀的地址，但上线前要实际访问几个旧链接确认。

## 9. 用 GitHub Actions 自动发布

推荐使用 GitHub 官方的 Pages 部署方式：构建任务把 `docs/.vitepress/dist` 上传为 Pages 产物，部署任务再把它发布出去。这样不需要把构建产物提交回仓库，也不需要给工作流写仓库的权限：

```yaml
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci               # 按锁文件安装，结果可复现
      - run: npm run docs:build
      - uses: actions/upload-pages-artifact@v4
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

工作流里不要写任何账号、令牌或私钥，部署权限使用平台提供的临时凭据即可。

## 迁移验收清单

- [ ] `npm run docs:build` 在干净的环境里能通过
- [ ] 首页、侧边栏每个入口、文章里的链接都能打开
- [ ] 旧站的关键 URL 在新站能访问，或者有重定向
- [ ] 桌面和手机宽度下，导航、搜索、代码块都正常
- [ ] 自定义域名、部署路径、图标和页面标题正确
- [ ] 线上“最后更新时间”按文章各自显示

## 延伸阅读

- [VitePress 内容能力](/web/vue/vuepress-plugin)：容器、代码块和主题扩展
- [持续集成与发布](/engineering/ci-delivery)：把构建检查放进流水线
- [前端与 SEO](/web/frontend/seo)：静态生成对搜索引擎的好处
