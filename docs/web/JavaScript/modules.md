---
title: JavaScript 模块化演进
description: 从全局变量到 ES Module，讲清每种模块方案解决了什么，并修复 import/require 混用报错、默认导出取不到、循环依赖、动态导入 404 和 tree-shaking 失效等问题。
---

# JavaScript 模块化演进

模块相关的报错是新手最容易被劝退的一类，因为它们看起来和业务代码毫无关系：

- `Cannot use import statement outside a module`
- `require is not defined in ES module scope`
- `The requested module does not provide an export named 'default'`
- `Cannot access 'xxx' before initialization`
- 只用了库里的一个函数，打包体积却多了几百 KB

要看懂这些报错，需要知道 JavaScript 的模块系统是怎么一步步演进来的，以及今天并存的两套规则（CommonJS 和 ES Module）有什么区别。

::: tip 读完这篇你会
- 说清 CommonJS 和 ES Module 的核心区别
- 解决 import/require 混用、默认导出与具名导出混淆的报错
- 发现和拆解循环依赖，让动态导入和 tree-shaking 真正生效
:::

## 1. 为什么需要模块

早期的网页脚本都写在全局作用域里，就像几个人合租一套房子、共用一个冰箱：你放了一瓶叫 `utils` 的牛奶，别人也放了一瓶叫 `utils` 的果汁，后放的那个就把前一个覆盖了。而且谁依赖谁，全靠 `<script>` 标签的顺序，顺序一乱就报 `xxx is not defined`。

模块化就是给每个人一间独立公寓：**每个文件有自己的作用域，想给别人用的东西明确导出（export），想用别人的东西明确导入（import）**。

## 2. 一张表看懂演进

| 方案 | 写法 | 解决了什么 | 留下的问题 |
| --- | --- | --- | --- |
| 全局变量 | `window.utils = {}` | — | 命名冲突，依赖顺序靠人工 |
| IIFE | `(function () { ... })()` | 用函数作用域隔离私有变量 | 依赖顺序仍靠人工 |
| CommonJS | `require` / `module.exports` | Node.js 的标准模块，依赖声明清晰 | 同步加载，不适合浏览器直接用 |
| AMD | `define([...], fn)` | 浏览器异步加载 | 写法繁琐，已基本退场 |
| UMD | 运行时判断环境 | 一份代码兼容多种环境 | 臃肿，仅老库还在用 |
| **ES Module** | `import` / `export` | 语言标准、静态分析、浏览器和 Node 都支持 | 老环境需要打包转译 |

今天写新代码只需要 ES Module，但你用的 npm 包里仍有大量 CommonJS，所以两套规则都要懂。

## 3. 原理：CommonJS 和 ES Module 的核心区别

**CommonJS 是“运行到那一行才去拿”**：`require` 是一个普通函数，执行到它时才去读文件、执行模块，然后返回 `module.exports` 对象。

```js
// math.cjs
let count = 0
function inc() { count += 1 }
module.exports = { count, inc }

// main.cjs
const math = require('./math.cjs')
math.inc()
console.log(math.count) // 0 —— 导出时 count 的值被复制进了对象
```

**ES Module 是“编译前就确定依赖关系”**：`import` / `export` 必须写在顶层、路径必须是固定字符串，工具不用运行代码就能画出完整的依赖图。导入的是**活的绑定**，导出方修改后导入方能看到最新值（详见 [ES6 一文](/web/JavaScript/ES6)）。

| 对比 | CommonJS | ES Module |
| --- | --- | --- |
| 语法 | `require()` / `module.exports` | `import` / `export` |
| 依赖何时确定 | 运行时 | 代码执行前（静态） |
| 导入的值 | 导出对象（基本类型值是当时的快照） | 活的绑定（只读） |
| 能否条件导入 | 能，`if (x) require('a')` | 静态 `import` 不能；用 `import()` |
| tree-shaking | 基本做不到 | 支持 |
| 文件内的 `this` | `module.exports` | `undefined` |

“静态”这一点是 ES Module 最大的价值：打包工具能据此删掉没用到的代码（tree-shaking），编辑器能据此做跳转和重构。

## 4. 坑一：`import` 和 `require` 混用报错

**现象**：在 Node.js 里运行脚本，报 `SyntaxError: Cannot use import statement outside a module`；或者反过来，报 `ReferenceError: require is not defined in ES module scope`。

**原因**：Node.js 需要先判断一个文件用哪套规则：

- 文件扩展名是 `.mjs` → ES Module；`.cjs` → CommonJS；
- 扩展名是 `.js` 时，看最近的 `package.json`：有 `"type": "module"` 就是 ES Module，否则是 CommonJS。

在 CommonJS 文件里写 `import`，或在 ES Module 文件里写 `require`，就会报上面的错。浏览器里同理：`<script>` 没有 `type="module"` 时不能写 `import`。

**修复**：统一一种规则。新项目在 `package.json` 里写 `"type": "module"`，全部使用 `import`。如果 ES Module 里确实要加载一个只能 `require` 的文件：

```js
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const legacy = require('./legacy-config.cjs')
```

**怎么避免再犯**：看到这类报错，第一步检查文件扩展名和 `package.json` 的 `type` 字段。

## 5. 坑二：默认导出和具名导出搞混

**现象**：报 `does not provide an export named 'default'`，或者拿到的东西调用时报 `xxx is not a function`，打印出来发现是 `{ default: ƒ }`。

```js
// format.js 用的是具名导出
export function formatMoney(cents) { /* ... */ }

// 使用方
import formatMoney from './format.js'    // ❌ 想要默认导出，但它没有
import { formatMoney } from './format.js' // ✅ 具名导出要用花括号
```

