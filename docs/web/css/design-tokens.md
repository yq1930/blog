---
title: CSS 变量与主题系统
description: CSS 变量是“电子价签”，改一处、全站在运行时一起变。讲清它和 Sass 变量的区别、令牌分层和主题切换，修复变量名拼错静默失效、弹窗拿不到变量、数字拼单位无效等问题。
---

# CSS 变量与主题系统

一个项目做久了，样式里会散落着几百个 `#123642`、`16px`、`8px`。品牌色一换，就得全局搜索替换，总有几处漏掉；做暗色模式时，又发现一堆写死的颜色怎么也变不过来。

CSS 变量（自定义属性）就是来解决这个问题的：把颜色、间距、字号这些“设计决定”集中定义成**令牌**（token），组件只引用令牌。改一处，全站一起变。

::: tip 读完这篇你会
- 说清 CSS 变量和 Sass 变量的本质区别
- 搭建“基础层 + 语义层”的令牌体系，实现主题切换
- 避开变量名拼错、作用域够不着、拼接单位、写死颜色等坑
:::

## 1. 原理：CSS 变量是“电子价签”

Sass、Less 的变量像**印好的价格标签**：编译时就被替换成具体的值，生成的 CSS 里已经没有变量了，运行时想改只能重新编译。

CSS 变量像超市的**电子价签**：变量本身一直存在于浏览器里，后台改一个价格，所有价签同时更新。

```css
:root {
  --color-primary: #123642; /* 定义：名字必须以两个短横线开头 */
}

.button {
  background: var(--color-primary); /* 使用 */
}
```

它还有两个重要特性：

1. **会继承**：定义在父元素上的变量，所有后代都能用。定义在 `:root`（即 `<html>`）上，就是全局可用。
2. **可以局部覆盖**：在某个元素上重新定义同名变量，只影响它和它的后代。主题切换正是靠这一点实现的。

## 2. 从魔法值到令牌

```css
/* ❌ 散落各处的魔法值 */
.header { background: #123642; padding: 16px 24px; }
.card { border: 1px solid #123642; padding: 24px; }

/* ✅ 集中定义，分散使用 */
:root {
  --color-primary: #123642;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --radius-md: 8px;
}

.header { background: var(--color-primary); padding: var(--space-4) var(--space-6); }
.card { border: 1px solid var(--color-primary); padding: var(--space-6); border-radius: var(--radius-md); }
```

命名要描述**用途**，不要描述**外观**：叫 `--color-primary`，不叫 `--color-dark-blue`。品牌色可能从蓝色换成绿色，但“主色”这个用途不会变。

## 3. 令牌分两层：基础层和语义层

```css
:root {
  /* 基础层：调色板，回答“我们有哪些颜色”，组件不直接用 */
  --blue-700: #123642;
  --blue-900: #0d2734;
  --gray-200: #e5e7eb;
  --gray-500: #6b7280;

  /* 语义层：回答“这个颜色用在哪”，组件只用这一层 */
  --color-primary: var(--blue-700);
  --color-text: var(--blue-900);
  --color-text-muted: var(--gray-500);
  --color-border: var(--gray-200);
  --color-bg: #ffffff;
}
```

分层的好处：换品牌色时只改基础层；做暗色模式时只改语义层的指向；组件代码一行不用动。

## 4. 主题切换：在不同作用域覆盖语义变量

```css
:root {
  --color-bg: #ffffff;
  --color-text: #0d2734;
}

[data-theme='dark'] {
  --color-bg: #0d2734;
  --color-text: #e7f4ef;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
}
```

```js
document.documentElement.dataset.theme = 'dark' // 一行切换整站主题
```

切换时组件不需要重新渲染，浏览器根据变量的新值重新计算样式即可。暗色模式的完整做法（跟随系统、避免闪烁、对比度）见 [颜色与暗色模式](/web/css/color-and-dark-mode)。

## 5. 组件也可以用变量暴露“可定制项”

```css
.badge {
  --badge-bg: var(--color-primary); /* 组件内部的默认值 */
  background: var(--badge-bg);
}

/* 使用方只改变量，不需要知道组件内部结构 */
.sidebar .badge {
  --badge-bg: var(--color-text-muted);
}
```

这比父组件用 `:deep()` 去改子组件内部的类名可靠得多：组件内部结构怎么改，只要变量名不变，定制就不会失效。

## 6. 坑一：变量名拼错，样式悄无声息地失效

**现象**：按钮的背景色突然变成透明，控制台没有任何报错。

```css
.button {
  background: var(--color-primry); /* 少了一个 a */
}
```

