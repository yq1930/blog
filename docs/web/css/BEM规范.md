---
title: BEM 命名规范
description: CSS 默认是全局的，改一个 .title 可能弄坏别的页面。讲清选择器优先级和 BEM 的命名方法，避开层级选择器、优先级大战和修饰符单独使用等坑。
---

# BEM 命名规范

多人维护的项目里，CSS 最让人头疼的不是写不出效果，而是**改了这里，坏了那里**：

- 给文章页的 `.title` 调了字号，结果弹窗标题也变了；
- 想覆盖一个样式，加了一层选择器不够，再加一层，最后只能写 `!important`；
- 没人敢删旧样式，因为不知道哪里还在用。

BEM 是一套命名约定，用类名本身表达“这个样式属于哪个组件”，从源头减少这些冲突。

::: tip 读完这篇你会
- 理解 CSS 为什么容易互相干扰，以及选择器优先级是怎么算的
- 用 Block、Element、Modifier 给组件命名
- 避开层级选择器、多层元素连接、修饰符单独使用等常见错误
:::

## 1. 原理：CSS 是一块公共白板

CSS 的类名默认是**全局**的。所有页面、所有组件的样式都写在同一块白板上：你写了 `.title { font-size: 20px }`，所有用了 `title` 这个类名的元素都会受影响，不管它在哪个页面。

样式冲突时，浏览器按**优先级**决定谁生效。简化记法是数三类选择器的个数：

| 选择器 | 优先级（ID, 类, 标签） |
| --- | --- |
| `p` | (0, 0, 1) |
| `.title` | (0, 1, 0) |
| `.card .title` | (0, 2, 0) |
| `.page .card h2.title` | (0, 3, 1) |
| `#main .title` | (1, 1, 0) |

从左往右逐位比较，大的胜出；完全相同时，写在后面的胜出。

问题就出在这里：为了覆盖 `.card .title`，你得写 `.page .card .title`；别人为了覆盖你，再加一层……优先级越堆越高，最后只能靠 `!important` 收场。

BEM 的解法是：**每个元素都用一个独一无二的类名，所有选择器都只有一层类**。大家的优先级都是 (0, 1, 0)，不需要靠层级“打架”。

## 2. BEM 的三个部分

BEM 是 **Block（块）**、**Element（元素）**、**Modifier（修饰符）** 的缩写：

| 写法 | 含义 | 例子 |
| --- | --- | --- |
| `.block` | 一个可以独立存在、能复用的组件 | `.article-card` |
| `.block__element` | 组件内部的一部分，离开组件没有意义 | `.article-card__title` |
| `.block--modifier` | 组件的变体或状态 | `.article-card--featured` |

```html
<article class="article-card article-card--featured">
  <p class="article-card__meta">工程化</p>
  <h2 class="article-card__title">前端工程化地图</h2>
  <a class="article-card__link" href="/engineering/toolchain">继续阅读</a>
</article>
```

```css
.article-card { padding: 1.25rem; border: 1px solid var(--color-border); }
.article-card__title { margin: 0.5rem 0; }
.article-card--featured { border-color: var(--color-primary); }
```

看到 `article-card__title`，任何人都知道它属于哪个组件；全局搜索这个类名，就能找到所有使用它的地方，删除和修改都有底气。

## 3. 怎么划分 Block

判断一个东西是不是 Block，问一句：**把它挪到另一个页面，它还成立吗？**

- 搜索框挪到哪里都是搜索框 → `.search-form` 是 Block；
- 搜索框里的输入框离开搜索框就没意义 → `.search-form__input` 是 Element；
- 页面头部里放了一个搜索框 → 它们是两个 Block，嵌套使用，各管各的。

```html
<header class="site-header">
  <a class="site-header__logo" href="/">野塘漫水</a>
  <form class="search-form">
    <input class="search-form__input" type="search" />
    <button class="search-form__submit">搜索</button>
  </form>
</header>
```

`.site-header` 不应该通过 `.site-header input` 去改搜索框的样式。需要不同外观时，给搜索框加一个修饰符，如 `.search-form--compact`。

## 4. 坑一：用层级选择器写样式，改结构就失效

**现象**：给卡片外面多包了一层 `div` 做布局，卡片标题的样式就失效了。

```css
.list > .item > h2 { font-size: 1.25rem; } /* ❌ 依赖精确的 DOM 结构 */
```

