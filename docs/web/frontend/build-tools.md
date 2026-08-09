---
title: 构建工具选型
description: 搞清楚 Vite、Webpack、Rollup 各自擅长什么，而不是看哪个火就用哪个。
---

# 构建工具选型

前端构建工具不是"选最火的"，而是"选最匹配项目场景的"。Vite 快、Webpack 生态成熟、Rollup 产物干净——它们解决的核心问题都是把模块化的源码打包成浏览器能用的产物，但路径和取舍完全不同。本篇讲构建工具在做什么、各自的特点，以及何时需要自定义构建。

## 构建工具在做什么

浏览器原生不支持 `import` 大量零散文件（性能差）、不支持 JSX/TS/Vue 单文件组件、不会压缩代码、不理解 tree-shaking。构建工具的工作就是把这些"开发态"的东西转换成"运行态"的产物：

| 工作 | 说明 |
| --- | --- |
| 模块打包 | 把多个文件合并成少量产物，减少请求数 |
| 转译 | JSX、TypeScript、新语法 → 浏览器能运行的 JS |
| CSS 处理 | Sass/Less → CSS、加前缀、提取到单独文件 |
| 资源处理 | 图片、字体转成合适的引用方式 |
| 代码压缩 | 移除空白、缩短变量名，减小体积 |
| Tree-shaking | 移除未使用的代码 |
| HMR | 开发时改代码热更新，不刷新整页 |

```text
源码（模块化、TS、JSX、Sass）
        ↓ 构建工具
产物（压缩后的 JS/CSS/HTML，浏览器可直接运行）
```

## 三种主流工具的特点

| 工具 | 开发体验 | 产物质量 | 生态 | 强项 |
| --- | --- | --- | --- | --- |
| Vite | 极快（ESM 原生加载） | 好（生产用 Rollup） | 成长中，主流库都支持 | 开发服务器快、配置简单 |
| Webpack | 中等（需优化） | 可控（配置灵活） | 最成熟，插件最多 | 大型应用、复杂定制 |
| Rollup | 慢（不做 dev server） | 最干净 | 中等 | 打包库、SDK |

### Vite：开发快是核心优势

Vite 的开发服务器利用浏览器原生 ESM——不打包，按需编译请求的模块，所以启动几乎是即时的，项目多大都不会慢。生产构建用 Rollup，产物质量好。

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router']
        }
      }
    }
  }
})
```

适合：新项目、中小型应用、对开发体验敏感的团队。

### Webpack：生态最成熟

Webpack 配置复杂，但它的插件生态最完整，几乎能处理任何场景。大型企业应用、需要复杂定制的场景，Webpack 仍然是稳妥选择。

```js
// webpack.config.js
module.exports = {
  entry: './src/index.js',
  output: { filename: '[name].[contenthash].js', path: 'dist' },
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  plugins: [new HtmlWebpackPlugin({ template: './index.html' })]
}
```

适合：已有 Webpack 项目、需要特殊插件（Webpack 都有）、大型应用。

### Rollup：库的首选

Rollup 的 tree-shaking 最干净，产物体积小、格式灵活（ESM/CJS/UMD），适合打包给别的项目用的库：

```js
// rollup.config.js
export default {
  input: 'src/index.js',
  output: [
    { file: 'dist/bundle.cjs.js', format: 'cjs' },
    { file: 'dist/bundle.esm.js', format: 'esm' }
  ],
  external: ['react'],  // 不打包 peer 依赖
  plugins: [/* ... */]
}
```

适合：npm 包、组件库、SDK。不适合做应用（没有 dev server）。

## 开发体验：HMR 是关键

开发时改一行代码，希望页面只更新变化的部分，不整页刷新。这就是 HMR（Hot Module Replacement）。

| 工具 | HMR 速度 | 机制 |
| --- | --- | --- |
| Vite | 极快 | 改哪个模块就重新请求哪个，浏览器原生 ESM |
| Webpack | 快（需配置） | 重新编译受影响的 chunk |
| Turbopack | 极快（Rust 实现） | Next.js 生态 |

Vite 的 HMR 几乎是即时的，因为它不打包——开发态下每个模块是一个独立请求，改动只重新编译那一个文件。Webpack 需要重新构建受影响的模块依赖图。

## 生产优化

构建工具的生产配置决定了最终用户的加载速度：

| 优化 | 做法 | 工具配置 |
| --- | --- | --- |
| 代码分割 | 按路由/动态 import 拆 chunk | `SplitChunksPlugin` / `manualChunks` |
| Tree-shaking | 移除未使用代码 | 生产模式自动启用 |
| 压缩 | JS/CSS/HTML 压缩 | `TerserPlugin` / `esbuild` |
| 资源指纹 | 文件名加 hash，利于缓存 | `[name].[contenthash].js` |
| 懒加载 | 路由和重组件动态 import | `import('./lazy.js')` |

```js
// 动态 import：按需加载，不进主 bundle
const LazyModule = () => import('./LazyComponent.vue')
```

```js
// 分离第三方依赖，长期缓存
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['vue', 'vue-router', 'pinia'],
        ui: ['some-ui-lib']
      }
    }
  }
}
```

## 何时需要自定义构建

大多数项目用框架脚手架的默认配置就够了（`create-vite`、`create-next-app`、Vue CLI）。需要自定义的信号：

| 信号 | 说明 |
| --- | --- |
| 多入口/多页面 | 默认单入口配置不够 |
| 特殊资源处理 | 如 WebGL shader、特殊字体 |
| 微前端 | 多个子应用独立构建再组合 |
| 库开发 | 需要输出多种格式 |
| 复杂环境变量 | 多环境部署、按环境注入配置 |

> 如果你的自定义构建逻辑超过几百行，停下来想想是不是工具选错了。成熟框架的脚手架已经覆盖了 95% 的场景，与其维护一套复杂配置，不如换更贴合的工具。

## 迁移和共存

从 Webpack 迁到 Vite 是常见诉求（为了开发速度）。迁移要点：

- 渐进式：先用 Vite 做开发服务器，生产仍用 Webpack，验证无问题后再统一切换。
- 检查插件依赖：Webpack 专有插件在 Vite 没有对应，要找替代或自己实现。
- 路径别名、环境变量：两套工具配置方式不同，要同步。

不要为了"用新工具"而迁移。迁移的收益（开发速度、维护成本）要明确大于迁移成本。

## 务实的检查清单

- 是否基于项目类型选工具（应用用 Vite/Webpack，库用 Rollup）？
- 生产构建是否做了代码分割、压缩、资源指纹？
- 第三方依赖是否分离到独立 chunk，利于长期缓存？
- 路由和重组件是否用了动态 import 懒加载？
- 构建配置是否尽量简单，避免过度自定义？
- 是否定期检查 bundle 产物体积（如 bundle analyzer）？

构建工具是手段，不是目的。选对工具的标准是"它解决了你的问题而不给你添新问题"。Vite 不是万能药，Webpack 也不是过时货——匹配项目阶段和团队能力的，就是对的。
