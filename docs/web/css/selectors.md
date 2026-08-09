---
title: 现代 CSS 选择器
description: 用好 :is/:where/:has 和属性选择器，同时搞懂特异性，别让选择器失控。
---

# 现代 CSS 选择器

选择器是 CSS 表达"哪些元素该应用样式"的语言。写得清楚，样式表可读、可维护；写得花哨，特异性战争、覆盖失败、选择器长到没人敢动。本篇讲现代选择器怎么用，以及什么时候应该退回到一个简单的 class。

## 现代 CSS 新增的几个利器

过去几年 CSS 选择器增加了几个非常实用的功能：

| 选择器 | 作用 | 典型场景 |
| --- | --- | --- |
| `:is(A, B, C)` | 匹配列表中任意一个，特异性取最高 | 简化分组 |
| `:where(A, B, C)` | 同 `:is`，但特异性为 0 | 提供可被轻松覆盖的默认样式 |
| `:has(> .child)` | 选择"包含满足条件子元素"的父元素 | 父元素根据内容变样式 |
| `[attr="x"]`、`[attr^="x"]` | 属性匹配 | 根据 data-* 或链接类型样式化 |
| `:not(A)` | 反向匹配 | 排除某些元素 |

```css
/* 旧写法：啰嗦 */
.card h1, .card h2, .card h3 { color: var(--color-text); }

/* 新写法：:is 收敛 */
.card :is(h1, h2, h3) { color: var(--color-text); }

/* :where 特异性为 0，方便被组件自定义覆盖 */
:where(button, a.button) {
  padding: 0.5em 1em;
  border-radius: var(--radius);
}
.my-app button { padding: 0.75em 1.25em; } /* 能轻松覆盖上面 */

/* :has 选择"有图标的链接" */
a:has(> img) { display: inline-flex; gap: 0.4em; }
```

`:has()` 是近十年最有用的 CSS 功能之一——过去必须靠 JS 或改 DOM 结构才能实现的"父元素根据子元素状态变化"，现在纯 CSS 就能做。但要小心：复杂的 `:has()` 嵌套会让浏览器在 DOM 变化时做更多检查。

## 特异性怎么算

特异性决定"多条规则同时命中时谁赢"。记一个 (a, b, c) 三元组：

| 来源 | 计入 | 例子 |
| --- | --- | --- |
| a | ID 数量 | `#nav` → (1,0,0) |
| b | class、属性、伪类数量 | `.card.active` → (0,2,0) |
| c | 元素、伪元素数量 | `div > p` → (0,0,2) |

```text
#nav .item         → (1, 1, 0)
.card .title span  → (0, 2, 1)
:hover             → (0, 1, 0)
div                → (0, 0, 1)
```

比较时从左到右，`#nav .item` 永远赢过任意数量的 class。这就是为什么用 ID 写样式很危险——以后想覆盖只能再叠 ID 或 `!important`，特异性雪球越滚越大。

> `:where()` 的特异性永远是 (0,0,0)，这是它和 `:is()` 的唯一区别。提供"可被覆盖的默认样式"时优先用它。

## 何时用 class，何时用伪类

不是所有匹配都该塞进选择器。判断标准：**这条规则是否依赖 DOM 结构？**

| 情况 | 推荐 |
| --- | --- |
| 组件外观（卡片、按钮样式） | BEM class：`.button--primary` |
| 状态（hover、focus、disabled） | 伪类：`:hover` `:focus-visible` `:disabled` |
| 结构关系（第一个、最后一个、奇偶） | 伪类：`:first-child` `:nth-child` |
| "有某属性的元素"（外部链接、带 data） | 属性选择器 `[rel="external"]` |
| "包含某子元素的父元素" | `:has()` |

```css
/* 用 class 表达组件身份 */
.button { ... }
.button--primary { ... }

/* 用伪类表达状态，不要 .button.is-hover */
.button:hover { ... }
.button:focus-visible { outline: 2px solid var(--color-primary); }
.button:disabled { opacity: 0.5; cursor: not-allowed; }

/* 结构性匹配用伪类 */
.list > li:first-child { border-top: none; }
```

关键原则：**身份用 class，状态用伪类**。把"鼠标悬停"写成 `.button.is-hover` 然后靠 JS 切换，纯属增加负担——除非你确实需要用 JS 触发类似 hover 的状态。

## 选择器性能：大多数时候不必担心

现代浏览器从右向左匹配选择器。`.nav .item .link` 会先找所有 `.link`，再过滤出在 `.item` 内、再过滤出在 `.nav` 内。所以**最右侧的关键选择器**最影响性能。

```css
/* 慢：* 作为关键选择器，遍历页面所有元素 */
.nav * { ... }

/* 慢：属性选择器作为关键选择器，在大页面上成本高 */
[class*="icon-"] { ... }

/* 快：单 class 关键选择器 */
.nav-link { ... }
```

实际项目中，选择器性能问题远少于特异性问题。规则是：**别写超过 3 层嵌套的选择器，关键选择器尽量是单个 class**。如果选择器长到要数逗号和空格，就该抽成 class 了。

## 避免依赖 DOM 结构

```css
/* 脆弱：换一层 DOM 就失效 */
.header > nav > ul > li > a { color: var(--color-text); }

/* 稳健：直接给元素命名 */
.nav-link { color: var(--color-text); }
```

基于标签嵌套的选择器把样式和 DOM 结构绑死了。组件内部一重构，样式就崩。除非是结构性伪类（如 `:first-child`），否则优先用语义化的 class。

## 务实的检查清单

- 是否用 `:where()` 提供可覆盖的默认样式，用 `:is()` 简化冗长分组？
- 用到 `:has()` 的地方，是否真的需要它，而不是改 class 更简单？
- 特异性是否控制在 class 层级，避免用 ID 写样式？
- 选择器嵌套是否不超过 3 层，关键选择器是否是单个 class？
- 状态样式是否用伪类（`:hover` `:focus-visible`），而不是 JS 切 class？

选择器的目标不是"写得越短/越长越好"，而是让读样式表的人能立刻看出"这条规则在匹配谁、为什么"。清晰优先于技巧。
