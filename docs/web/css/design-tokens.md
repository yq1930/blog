---
title: CSS 变量与主题系统
description: 用自定义属性把颜色、间距、字号收敛成设计令牌，实现可切换的主题与一致的视觉语言。
---

# CSS 变量与主题系统

CSS 自定义属性（变量）让样式表从一堆硬编码的魔法值，变成有结构、可复用、可动态切换的设计系统。它的价值不只是"少写几遍颜色"，而是把视觉语言沉淀成令牌（token），让主题切换、响应式调整和团队协作都有了统一的抓手。

## 从魔法值到令牌

没有变量的 CSS 里，同一个颜色和间距散落各处，改一个主题色要全局搜索替换，还常常漏改：

```css
/* 散落的魔法值，难以维护 */
.header { background: #123642; padding: 16px 24px; }
.card { border: 1px solid #123642; padding: 24px; }
.button-primary { background: #123642; }
```

把这些重复的值抽成变量，集中定义、分散使用：

```css
:root {
  --color-primary: #123642;
  --color-bg: #ffffff;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --radius: 8px;
}

.header { background: var(--color-primary); padding: var(--space-4) var(--space-6); }
.card { border: 1px solid var(--color-primary); padding: var(--space-6); border-radius: var(--radius); }
```

改主题色只需改 `--color-primary` 一处。命名要语义化——叫 `--color-primary` 而不是 `--color-blue`，因为颜色可能变，语义不变。

## 令牌分层

成熟的令牌系统通常分两层：基础值（原始的颜色/尺寸）和语义值（这个值在业务里代表什么）：

```css
:root {
  /* 基础层：原始调色板，不直接用 */
  --blue-900: #0d2734;
  --blue-700: #123642;
  --gray-100: #f5f5f5;
  --gray-500: #888888;

  /* 语义层：业务含义，组件引用这层 */
  --color-primary: var(--blue-700);
  --color-bg: #ffffff;
  --color-text: var(--blue-900);
  --color-text-muted: var(--gray-500);
  --color-border: var(--gray-100);
}
```

基础层管"有哪些颜色"，语义层管"这个颜色用在哪"。组件只引用语义层，这样调色板换了一套（比如换品牌色），只动基础层，组件代码完全不用改。

## 主题切换的本质是变量覆盖

深色模式、多品牌主题，本质都是在不同作用域下覆盖同一组语义变量：

```css
:root {
  --color-bg: #ffffff;
  --color-text: #123642;
}

[data-theme="dark"] {
  --color-bg: #0d2734;
  --color-text: #e7f4ef;
}
```

切换主题只需改根元素的属性，所有引用这些变量的地方自动更新：

```js
document.documentElement.setAttribute('data-theme', 'dark')
```

这就是 CSS 变量做主题的最大优势——**不需要重新渲染组件，不需要 JS 计算样式**，浏览器原生处理变量级联。配合 `prefers-color-scheme` 媒体查询，还能跟随系统设置：

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0d2734;
    --color-text: #e7f4ef;
  }
}
```

## 响应式也用变量

字号、间距在不同屏幕宽度下需要缩放，用变量配合媒体查询，比在每个组件里写断点清晰得多：

```css
:root {
  --space-page: 1.5rem;
  --font-size-body: 16px;
}

@media (min-width: 48rem) {
  :root {
    --space-page: 3rem;
    --font-size-body: 17px;
  }
}

.container { padding: 0 var(--space-page); }
body { font-size: var(--font-size-body); }
```

响应式策略集中在变量定义处，组件只管"用这个间距"，不关心它在不同屏下是多少。

## 动态计算的优势

CSS 变量可以在运行时用 JS 读取和修改，也能参与 `calc()` 计算，这是预处理器变量做不到的：

```css
.sidebar { width: var(--sidebar-width, 240px); }
.content { width: calc(100% - var(--sidebar-width, 240px)); }
```

```js
// 用户拖动调整侧栏宽度，实时更新
document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
```

这种"一处变量驱动多处样式"的能力，让交互式的布局调整变得简单。

## 避免的误区

- **不要把所有值都抽成变量**：只把"会复用、会变化、有语义"的值抽出来。一次性用的精确值抽成变量反而增加间接层。
- **注意回退值**：老浏览器不支持自定义属性时，提供回退：`color: #123642; color: var(--color-text);`。
- **作用域要合理**：全局变量放 `:root`，组件局部变量放组件作用域内，别把组件专属的值塞进全局。

## 务实的落地清单

- 颜色、间距、字号、圆角是否都抽成了语义化令牌？
- 是否区分了基础层（调色板）和语义层（业务含义）？
- 主题切换是否通过变量覆盖实现，而不是重写样式表？
- 响应式调整是否集中在变量定义处？
- 组件是否只引用语义层，不直接引用基础值？

CSS 变量把样式表从"写死的声明"升级为"有结构的设计系统"。前期投入是把散乱的值整理成令牌，回报是后续的主题、适配、协作都有了统一的语言——改一个值，全局一致地生效。