**原因**：引用一个不存在的变量，不会报错。这条声明在计算时被视为无效，属性退回到默认值（`background` 变成透明，`color` 则继承父元素）。

**修复**：在 DevTools 的 Styles 面板里，引用了未定义变量的地方会有提示（悬停可以看到变量的值或“未定义”）。顺着它修正拼写即可。

**怎么避免再犯**：

- 令牌集中在一个文件里定义，编辑器能对 `var(--` 做自动补全；
- 用 stylelint 插件（如 `stylelint-value-no-unknown-custom-properties`）在提交前检查未定义的变量。

> 注意：`var(--x, 默认值)` 里的默认值只在变量**未定义**时生效。它能防止样式完全失效，但也会让拼写错误更难被发现。

## 7. 坑二：弹窗里拿不到页面上定义的变量

**现象**：主题变量定义在 `.app` 上，页面里一切正常，但弹窗、下拉菜单、提示框全都没有主题色。

**原因**：CSS 变量靠**继承**传递。弹窗组件通常用 Vue 的 `<Teleport>` 或 React 的 Portal 渲染到 `<body>` 下面，它已经不是 `.app` 的后代了，自然继承不到。

```text
html
└── body
    ├── div.app  ← 变量定义在这里
    │   └── 页面内容（能拿到变量）
    └── div.modal ← 被传送到 body 下（拿不到变量）
```

**修复**：全局令牌定义在 `:root` 上；需要切换主题时，也把 `data-theme` 加在 `<html>` 元素上，而不是某个容器上。

## 8. 坑三：变量里存数字，拼单位不生效

**现象**：想用变量控制尺寸，写了 `width: var(--size)px`，宽度完全没生效。

```css
:root { --size: 16; }
.icon { width: var(--size)px; } /* ❌ 结果是 "16 px"，不是 "16px" */
```

**原因**：`var()` 替换后，变量值和后面的 `px` 是两个独立的部分，不会被拼成一个带单位的数值。

**修复**：用 `calc()` 乘上单位：

```css
.icon { width: calc(var(--size) * 1px); }
```

更简单的做法是变量直接带单位：`--size: 16px`。只有需要用同一个数字做不同计算（比如同时算宽度和动画时长）时，才存纯数字。

## 9. 坑四：暗色模式下，总有几个地方不变色

**现象**：切换到暗色模式后，大部分页面正常，但某些按钮、分割线、表格背景还是亮色的。

**原因**：这些组件里写死了颜色值，没有引用令牌。

**修复**：全局搜索 `#`、`rgb(`、`hsl(` 等颜色写法，把它们替换成语义令牌。

**怎么避免再犯**：用 stylelint 的 `color-no-hex` 等规则，禁止在令牌文件之外写颜色字面量，新代码从源头就不会再写死。

## 10. 用 JS 动态修改变量

CSS 变量可以在运行时读写，这是 Sass 变量做不到的：

```js
// 用户拖动调整侧栏宽度
layout.style.setProperty('--sidebar-width', `${width}px`)

// 读取变量的当前值
getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
```

```css
.layout { grid-template-columns: var(--sidebar-width, 240px) minmax(0, 1fr); }
```

性能提示：变量设置在哪个元素上，浏览器就要重新计算这个元素及其所有后代的样式。拖动、动画这类高频更新，把变量设在**离使用者最近的元素**上，而不是 `:root`。

## 排查思路

1. **样式不对**：选中元素，在 Computed 面板看最终值；在 Styles 面板把鼠标悬停在 `var(--xxx)` 上，看它解析出来的值。
2. **变量没生效**：确认元素是否在定义变量的元素的后代里（弹窗、Teleport 最容易出问题）。
3. **某个主题下颜色不对**：在 Elements 面板给 `<html>` 切换 `data-theme` 属性，逐个检查组件；搜索代码里写死的颜色。

## 检查清单

- [ ] 颜色、间距、字号、圆角都抽成了令牌
- [ ] 令牌分为基础层和语义层，组件只引用语义层
- [ ] 全局令牌和主题属性定义在 `:root` / `<html>` 上
- [ ] 变量带单位，或用 `calc(var(--n) * 1px)` 转换
- [ ] 有 lint 规则防止写死颜色和引用未定义变量
- [ ] 高频修改的变量设在局部元素上

## 延伸阅读

- [颜色与暗色模式](/web/css/color-and-dark-mode)：主题切换的完整做法
- [BEM 命名规范](/web/css/BEM规范)：组件命名与可定制项
- [CSS 架构与组织](/web/css/architecture)：令牌文件放在哪一层
