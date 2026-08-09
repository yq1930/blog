---
title: JavaScript 模块化演进
description: 从 IIFE 到 ESM，理解每一种方案解决了什么、为什么 ESM 是终点。
---

# JavaScript 模块化演进

JavaScript 一开始没有模块系统。从全局函数到 IIFE，再到 CommonJS、AMD，最后到 ES Modules，每一次演进都是为了解决上一代的真实痛点。理解这条线，你才能理解为什么今天的打包工具、tree-shaking、按需加载都建立在 ESM 之上。

## 先看每代方案解决了什么

| 方案 | 时代 | 解决的问题 | 留下的限制 |
| --- | --- | --- | --- |
| 全局变量 / 命名空间 | 早期 | 无 | 命名冲突、依赖顺序靠人工维护 |
| IIFE 模块模式 | 2000s | 隔离作用域、私有成员 | 依赖关系仍需手工排序 |
| CommonJS (CJS) | Node 诞生 | 服务端模块、`require`/`module.exports` | 同步加载，不适合浏览器 |
| AMD (RequireJS) | 浏览器侧 | 异步加载、声明依赖 | 写法繁琐、生态萎缩 |
| UMD | 兼容期 | 一份代码跨 CJS/AMD/全局 | 臃肿的运行时判断 |
| ES Modules (ESM) | ES2015 | 静态结构、语言级标准、支持 tree-shaking | 老环境需要打包/转译 |

## IIFE：用闭包隔离作用域

在没有模块系统的年代，唯一能创建作用域的就是函数。把模块代码包进一个立即执行的函数，私有变量不会泄漏到全局：

```js
var Counter = (function () {
  var count = 0
  return {
    inc() { return ++count },
    get() { return count }
  }
})()
```

它解决了污染，但解决不了依赖：脚本加载顺序、跨文件引用仍靠人工和 `<script>` 标签顺序保证。

## CommonJS：服务端的同步模块

Node.js 把模块标准化：每个文件是一个模块，`require` 同步导入，`module.exports` 导出。

```js
// math.js
function add(a, b) { return a + b }
module.exports = { add }

// app.js
const { add } = require('./math')
```

CJS 是**运行时**加载：`require` 执行到那行才读文件并求值。这让它能动态决定加载什么，但也意味着依赖关系在执行前不可知——浏览器没法用它（不能同步阻塞去拉网络文件）。

## AMD：浏览器侧的异步方案

RequireJS 提出的 AMD 把"声明依赖 + 异步加载"合在一起：

```js
define(['jquery', './math'], function ($, math) {
  return { calc: (x) => math.add(x, 1) }
})
```

它解决了浏览器的异步问题，但回调地狱式的写法和构建配置复杂度让多数项目苦不堪言。今天 AMD 已经基本退场。

## ESM：静态、标准、未来

ES2015 把模块做进了语言本身。`import` / `export` 是**静态声明**，在编译期就能确定依赖图：

```js
// math.js
export function add(a, b) { return a + b }
export const PI = 3.14

// app.js
import { add, PI } from './math.js'
```

静态结构的三个直接收益：

1. **tree-shaking**：打包工具能分析出哪些导出没被使用，把它们从最终产物里删掉。
2. **静态分析**：IDE 跳转、类型检查、循环依赖检测都依赖它。
3. **顶层 await / 异步加载**：`import()` 动态导入返回 Promise，是按需加载的标准方式。

| 特性 | CJS | ESM |
| --- | --- | --- |
| 加载时机 | 运行时同步 | 静态分析 + 异步执行 |
| 是否支持 tree-shaking | 否（导出是动态对象） | 是 |
| 动态导入 | `require(var)` 任意表达式 | `import()` 字符串字面量 |
| 循环依赖 | 行为复杂、不可预测 | 有定义但建议避免 |
| `this` 顶层值 | `module.exports` | `undefined` |

## 动态 import 与按需加载

静态 `import` 必须在顶层、字符串固定，用于主路径依赖。`import()` 是函数形式，可以放在任意位置，常配合路由做代码分割：

```js
const router = {
  async showEditor() {
    const { Editor } = await import('./Editor.js')
    return new Editor()
  }
}
```

打包工具会把 `import('./Editor.js')` 单独切成一个 chunk，用户进入编辑页时才下载。

## 循环依赖：能避免就避免

ESM 对循环依赖有规范，但行为微妙：被循环引用的模块在首次执行时，对方还未导出的绑定会是 `undefined`。

```js
// a.js
import { b } from './b.js'
export const a = () => b()

// b.js
import { a } from './a.js'
export const b = () => 1
export const usesA = () => a()
```

如果调用时机晚于两个模块都执行完毕，通常没事；但如果在模块顶层立即使用对方导出，就会拿到 `undefined`。出现循环依赖通常是架构分层问题，应该重构（抽出公共模块到下层）而不是硬绕。

## 与打包工具的关系

浏览器原生支持 `<script type="module">`，但生产环境几乎都用打包工具（Vite、Webpack、Rollup、esbuild）。原因：

- 合并请求、压缩、摇树优化体积。
- 转译新语法、兼容老浏览器。
- 处理 CSS、图片、JSON 等非 JS 资源。

Vite 的开发服务器直接利用浏览器原生 ESM 按需加载，生产用 Rollup 打包，是当前主流选择。理解 ESM 之后，"为什么 Vite 这么快""为什么 tree-shaking 对 CJS 库无效"这类问题自然就有了答案。

## 检查表

- 新代码一律用 ESM 的 `import` / `export`，别再写 CJS 或 AMD。
- 库的入口用 `pkg.exports` 同时提供 ESM 和 CJS，方便不同消费方。
- 大组件、路由页用 `import()` 做按需加载，减小首屏体积。
- 出现循环依赖优先重构分层，不要依赖规范里的微妙行为。
- 用 `sideEffects: false` 标记纯 ESM 包，让 tree-shaking 生效。
