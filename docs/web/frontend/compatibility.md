---
title: 浏览器兼容性
description: 兼容问题分语法、API、CSS 三类，处理方式完全不同。讲清转译、polyfill 和特性检测，修复老 iPhone 整站白屏、依赖包没被转译、Safari 日期解析 Invalid Date 等真实问题。
---

# 浏览器兼容性

兼容性问题最吓人的形态是：**某一部分用户打开网站，整个页面一片空白**，而你在自己的电脑上怎么都复现不了。

排查下来，原因常常很小：一个正则表达式、一个依赖包里的新语法、一种日期字符串的写法。这篇先讲清兼容问题的三种类型，再看几个真实的白屏和报错案例。

::: tip 读完这篇你会
- 分清语法、API、CSS 三类兼容问题，以及各自的处理方法
- 用 browserslist 统一声明目标浏览器
- 定位和修复老设备白屏、依赖未转译、日期解析等常见兼容 bug
:::

## 1. 原理：三类兼容问题，三种处理方法

| 类型 | 例子 | 后果 | 处理方法 |
| --- | --- | --- | --- |
| **语法** | `?.`、`??`、正则后行断言 `(?<=…)`、类私有字段 `#x` | 整个 JS 文件解析失败，一行都不会执行 | **转译**：构建时用 Babel、esbuild 改写成老语法 |
| **API** | `Array.prototype.at`、`structuredClone`、`Promise.withResolvers` | 只有调用到它时才报错 | **polyfill**：提前补上缺失的函数 |
| **CSS** | `:has()`、`@container`、`dvh` | 这条规则被忽略，样式退化 | **回退**：先写老写法，再用新写法覆盖，或用 `@supports` |

打个比方：语法不兼容就像整本书是用读者不认识的文字写的，**一页都读不了**；API 不兼容像书里有个生词，**读到那一页才卡住**；CSS 不兼容像插图印得不清楚，**书照样能读，只是不好看**。

所以语法问题最危险：一个依赖包里的一处新语法，就能让整个应用在老浏览器上白屏。而且语法问题**不能靠 polyfill 解决**，只能在构建时转译。

## 2. 先定目标浏览器

兼容到什么程度，要用数据决定：看网站的访问统计里各浏览器、各系统版本的占比，再结合业务（比如面向政企客户的系统可能要照顾老版本内核）。

用 `.browserslistrc` 声明一次，Babel、Autoprefixer、PostCSS 等工具都会读取它：

```text
# .browserslistrc
> 0.5%
last 2 versions
not dead
iOS >= 14
```

在项目目录运行 `npx browserslist`，可以看到这份配置实际覆盖了哪些浏览器和版本。

Vite 项目还要注意 `build.target`：它决定了打包产物使用的语法版本。Vite 默认只面向较新的浏览器；需要支持旧浏览器时，使用官方的 `@vitejs/plugin-legacy`，它会额外生成一份转译过的旧版代码，并按需加载 polyfill。

## 3. 坑一：老 iPhone 上整站白屏

**现象**：上线后，客服陆续收到反馈：部分 iPhone 用户打开网站一片空白。错误监控里出现一条 `SyntaxError: Invalid regular expression: invalid group specifier name`，只来自 iOS 16.3 及以下的 Safari。

**原因**：某次需求里新写了一个用于格式化金额的正则，用到了**后行断言** `(?<=...)`：

```js
const re = /(?<=\d)(?=(\d{3})+$)/g // 在数字中间插入千分位
```

Safari 直到 16.4 才支持后行断言。在旧版本 Safari 中，这个正则在**解析阶段**就报语法错误，导致它所在的整个 JS 文件都无法执行。因为它被打包进了主文件，所以整站白屏。而这类正则语法，通用的转译工具也无法改写。

**修复**：改写成不用后行断言的版本：

```js
function formatThousands(value) {
  const [int, dec] = String(value).split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${withCommas}.${dec}` : withCommas
}
```

或者直接用浏览器内置的 `Intl.NumberFormat`：`new Intl.NumberFormat('zh-CN').format(1234567.89)`。

**怎么避免再犯**：

- 错误监控按浏览器和系统版本分组，新出现的 `SyntaxError` 要立刻关注；
- 在 ESLint 中使用 `eslint-plugin-compat` 或 `es-x` 等插件，按 browserslist 检查代码里使用的新语法和新 API；
- 发布前用目标范围内最老的那个 iOS 版本真机或云真机过一遍主流程。

## 4. 坑二：自己的代码转译了，依赖包没有

**现象**：项目已经配置了 Babel，自己写的代码都被转成了老语法，但老浏览器上依然报 `SyntaxError: Unexpected token '?'`，指向的代码来自 `node_modules` 里的某个包。

**原因**：为了加快构建速度，很多构建配置**默认不转译 `node_modules`**，它们假设第三方包已经发布成了兼容的代码。但越来越多的包直接发布 ES2020 以上的新语法。

**修复**：

- Vite：通过 `build.target` 或 `@vitejs/plugin-legacy` 处理最终产物，它们作用于打包后的全部代码，包括依赖；
- Webpack + Babel：把有问题的包加入转译范围（`include` 或 `transpileDependencies`）；
- 也可以换一个兼容性更好的替代包，或者锁定到兼容的旧版本。

## 5. 坑三：同样的日期字符串，Safari 里是 Invalid Date

**现象**：订单页的倒计时在电脑 Chrome 里正常，部分 iPhone 上显示 `NaN:NaN:NaN`。

```js
new Date('2026-10-23 12:00:00') // Chrome：正常；部分版本的 Safari：Invalid Date
```

**原因**：JavaScript 标准只规定了 ISO 格式（`2026-10-23T12:00:00`）必须能解析，其他格式的解析结果由浏览器自行决定。“日期和时间之间用空格”这种常见的后端输出格式，旧版 Safari 就不认。

**修复**：

```js
// 方案一：转成标准格式（注意：不带时区时按本地时间解析）
new Date('2026-10-23 12:00:00'.replace(' ', 'T'))

