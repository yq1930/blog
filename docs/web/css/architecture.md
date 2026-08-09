---
title: CSS 架构与组织
description: 用分层思路组织样式，隔离组件，让样式表不会随业务膨胀而互相覆盖。
---

# CSS 架构与组织

CSS 的维护难题不在"写出一个样式"，而在"半年后改这个样式时，会不会牵连十几个页面"。没有架构的 CSS 会陷入特异性战争、样式蔓延、不敢删的孤儿规则。本篇讲分层组织思路、样式隔离手段，以及如何与设计令牌配合，让样式表随业务增长仍可掌控。

## 先承认问题：CSS 默认是全局的

原生 CSS 所有规则共享同一个全局作用域。`.button` 写在 A 文件，`.button` 写在 B 文件，后者覆盖前者，且没有任何提示。项目一大，三类问题必然出现：

| 问题 | 表现 |
| --- | --- |
| 特异性战争 | 为了覆盖不断叠加 ID、`!important` |
| 样式蔓延 | 组件样式被其他组件意外影响 |
| 孤儿规则 | 没人敢删的 CSS，体积只增不减 |

架构的目的就是从源头控制这三类问题，而不是事后修补。

## 分层组织：ITCSS 的思路

ITCSS（Inverted Triangle CSS）是一种分层思路：把样式按"从通用到具体"分层，上层不依赖下层，下层可以引用上层。不必照搬它的全部术语，核心是分层这个动作。

| 层 | 内容 | 例子 |
| --- | --- | --- |
| Settings | 变量、令牌 | `--color-primary`、`--space-4` |
| Tools | mixins、函数 | 预处理器工具 |
| Generic | reset、normalize | `box-sizing: border-box` |
| Elements | 元素默认样式 | `body`、`a`、`h1` |
| Objects | 无装饰的布局模式 | `.container`、`.grid`、`.media` |
| Components | 具体组件 | `.article-card`、`.navbar` |
| Utilities | 单一用途的辅助类 | `.text-center`、`.mt-4` |

```css
/* Settings */
:root { --color-primary: #123642; --space-4: 1rem; }

/* Elements */
body { font-family: var(--font-body); color: var(--color-text); }
a { color: var(--color-primary); }

/* Objects：纯布局，不带视觉 */
.container { width: min(100% - 32px, 72rem); margin-inline: auto; }

/* Components */
.article-card { border: 1px solid var(--color-border); padding: var(--space-4); }
```

分层的好处是**依赖方向单一**：组件可以引用令牌和布局对象，但令牌不该反过来依赖某个组件。改主题色只动 Settings，改卡片只动 Components，互不牵连。

> 不必教条地建七个文件夹。小项目可以把 Settings/Generic/Elements 合并成一个 `base.css`，关键是保持"上层不依赖下层"的方向。

## 全局样式 vs 组件样式

| 类型 | 写在哪 | 例子 |
| --- | --- | --- |
| 设计令牌、reset、元素默认 | 全局 | `:root` 变量、`body` 字体 |
| 通用布局、工具类 | 全局 | `.container`、`.sr-only` |
| 具体组件外观 | 组件作用域 | `.article-card`、按钮变体 |
| 一次性页面样式 | 页面作用域 | 某个落地页的特有布局 |

判断标准：**这段样式会被多个页面/组件复用吗？** 是 → 全局；否 → 收进组件作用域。

## 样式隔离：scoped / CSS Modules / CSS-in-JS

原生 CSS 没有作用域，现代方案通过编译期或运行期"伪造"作用域，让组件样式不外溢。

| 方案 | 原理 | 优点 | 注意 |
| --- | --- | --- | --- |
| BEM 命名 | 用 class 命名约定隔离 | 零工具依赖 | 靠纪律，命名冲突仍可能 |
| Vue scoped CSS | 编译时给元素加 `data-v-xxx` 属性 | 自动隔离 | 子组件根元素也会被穿透 |
| CSS Modules | 编译时把 class 名哈希化 | 强隔离、可复用 | 模板里要用 `styles.foo` 引用 |
| CSS-in-JS | 运行时/编译期生成唯一 class | 强隔离、动态值 | 运行时方案有性能成本 |

```vue
<!-- Vue scoped：自动加属性选择器，样式只在当前组件生效 -->
<style scoped>
.title { color: var(--color-text); } /* 编译后变成 .title[data-v-abc123] */
</style>
```

```css
/* CSS Modules：class 名被哈希化 */
.button { /* 编译后变成 .ArticleCard_button__a1b2c */ }
```

> scoped 和 CSS Modules 解决的是"组件间不互相覆盖"，不解决"组件内特异性战争"。组件内部仍然需要清晰的命名（BEM 仍有用）和合理的层叠顺序。

## 避免样式蔓延

样式蔓延指组件样式意外影响其他组件，或一个组件依赖了不属于它的全局样式。常见原因和对策：

| 原因 | 对策 |
| --- | --- |
| 选择器太宽（`.card div`） | 收紧到具体 class（`.card__title`） |
| 组件改了全局元素样式（`h1 { }`） | 元素默认样式只在 Elements 层声明一次 |
| 用 `!important` 强行覆盖 | 找特异性更高的正常写法，`!important` 是最后手段 |
| 组件依赖父级 class（`.page .button`） | 组件应能在任何位置独立工作 |

一个健康组件应该具备**位置无关性**：把它挪到任何页面、任何容器，外观不变。如果它依赖"必须在 `.dark-theme` 下"或"必须父级是 `.card`"，说明样式没有收敛进组件自己。

## 与设计令牌配合

令牌（参见 [CSS 变量与主题系统](./design-tokens.md)）是架构的底座。组件只引用语义令牌，不直接写魔法值，这样换主题、调品牌色都不用动组件代码。

```css
/* 差：组件内塞满魔法值 */
.card {
  background: #ffffff;
  border: 1px solid #e5e5e5;
  padding: 16px;
  border-radius: 8px;
}

/* 好：全部引用令牌 */
.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: var(--space-4);
  border-radius: var(--radius);
}
```

令牌层管"有哪些值"，组件层管"这个值用在哪"。两层职责分清，改一处全局生效。

## 务实的检查清单

- 是否分层组织（至少区分令牌/元素默认/组件/工具类）？
- 组件样式是否做到了位置无关，不依赖父级容器？
- 是否用了 scoped / CSS Modules / BEM 隔离组件，避免全局覆盖？
- 选择器是否避免过深嵌套，控制在单层 class？
- 组件是否只引用语义令牌，不直接写魔法值？
- 是否有定期清理孤儿规则的机制（如覆盖率工具）？

CSS 架构的价值在项目变大、人员变多时才真正显现。前期投入一点分层和命名纪律，换的是半年后改样式时不会牵一发动全身。架构的目标不是"炫技"，而是"让改动的影响半径可控"。
