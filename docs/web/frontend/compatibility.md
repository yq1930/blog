---
title: 浏览器兼容性
description: 先定目标浏览器，再决定用渐进增强还是优雅降级，别无脑堆 polyfill。
---

# 浏览器兼容性

兼容性问题的根源不是"浏览器太多"，而是"没想清楚要支持到什么程度"。无脑加 polyfill、给所有 CSS 加前缀、为 IE6 的幽灵写 hack——这些都是没做目标决策的结果。本篇讲如何定目标浏览器、渐进增强 vs 优雅降级、特性检测和 polyfill 策略，让你在兼容性和开发效率之间找到平衡。

## 先定目标浏览器

兼容性工作的第一步是回答："我们要支持哪些浏览器、支持到哪个版本？" 没有这个清单，要么过度兼容（为 0.1% 用户写大量 hack），要么遗漏（某浏览器直接白屏）。

决策依据：

| 因素 | 考虑 |
| --- | --- |
| 用户画像 | 用户用 Safari 多还是 Chrome 多？有没有企业内网强制 IE？ |
| 流量数据 | 看 Analytics，找出实际占比 >1% 的浏览器 |
| 业务影响 | 电商的 1% 老浏览器用户可能是可观的转化损失 |
| 维护成本 | 为老浏览器写的 hack 会拖慢所有后续开发 |

工具层面，用 `.browserslistrc` 声明目标，让所有工具（Babel、Autoprefixer、ESLint）共享同一份配置：

```text
# .browserslistrc
> 0.5%
last 2 versions
not dead
not op_mini all
```

```text
# 含义：
# > 0.5%           全球使用率超过 0.5% 的浏览器
# last 2 versions  每个浏览器的最近 2 个版本
# not dead         排除已停止维护的（如 IE）
# not op_mini all  排除 Opera Mini（特殊渲染，CSS 兼容差）
```

## 渐进增强 vs 优雅降级

两种思路方向相反，但目标都是"在所有目标浏览器上可用"：

| 策略 | 起点 | 方向 | 适用 |
| --- | --- | --- | --- |
| 渐进增强 | 最基础的功能（HTML + 简单 CSS） | 逐步加增强（JS、高级 CSS） | 内容型、强调可访问性 |
| 优雅降级 | 完整的现代体验 | 为老浏览器做降级 fallback | 应用型、强调交互 |

```text
渐进增强：先保证"能用" → 再"好用" → 最后"惊艳"
优雅降级：先做最好的版本 → 再为老浏览器"打补丁"
```

实际项目常两者结合：**HTML 结构保证语义可用（渐进），JS 和 CSS 增强体验，对不支持的高级特性提供 fallback（降级）**。

```css
/* 渐进增强：先用基础布局，支持 grid 的浏览器用 grid */
.layout {
  display: flex;
  flex-wrap: wrap;
}
@supports (display: grid) {
  .layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }
}
```

## 特性检测优先于浏览器嗅探

不要写 `if (navigator.userAgent.includes('Chrome'))`——userAgent 可以伪造，且无法反映真实能力。**检测特性本身**才是可靠的：

```js
// 差：嗅探浏览器
if (navigator.userAgent.includes('Safari')) { /* ... */ }

// 好：检测特性
if ('IntersectionObserver' in window) {
  // 支持懒加载观察器
  setupLazyLoad()
} else {
  // 不支持，用回退方案
  loadAllImages()
}
```

CSS 端用 `@supports` 检测属性支持：

```css
@supports (display: flex) {
  .row { display: flex; }
}
@supports not (display: flex) {
  .row { display: table; } /* 回退 */
}
```

| 检测方式 | 适用 |
| --- | --- |
| JS `'feature' in window` | API 是否存在 |
| `CSS.supports('property', 'value')` | CSS 属性值是否支持 |
| `@supports` | CSS 内的运行时检测 |
| 现代浏览器原生支持 | 大多数现代特性已普及 |

## caniuse：查清楚再决定

用 [caniuse.com](https://caniuse.com) 查任何 CSS/JS 特性的浏览器支持情况，再决定要不要用、要不要加 fallback。

```text
决策流程：
1. 想用某特性（如 :has()）
2. caniuse 查支持率
3. 支持率覆盖目标浏览器 → 直接用
4. 部分不支持 → 加 @supports fallback 或换方案
5. 大面积不支持 → 暂时别用，或加 polyfill
```

> 别只看全局支持率。你的用户群体可能 Safari 占比高，而某特性在 Safari 上正好支持差。结合自己的 browserslist 和真实流量判断。

## polyfill 策略

polyfill 是为老浏览器补充缺失 API 的代码。但 polyfill 有体积成本，无脑全量引入会让现代浏览器白加载一堆不需要的代码。

| 策略 | 做法 | 适用 |
| --- | --- | --- |
| 全量引入 | `import 'core-js/stable'` | 简单但体积大 |
| 按需引入 | `import 'core-js/features/promise'` | 精确控制 |
| 按目标浏览器生成 | Babel 根据 browserslist 自动注入 | 推荐 |
| 动态 polyfill | 运行时检测后按需加载 | 大型应用 |

```js
// 用 @babel/preset-env + browserslist 自动按需 polyfill
// .babelrc
{
  "presets": [
    ["@babel/preset-env", {
      "useBuiltIns": "usage",   // 只 polyfill 用到的
      "corejs": 3
    }]
  ]
}
```

> polyfill 优先加在入口文件最顶部，保证后续代码能用到。CSS 的前缀由 Autoprefixer 根据 browserslist 自动加，不要手写 `-webkit-`、`-moz-`。

## CSS 前缀

手写 CSS 前缀是历史遗留。现代工具链下，Autoprefixer 会根据 browserslist 自动加需要的前缀，你写标准属性即可：

```css
/* 你写的 */
.flex { display: flex; }

/* Autoprefixer 生成的（按需） */
.flex {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
}
```

不要保留代码库里的旧前缀——它们往往是几年前手写的，目标浏览器早就不用了，纯属噪声。让工具按当前 browserslist 重新生成。

## 什么时候别兼容

不是所有兼容都值得做。以下情况明确放弃：

| 情况 | 为什么 |
| --- | --- |
| 已 EOL 的浏览器（IE 11） | 微软自己都不支持了 |
| 占比 < 0.1% 且非关键路径 | 成本高于收益 |
| 需要大量 hack 且代码难以维护 | 牺牲未来开发效率 |

如果确实需要支持某老浏览器，**隔离兼容代码**——把 hack 放在单独的 polyfill 文件或条件加载的脚本里，不要污染主代码库。

## 务实的检查清单

- 是否有 `.browserslistrc`，且基于真实流量数据定期更新？
- 是否用渐进增强（基础 HTML 可用）+ 高级特性增强？
- 是否用特性检测（`in window`、`@supports`）而非浏览器嗅探？
- 用新特性前是否查过 caniuse 并准备 fallback？
- polyfill 是否按需引入（Babel usage 模式），而非全量？
- CSS 前缀是否由 Autoprefixer 自动处理，没有手写遗留前缀？
- 是否明确了"不兼容"的浏览器清单，停止为它们写代码？

兼容性是成本与收益的权衡。先想清楚目标，剩下的就是按目标配置工具链。把"要不要兼容"变成数据驱动的决策，而不是拍脑袋或恐惧驱动。