// 方案二：用日期库按明确的格式解析
dayjs('2026-10-23 12:00:00', 'YYYY-MM-DD HH:mm:ss')
```

**怎么避免再犯**：前后端约定日期统一使用 ISO 8601 格式，并且带上时区（如 `2026-10-23T12:00:00+08:00`），或者直接传时间戳。

## 6. 特性检测，而不是猜浏览器

```js
// ❌ 根据 UA 猜浏览器：UA 可以伪造，也会随版本变化
if (navigator.userAgent.includes('Safari')) { /* ... */ }

// ✅ 直接检测能力是否存在
if ('IntersectionObserver' in window) {
  setupLazyLoad()
} else {
  loadAllImages() // 回退方案：全部直接加载
}
```

CSS 里用 `@supports`：

```css
.cards {
  display: flex;      /* 老浏览器：至少能排成一行并换行 */
  flex-wrap: wrap;
}

@supports (display: grid) {
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  }
}
```

更简单的回退方式是利用“CSS 不认识的声明会被忽略”：先写老写法，再写新写法，比如 `height: 100vh; height: 100dvh;`。

## 7. polyfill：按需引入，放在最前面

polyfill 是给老浏览器补上缺失 API 的代码。全量引入会让所有用户（包括用最新浏览器的用户）都多下载几十 KB 用不到的代码。

推荐让工具根据 browserslist 和你实际用到的 API 自动注入：

```json
{
  "presets": [
    ["@babel/preset-env", { "useBuiltIns": "usage", "corejs": 3 }]
  ]
}
```

两个注意点：

- polyfill 必须在业务代码之前执行，否则业务代码运行时它还没生效；
- `usage` 模式只分析被 Babel 处理过的文件，没有转译的依赖包里用到的 API 不会被补上（和坑二同理）。

CSS 前缀交给 Autoprefixer 根据 browserslist 自动添加，不要手写 `-webkit-`。项目里几年前手写的前缀可以清理掉。

## 8. 什么时候可以不兼容

- 已经停止维护的浏览器（如 IE 11）；
- 占比极低、又不在关键业务路径上的环境；
- 兼容成本远高于收益的情况，比如需要大量 hack、拖慢所有后续开发。

决定不兼容时，最好给这些用户一个明确的提示（“请升级浏览器”），而不是让他们看到白屏。

## 排查思路

1. **白屏先看控制台第一条错误**：`SyntaxError` 是语法问题，看是哪个文件、哪个语法；`xxx is not a function` / `xxx is not defined` 多半是 API 缺失。
2. **在错误监控里按浏览器版本分组**，找出受影响的范围（比如“只有 iOS 15 以下”），再去查对应特性的支持情况。
3. **查支持情况**：在 caniuse.com 或 MDN 的兼容性表格里查具体特性在各版本的支持情况。
4. **用真实环境复现**：老版本 iOS 很难在模拟器里覆盖全，可以用云真机服务或者保留几台旧设备。
5. **检查构建产物**：在打包后的文件里搜索可疑语法（如 `?.`、`??`），确认转译是否真的生效。

## 检查清单

- [ ] 有基于访问数据的 `.browserslistrc`，并定期更新
- [ ] 构建产物（包括依赖包）的语法版本符合目标浏览器
- [ ] 不使用目标浏览器不支持、又无法转译的语法（如正则后行断言）
- [ ] polyfill 按需引入，并在业务代码之前执行
- [ ] 日期使用 ISO 8601 格式或时间戳传递
- [ ] 用特性检测和 `@supports` 提供回退，不嗅探 UA
- [ ] 错误监控能按浏览器版本筛选

## 延伸阅读

- [正则表达式实战](/web/JavaScript/regex)：哪些正则写法有兼容和性能风险
- [构建工具选型](/web/frontend/build-tools)：转译和打包的分工
- [前端调试技巧](/web/frontend/debugging)：线上问题如何定位