**原因**：选择器把 DOM 层级写死了。结构一变，选择器就匹配不上。而且层级越深，优先级越高，后面的人越难覆盖。

**修复**：

```css
.list-item__title { font-size: 1.25rem; } /* ✅ 和结构无关，只认类名 */
```

**怎么避免再犯**：选择器尽量只有一个类。看到三层以上的嵌套选择器，或者用 Sass 嵌套写出了五六层，就该重构。

## 5. 坑二：元素一层层连下去

**现象**：类名越写越长：`.card__body__header__title__icon`。

**原因**：误以为 Element 的名字要反映 DOM 的层级。

**修复**：BEM 里的 Element 只属于 Block，不属于另一个 Element。不管 DOM 嵌套多深，都是 `block__element` 两段：

```html
<div class="card">
  <div class="card__body">
    <h3 class="card__title">
      <svg class="card__icon"></svg> 标题
    </h3>
  </div>
</div>
```

如果某个部分复杂到需要自己的子元素，就把它提升为一个新的 Block。

## 6. 坑三：只写了修饰符，没写基础类

**现象**：按钮显示成了浏览器默认样式，只有颜色是对的。

```html
<button class="button--primary">保存</button> <!-- ❌ 少了基础类 button -->
```

**原因**：修饰符只描述“和基础样式有什么不同”，比如换个颜色。基础的内边距、圆角、字号都写在 `.button` 上。只写修饰符，就丢掉了全部基础样式。

**修复**：修饰符永远和基础类一起出现：

```html
<button class="button button--primary">保存</button>
```

## 7. 坑四：把具体的颜色、尺寸写进类名

**现象**：品牌主色从红色改成了橙色，代码里还到处是 `.button-red`，类名和实际效果对不上，新人被误导。

**修复**：修饰符描述**含义**，不描述**外观**：

| ❌ 描述外观 | ✅ 描述含义 |
| --- | --- |
| `.button-red` | `.button--danger` |
| `.text-12px` | `.text--caption` |
| `.card-big` | `.card--featured` |

组件状态推荐两种写法：

- 组件自己的状态用修饰符：`.button--loading`、`.tab--active`；
- 由 JS 临时切换、多个组件通用的状态，可以用 `is-` 前缀：`.is-open`、`.is-disabled`。约定好由谁添加、谁移除。

## 8. 用了 CSS Modules、Vue scoped，还需要 BEM 吗

CSS Modules 和 Vue 的 `<style scoped>` 会自动给类名加上唯一后缀，从技术上解决了全局冲突。这时 BEM 的价值从“防冲突”变成了“**让结构可读**”：在一个组件里看到 `__title`、`--active`，马上就知道它们的关系。

不过 scoped 样式也有自己的坑：父组件想改子组件内部的样式，需要用 `:deep()`。滥用 `:deep()` 会重新回到“跨组件改样式”的老问题。更好的做法是让子组件通过修饰符或 CSS 变量暴露可定制的部分，见 [CSS 变量与主题系统](/web/css/design-tokens)。

## 排查思路：样式为什么没生效

1. 在 DevTools 选中元素，看 Styles 面板。被划掉的规则就是被覆盖了，鼠标悬停在选择器上可以看到它的优先级。
2. 找到“胜出”的那条规则，看它来自哪个文件，是优先级更高还是写在更后面。
3. 想让自己的样式生效，优先**降低对方的优先级**（改成单层类名），而不是**抬高自己的**。
4. 看到 `!important`，先搜索项目里还有多少处，它通常是一场优先级战争的遗迹。

## 检查清单

- [ ] 选择器基本只有一层类，不依赖标签和 DOM 层级
- [ ] 类名只有 `block__element` 两段，没有多层连接
- [ ] 修饰符和基础类一起出现
- [ ] 修饰符描述含义（`--danger`），不描述外观（`-red`）
- [ ] 没有新增 `!important`
- [ ] 父组件不随意用 `:deep()` 改子组件内部

## 延伸阅读

- [CSS 架构与组织](/web/css/architecture)：样式文件怎么分层组织
- [现代 CSS 选择器](/web/css/selectors)：`:where()` 如何把优先级降到 0
- [CSS 变量与主题系统](/web/css/design-tokens)：用变量暴露组件的可定制项