**原因**：`export default` 和 `export function` 是两种不同的导出方式，导入时写法必须对应。从 ES Module 导入 CommonJS 包时更容易混乱：`module.exports = fn` 在 ES Module 里通常被当作默认导出，而它上面的属性能不能用具名方式导入，取决于运行环境和打包工具的兼容处理。

**修复**：先看清楚对方是怎么导出的（打开包的入口文件或类型声明），再选对应的导入写法；拿不准时 `import * as mod from 'x'` 然后打印 `mod` 看结构。

**怎么避免再犯**：自己写的模块优先使用具名导出。具名导出的名字是固定的，写错了编辑器会立刻提示；默认导出可以随便起名，同一个东西在不同文件里叫不同名字，搜索和重构都麻烦。

## 6. 坑三：循环依赖，拿到未初始化的值

**现象**：报 `ReferenceError: Cannot access 'config' before initialization`；或者在 CommonJS 里拿到的导出是 `undefined`。而且改一下 `import` 的顺序，报错可能就消失了。

```js
// a.js
import { b } from './b.js'
export const config = { name: 'a' }
export function useB() { return b() }

// b.js
import { config } from './a.js'
export const prefix = config.name // ❌ 顶层立即使用 a 的导出
export function b() { return 1 }
```

**原因**：从 `a.js` 开始加载时，`a` 先去加载 `b`；`b` 又要导入 `a`，但 `a` 还没执行完，`config` 还没初始化。ES Module 里 `const` 有暂时性死区，访问会直接报 `ReferenceError`；CommonJS 里拿到的是一个还没填完的导出对象，属性是 `undefined`。

**修复**：

- 把两边都要用的东西抽到第三个更底层的模块里，让依赖变成单向的；
- 实在拆不开时，把使用推迟到函数内部（调用函数时两个模块都已加载完）。

**怎么避免再犯**：模块依赖应该像楼层一样单向：上层可以依赖下层，下层不能反过来依赖上层。出现循环依赖，通常说明某个模块职责太杂。

## 7. 动态 `import()`：按需加载

静态 `import` 会把依赖打包进同一份代码里。像富文本编辑器、图表库这类很大、又不是首屏必需的模块，可以用 `import()` 在需要时再加载：

```js
async function openEditor() {
  const { Editor } = await import('./Editor.js') // 打包工具会把它拆成单独的文件
  return new Editor()
}
```

### 坑四：动态导入的路径完全是变量，上线后 404

**现象**：本地开发一切正常，打包上线后，某些页面报 `Failed to fetch dynamically imported module`。

```js
const page = await import(pageName) // ❌ 打包工具不知道可能是哪些文件
```

**原因**：`import()` 在语言层面接受任意表达式，但打包工具要在构建时决定“把哪些文件打包成独立的块”。路径完全由变量决定时，它无从得知，这些文件就没被打包进去。

**修复**：让路径的可能范围在构建时可见，比如固定目录前缀和扩展名，或者列一张映射表：

```js
const pages = {
  editor: () => import('./pages/Editor.js'),
  report: () => import('./pages/Report.js')
}
const page = await pages[pageName]()
```

> 发布新版本后，用户浏览器里的旧页面去加载已被删除的旧文件，也会报同样的错。这属于部署问题，处理办法见 [懒加载与发布恢复](/practice/notes-release-recovery)。

## 8. 坑五：tree-shaking 没生效，或者生效过头

**现象一**：只用了 lodash 的一个 `debounce`，打包体积却增加了约 70KB。

```js
import _ from 'lodash'               // ❌ 导入整个 CommonJS 版本
import { debounce } from 'lodash-es' // ✅ ES Module 版本，可以只打包用到的函数
```

**原因**：tree-shaking 依赖 ES Module 的静态结构。CommonJS 的 `lodash` 导出的是一个运行时对象，打包工具没法判断你只用了其中哪部分。

**现象二**：给自己的组件库加上 `"sideEffects": false` 之后，组件的样式全没了。

**原因**：`sideEffects: false` 告诉打包工具“这个包里的文件都没有副作用，没被使用的导入可以直接删掉”。而 `import './button.css'` 这种导入正是靠副作用（往页面插入样式）工作的，于是被删掉了。

**修复**：把有副作用的文件列出来：

```json
{
  "sideEffects": ["*.css", "./src/polyfills.js"]
}
```

## 排查思路

- **语法类报错**（`import`、`require`、`export` 相关）：检查文件扩展名、`package.json` 的 `type`、`<script>` 是否有 `type="module"`。
- **导入的东西不对**：`import * as mod from 'x'; console.log(mod)`，看清真实的导出结构。
- **疑似循环依赖**：用 `madge --circular src/` 这类工具列出所有循环；报错信息里的变量名通常就是循环链上的一环。
- **体积异常**：用 `rollup-plugin-visualizer` 等打包分析工具生成体积图，看是哪个依赖占了大头、是否被整体引入。

## 检查清单

- [ ] 新项目统一使用 ES Module，`package.json` 写明 `"type": "module"`
- [ ] 自己的模块优先具名导出
- [ ] 模块依赖单向，没有循环依赖
- [ ] 动态 `import()` 的路径范围在构建时可见
- [ ] 第三方库优先选 ES Module 版本，按需导入
- [ ] `sideEffects` 配置没有误删样式和 polyfill

## 延伸阅读

- [ES6：作用域、模块与数据处理](/web/JavaScript/ES6)：导入为什么是只读的活绑定
- [构建工具选型](/web/frontend/build-tools)：Vite 为什么能利用浏览器原生模块
- [前端工程化地图](/engineering/toolchain)：模块、打包和发布在整个工程里的位置
