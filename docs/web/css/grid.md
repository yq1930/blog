---
title: Grid 网格布局
description: 用显式轨道和命名区域掌控二维布局，以及何时该用 Grid 而不是 Flexbox。
---

# Grid 网格布局

CSS Grid 解决的是二维布局——同时控制行和列。它适合页面骨架（header/main/sidebar/footer）、卡片矩阵、表单的标签-输入对这类"需要行列同时对齐"的场景。和 Flexbox 的根本区别：Flexbox 是一维的（沿一个方向流动），Grid 是二维的（元素被放进网格单元）。理解了轨道（track）和命名区域，大部分 Grid 代码就不需要查文档。

## 显式轨道：定义网格的结构

`grid-template-columns` 和 `grid-template-rows` 定义网格的列和行。每一段长度叫一条轨道。

```css
/* 固定三列 */
.grid { display: grid; grid-template-columns: 200px 1fr 200px; gap: 1rem; }
/* 侧栏 200px | 主区占满 | 侧栏 200px */
```

单位选择：

| 单位 | 含义 | 适用 |
| --- | --- | --- |
| `px` / `rem` | 固定长度 | 不希望变化的列（侧栏） |
| `fr` | 按比例分配剩余空间 | 弹性主区、等分列 |
| `auto` | 按内容大小 | 内容决定宽度的列 |
| `minmax(min, max)` | 限制范围 | 响应式卡片网格 |
| `%` | 容器宽度百分比 | 简单百分比布局 |

`fr` 是 Grid 最常用的单位，它分配的是**剩余空间**（扣掉固定列和 gap 之后）：

```css
/* 1fr 2fr 1fr：左中右按 1:2:1 分配剩余空间 */
.three-col { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 1rem; }
```

## repeat 和 auto-fit：响应式卡片网格

`repeat()` 简化重复轨道，配合 `auto-fit` 和 `minmax()` 能做出"宽度够就多放一列，不够就少放"的响应式网格，**不需要任何媒体查询**：

```css
/* 经典响应式卡片：每列最少 16rem，剩余空间均分 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}
```

| 写法 | 行为 |
| --- | --- |
| `repeat(3, 1fr)` | 固定 3 列，每列等分 |
| `repeat(auto-fill, 16rem)` | 尽量多放 16rem 的列，空的也保留 |
| `repeat(auto-fit, minmax(16rem, 1fr))` | 尽量多放，剩余空间分给现有列撑满 |

`auto-fit` 和 `auto-fill` 的区别只在"元素少于列数"时显现：`auto-fill` 会保留空列（占位），`auto-fit` 会把空列折叠掉，让现有元素拉伸填满。大多数卡片网格场景用 `auto-fit`。

## gap：取代 margin 拼凑

`gap` 是 Grid（和 Flexbox）的内置间距属性，替代了过去用负 margin、`+` 选择器、`:last-child` 清除间距的繁琐写法。

```css
.grid { display: grid; gap: 1rem; }            /* 行列间距都是 1rem */
.grid { gap: 1rem 2rem; }                       /* 行 1rem，列 2rem */
.grid { row-gap: 1rem; column-gap: 2rem; }      /* 分别设置 */
```

> 只要有"多个元素需要等间距排列"，优先用 `gap` 而不是给每个子元素加 margin。改一处间距，整体一致。

## 命名区域：用画图的方式布局

`grid-template-areas` 让你像画图一样定义布局，可读性远胜于坐标数字。适合固定的页面骨架。

```css
.page {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  min-height: 100vh;
}
.page__header  { grid-area: header; }
.page__sidebar { grid-area: sidebar; }
.page__main    { grid-area: main; }
.page__footer  { grid-area: footer; }
```

```css
/* 响应式：窄屏改成单列堆叠 */
@media (max-width: 48rem) {
  .page {
    grid-template-columns: 1fr;
    grid-template-areas:
      "header"
      "main"
      "sidebar"
      "footer";
  }
}
```

命名区域的优势：调整布局只需改 ASCII 图，子元素的 `grid-area` 引用不变，逻辑稳定。规则是每行字符串数必须等于列数，`.` 表示空单元格。

## 显式轨道 vs 隐式轨道

`grid-template-*` 定义的是显式轨道——你提前声明的。但当元素数量超出显式网格能容纳的范围时，浏览器会自动创建**隐式轨道**（implicit tracks）。

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr); /* 显式：3 列 */
  grid-auto-rows: minmax(100px, auto);   /* 隐式行的高度 */
  grid-auto-flow: row;                    /* 多出的元素按行放（默认） */
}
/* 放 10 个元素进去：前 3 行是显式，后面是隐式，自动换行 */
```

`grid-auto-flow: dense` 会让浏览器尝试用后续小元素填前面的空隙——适合大小不一的瀑布流，但会打乱视觉顺序，影响无障碍阅读顺序，慎用。

## 显式定位：跨越多行多列

```css
.featured {
  grid-column: span 2;     /* 跨 2 列 */
  grid-row: span 2;        /* 跨 2 行 */
}
/* 或用起止线 */
.hero { grid-column: 1 / 3; grid-row: 1 / 2; }
```

显式定位破坏了"按顺序排列"的简单性，只在确实需要（如杂志式布局、跨格的特色卡片）时使用。日常网格让元素自然流入即可。

## 何时用 Grid，何时用 Flexbox

| 场景 | 推荐 |
| --- | --- |
| 页面骨架（header/main/sidebar） | Grid |
| 卡片矩阵、相册 | Grid |
| 表单标签-输入对齐 | Grid |
| 导航条、按钮组、标签云 | Flexbox |
| 单行/单列元素对齐 | Flexbox |
| 元素大小由内容决定、需要流动 | Flexbox |

经验法则：**需要行列同时对齐 → Grid；只沿一个方向排开 → Flexbox**。两者可以嵌套：Grid 做页面骨架，骨架内的导航条用 Flexbox。

## 务实的检查清单

- 是否用 `fr` 而不是 `px` 来分配弹性空间？
- 卡片网格是否用了 `auto-fit + minmax`，免去媒体查询？
- 间距是否统一用 `gap`，而不是拼凑 margin？
- 固定骨架是否用 `grid-template-areas` 画出来，而非坐标数字？
- 是否在该用 Flexbox 的一维场景里没误用 Grid？

Grid 的强项是显式、可预测的二维结构。当你能"一眼看出这张图有几行几列"时，Grid 是最自然的表达方式。复杂的自定义流动布局仍然要靠 Flexbox，两者各司其职。
