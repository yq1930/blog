---
title: BEM 命名规范
description: 用清晰的组件边界和状态命名，降低 CSS 在多人协作中的相互影响。
---

# BEM 命名规范

BEM 是 **Block（块）— Element（元素）— Modifier（修饰符）** 的缩写。它不是“类名必须很长”的规则，而是一种在 HTML 中直接表达组件边界与状态的方式。

## 三个组成部分

| 写法 | 含义 | 示例 |
| --- | --- | --- |
| `.block` | 可独立复用的组件 | `.article-card` |
| `.block__element` | 组件内部不可独立存在的部分 | `.article-card__title` |
| `.block--modifier` | 组件的变体或状态 | `.article-card--featured` |

```html
<article class="article-card article-card--featured">
  <p class="article-card__meta">工程化</p>
  <h2 class="article-card__title">前端工程化地图</h2>
  <a class="article-card__link" href="/engineering/toolchain">继续阅读</a>
</article>
```

```css
.article-card {
  padding: 20px;
  border: 1px solid #d7e0dc;
}

.article-card__title {
  margin: 8px 0;
}

.article-card--featured {
  border-color: #167f84;
  background: #e7f1ed;
}
```

## 先判断边界，再写名字

一个块应该能在不依赖页面位置的情况下被理解和复用。比如 `.search-form` 是块，输入框和提交按钮是它的元素；页面顶部的 `.site-header` 不应该通过 `.page .header .input` 这样的位置关系去影响它。

```text
search-form
├── search-form__label
├── search-form__input
└── search-form__submit
```

当一个内部元素本身也足够独立时，它可以同时是另一个块。不要为了追求“全都属于一个组件”而产生四五层 `__` 连接。

```html
<header class="site-header">
  <form class="search-form">
    <input class="search-form__input" type="search" />
  </form>
</header>
```

## 修饰符描述差异，不描述实现细节

修饰符回答“这个组件有什么不同”，例如尺寸、强调程度、加载状态、是否不可用。避免把颜色、像素值等实现细节写进 class 名称。

```html
<button class="button button--primary">保存</button>
<button class="button button--primary button--loading" disabled>保存中</button>
```

推荐的状态命名：

- `.button--primary`、`.button--quiet`：视觉变体。
- `.button--loading`、`.button--disabled`：组件状态。
- `.is-open`、`.is-active`：可跨组件复用的短暂交互状态，需明确由谁添加和移除。

## 常见误区

| 问题 | 调整方式 |
| --- | --- |
| `.header .title` 依赖页面层级 | 改为 `.site-header__title` |
| `.button-red` 把视觉细节写进语义 | 改为 `.button--danger` 或 `.button--primary` |
| `.card__title__icon` 多层元素连接 | 图标是 `.card__icon`，或独立为 `.icon` 块 |
| 每个页面重复一套同名组件 | 将真正复用的样式提取为组件块 |

## 落地原则

1. 先用语义名称描述组件职责，再补充状态。
2. 选择器保持单层 class，尽量避免依赖标签和嵌套深度。
3. 一个修饰符只改变一类差异；复杂组合不要变成无穷的 class 拼接。
4. 如果团队已有 CSS Modules、Vue scoped CSS 或设计系统，BEM 仍可作为组件内部的命名语言，而非额外负担。
