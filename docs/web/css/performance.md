---
title: CSS 性能优化
description: 从重排重绘、选择器复杂度和关键 CSS 三处入手，让样式表不拖累渲染。
---

# CSS 性能优化

CSS 性能问题分两类：**加载阶段**（CSS 阻塞首次渲染）和**运行阶段**（样式变化触发重排重绘）。前者让首屏变慢，后者让交互卡顿。优化的核心不是堆技巧，而是搞清楚瓶颈在哪个阶段，针对性下手。本篇按渲染流水线梳理 CSS 的性能要点。

## 先理解渲染流水线

浏览器把一帧画面渲染出来，经过五个阶段。每个 CSS 操作可能触发其中几个：

```text
样式计算 → 布局(Layout) → 绘制(Paint) → 合成(Composite) → 显示
                ↑重排        ↑重绘        ↑仅合成
```

| 操作 | 触发 | 成本 |
| --- | --- | --- |
| 改 `transform`、`opacity` | 仅合成 | 最低 |
| 改 `color`、`background` | 重绘 | 中 |
| 改 `width`、`margin`、`top` | 重排（重新布局） | 高 |
| 改字体、插入/删除元素 | 重排 + 重绘 | 最高 |

> 动画优先改 `transform` 和 `opacity`，它们走合成线程，不阻塞主线程。详见 [动画与过渡](./animation.md)。

## 重排 vs 重绘：能不重排就不重排

重排（reflow）重新计算所有元素的几何位置，成本远高于重绘（repaint）。浏览器会批量处理样式变化，但某些操作会**强制同步布局**——读取布局属性会立刻触发布局计算：

```js
// 差：循环里读布局属性，每次都强制重排
for (const el of items) {
  el.style.width = el.offsetWidth + 10 + 'px'; // 读 offsetWidth 触发重排
}

// 好：先读后写，分两轮
const widths = items.map(el => el.offsetWidth);
items.forEach((el, i) => { el.style.width = widths[i] + 10 + 'px'; });
```

| 操作 | 是否强制布局 |
| --- | --- |
| 读写 `offsetWidth/Height/Top` | 是 |
| `getComputedStyle()` | 是 |
| `scrollTop/scrollHeight` | 是 |
| 改 class、内联 style | 否（批量延迟） |
| 改 `transform` | 否 |

规则：**批量读写分离**。需要读布局信息时，一次性读完，再统一写入修改，避免交替触发。

## 选择器复杂度：右到左匹配

浏览器从选择器最右侧（关键选择器）开始匹配。过深或过宽的选择器在大型页面上会有成本：

```css
/* 慢：关键选择器是 *，遍历页面所有元素 */
.nav * { ... }

/* 慢：多层后代选择器 + 属性匹配 */
body > .app .content div[class*="item"] { ... }

/* 快：单 class 关键选择器 */
.nav-item { ... }
```

现代浏览器引擎优化得很好，选择器性能多数时候不是瓶颈。但保持两条原则能避免极端情况：

| 原则 | 说明 |
| --- | --- |
| 关键选择器尽量是 class | 最右侧匹配要高效 |
| 后代选择器不超过 3 层 | `.a .b .c .d .e` 已经太深 |
| 避免用 `*` 作为关键选择器 | 遍历全页面 |

## contain：隔离渲染影响范围

`contain` 属性告诉浏览器"这个元素的渲染影响范围被限制在自身"，浏览器可以据此跳过对外部布局和绘制的重新计算：

```css
.card { contain: layout paint; }
.widget { contain: layout style paint; }
```

| 值 | 含义 |
| --- | --- |
| `layout` | 元素布局变化不影响外部 |
| `paint` | 子元素不会绘制到元素边界外 |
| `style` | 计数器和引用变化被隔离 |
| `size` | 元素尺寸与子元素无关（需自己给大小） |
| `content` | `layout style paint` 的简写 |
| `strict` | 全部隔离（除 `size`） |

适合用在独立的卡片、第三方 widget、长列表项上。注意 `contain: size` 会让元素忽略子内容尺寸，必须显式给宽高，慎用。

## content-visibility：跳过屏外内容

`content-visibility: auto` 让浏览器**跳过屏外元素的渲染**，直到它们进入视口才真正绘制。对长列表、长文档效果显著：

```css
.long-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 200px; /* 预估高度，避免滚动条跳动 */
}
```

`contain-intrinsic-size` 提供占位高度，浏览器用它计算滚动条位置。不设置的话，滚动条会在内容渲染时剧烈跳动。

> `content-visibility` 会让屏外元素的查找（如 Ctrl+F）行为变化，部分浏览器在内容未渲染时不参与搜索。需要全文搜索的场景慎用。

## 关键 CSS 内联

CSS 是**阻塞渲染**的资源——浏览器必须解析完 CSS 才能渲染页面。外部 CSS 文件需要额外的网络请求，延长首屏时间。常见优化是**把首屏需要的关键 CSS 内联进 HTML**，其余的异步加载：

```html
<head>
  <!-- 关键 CSS 内联，立即生效 -->
  <style>
    body { margin: 0; font-family: var(--font-body); }
    .hero { min-height: 60vh; background: var(--color-primary); }
  </style>
  <!-- 其余 CSS 异步加载，不阻塞首屏 -->
  <link rel="preload" href="/assets/app.css" as="style" onload="this.rel='stylesheet'">
</head>
```

判断"关键"的标准：**移除它，首屏立刻变形**。首屏用不到的（如弹窗、二级页面样式）都该延后。

## 避免 @import

`@import` 在 CSS 中引入其他 CSS，但它**串行加载**——浏览器必须先下载当前文件，解析到 `@import` 才发现还有依赖，再发请求。这比 `<link>` 多一个往返：

```css
/* 慢：串行加载 */
@import url("base.css");
@import url("components.css");

/* 快：构建期合并成一个文件，或在 HTML 用多个 link 并行 */
```

生产环境应通过构建工具把所有 CSS 合并压缩成一个文件，避免运行时 `@import`。

## 字体加载策略

字体文件加载完成前，浏览器要么隐藏文字（FOIT），要么先用回退字体显示再切换（FOUT），都会影响体验：

| 策略 | 含义 |
| --- | --- |
| `font-display: swap` | 立即用回退字体，加载完切换（推荐） |
| `font-display: optional` | 极短时间内加载完就用，否则不切换（适合非关键字体） |
| `font-display: block` | 短暂隐藏后强制等加载（不推荐，用户看不到字） |

```css
@font-face {
  font-family: "BodyText";
  src: url("/fonts/body.woff2") format("woff2");
  font-display: swap;
  unicode-range: U+0000-00FF; /* 只加载实际用到的字符范围 */
}
```

用 `woff2` 格式（体积最小），并按 unicode-range 拆分字体文件，按需加载。

## 务实的检查清单

- 动画是否优先用 `transform`/`opacity`，避免触发重排？
- JS 是否批量读写布局属性，避免交替触发强制布局？
- 选择器是否控制在合理深度，关键选择器是 class？
- 长列表/独立组件是否用了 `contain` 或 `content-visibility`？
- 首屏关键 CSS 是否内联，非关键样式是否异步加载？
- 是否避免了运行时 `@import`，构建期合并 CSS？
- 字体是否用 `font-display: swap` 和 `woff2`？

CSS 性能优化的优先级：**先解决阻塞首屏的资源（关键 CSS 内联、避免 @import），再处理运行时重排（动画属性、批量布局读写），最后才考虑选择器复杂度这类微优化**。不要为了微优化牺牲可维护性。
