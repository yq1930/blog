---
title: 颜色与暗色模式
description: 用 CSS 变量驱动主题，保证对比度，让暗色模式不是简单反色。
---

# 颜色与暗色模式

暗色模式不是把所有颜色取反。直接反色会让图片过亮、阴影失效、对比度失衡，看起来刺眼。正确的做法是用 CSS 变量把"主题"抽象出来，在不同主题下重新定义语义令牌，同时保证每个主题的对比度都达标。本篇讲颜色表示法、暗色模式实现策略，以及和设计令牌的配合（参见 [CSS 变量与主题系统](./design-tokens.md)）。

## 先选对颜色表示法

CSS 有多种表示颜色的方式，各有适用场景：

| 表示法 | 例子 | 特点 |
| --- | --- | --- |
| HEX | `#123642` | 紧凑，最常用，但不透明度要额外写 `#123642ff` |
| RGB/RGBA | `rgb(18, 54, 66)` / `rgba(..., 0.5)` | 直观的分量，支持透明度 |
| HSL | `hsl(195, 57%, 16%)` | 色相/饱和度/明度，调色直觉 |
| `color-mix()` | `color-mix(in srgb, red 40%, blue)` | 混色，生成派生色 |
| OKLCH | `oklch(0.4 0.08 220)` | 感知均匀，跨色域一致 |

> 调一组派生色时，HSL 比 HEX 直观：保持色相不变，调饱和度和明度就能生成同色系的层次。OKLCH 更先进，视觉上"亮度相同"的颜色真的亮度相同，适合做精确的设计系统。

透明度推荐用独立的 `color-mix` 或 `rgb` 的 `alpha`，而不是堆叠半透明遮罩——多层透明度叠加后，最终颜色很难预测。

## 暗色模式不是反色

直接反转颜色会出问题：

| 问题 | 反色的结果 |
| --- | --- |
| 图片 | 白底图在暗色下变成刺眼的高光块 |
| 阴影 | 暗色模式下阴影不可见，需要改用"亮色光晕" |
| 对比度 | 简单反色常常让某些组合对比度不足 |
| 饱和度 | 高饱和色在暗背景上会刺眼，需要降饱和 |

正确做法：**为每个主题单独定义语义颜色**，而不是算法反转。暗色模式的"主色"通常比亮色模式更暗一些（降低饱和度），文字也不是纯白而是浅灰。

## 用 CSS 变量驱动主题

主题切换的本质是在不同作用域下覆盖同一组语义变量。组件只引用语义变量，不关心当前是亮是暗：

```css
:root {
  /* 亮色主题 */
  --color-bg: #ffffff;
  --color-surface: #f5f5f5;
  --color-text: #123642;
  --color-text-muted: #5a6b73;
  --color-border: #e0e5e3;
  --color-primary: #123642;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] {
  /* 暗色主题：重新定义，不是反色 */
  --color-bg: #0d1b22;
  --color-surface: #14252e;
  --color-text: #e7f0ed;
  --color-text-muted: #9bb0b5;
  --color-border: #1f3340;
  --color-primary: #4a9ba0;      /* 暗背景下主色调亮 */
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.card {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow);
}
```

切换主题只需改根元素的属性，所有组件自动更新：

```js
document.documentElement.setAttribute('data-theme', 'dark')
```

## 跟随系统：prefers-color-scheme

用户可能在系统层面设置了暗色模式。用 `prefers-color-scheme` 媒体查询跟随系统，同时保留手动切换的能力：

```css
/* 默认跟随系统 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #0d1b22;
    /* ...暗色令牌 */
  }
}

/* 用户显式选择时覆盖系统 */
[data-theme="dark"] { /* ...暗色令牌 */ }
[data-theme="light"] { /* ...亮色令牌 */ }
```

```js
// 读系统偏好 + 用户偏好，决定初始主题
const saved = localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = saved || (prefersDark ? 'dark' : 'light')
document.documentElement.setAttribute('data-theme', theme)
```

> 初始主题要在 HTML 里尽早设置，避免页面加载时出现"亮色闪一下再变暗"（FOUC）。把上面的判断放进 `<head>` 内联脚本，在 CSS 加载前就定好 `data-theme`。

## 保证对比度

对比度是暗色模式最容易翻车的地方。暗背景上用纯白文字（对比度过高）会刺眼，用中灰文字（对比度不足）又看不清。WCAG 建议正文至少 4.5:1，大字 3:1。

```css
/* 暗色模式下，文字用浅灰而非纯白，降低眩光 */
[data-theme="dark"] {
  --color-text: #e7f0ed;       /* 不是 #ffffff */
  --color-text-muted: #9bb0b5; /* 次要文字仍要保证对比度 */
}
```

| 检查项 | 工具 |
| --- | --- |
| 对比度是否达标 | 浏览器 DevTools 的对比度提示、WebAIM 工具 |
| 是否只靠颜色传达信息 | 关掉颜色看是否还能理解（色盲场景） |
| 暗色模式下图片是否刺眼 | 给图片加轻微暗色遮罩 |

暗色模式下图片和高亮元素的处理：

```css
[data-theme="dark"] img {
  opacity: 0.85;                 /* 略降低，减少刺眼 */
  transition: opacity 200ms;
}
[data-theme="dark"] img:hover { opacity: 1; }
```

## 主题切换的过渡

直接切换主题会有突兀的颜色跳变。给颜色属性加过渡能让切换更平滑，但要小心：**过渡所有属性会拖慢重排**。只过渡颜色相关属性：

```css
body {
  transition: background-color 200ms ease, color 200ms ease;
}
```

> 尊重 `prefers-reduced-motion` 的用户，关掉主题切换的过渡动画。

## 务实的检查清单

- 颜色是否抽成语义令牌，组件只引用变量不写魔法值？
- 暗色模式是否单独调色（降低饱和、调整对比度），而不是简单反色？
- 是否用 `prefers-color-scheme` 跟随系统，同时允许手动覆盖？
- 初始主题是否在 `<head>` 内联设置，避免 FOUC？
- 每个主题的正文对比度是否都达到 4.5:1？
- 是否给暗色模式下的图片做了适当处理（遮罩/降透明度）？

暗色模式的难点不在写 CSS，而在为每个主题精心调色。把它当作"第二套设计"认真对待，而不是"亮色的反相输出"。和设计令牌系统配合好，主题切换就是改一组变量，组件代码零改动。
