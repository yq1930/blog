---
title: Flexbox 弹性布局
description: 搞懂主轴交叉轴和 flex 缩放，以及为什么 min-width:auto 总是给你下绊子。
---

# Flexbox 弹性布局

Flexbox 解决的是一维布局问题——一行或一列里，元素如何分配空间、如何对齐、空间不够时怎么收缩。它适合导航条、按钮组、卡片行、表单输入行这类"沿一个方向排开"的场景。二维布局（同时控制行列）应该交给 Grid。把 Flexbox 用对的关键是理解轴向和收缩机制，而不是把所有属性试一遍。

## 主轴和交叉轴：先确定方向

Flex 容器有两条轴：主轴（元素排列方向）和交叉轴（垂直于主轴）。`flex-direction` 决定主轴方向，所有对齐属性都是相对主轴/交叉轴定义的，而不是相对"水平/垂直"。

```css
.row { display: flex; flex-direction: row; }       /* 主轴水平 */
.col { display: flex; flex-direction: column; }    /* 主轴垂直 */
```

| 属性 | 作用方向 | 含义 |
| --- | --- | --- |
| `justify-content` | 主轴 | 元素在主轴上如何分布 |
| `align-items` | 交叉轴 | 元素在交叉轴上如何对齐 |
| `align-self`（子元素） | 交叉轴 | 单个元素覆盖父级 `align-items` |
| `align-content` | 交叉轴 | 多行时的行间距分布（需 `flex-wrap`） |

```css
/* 经典居中：主轴交叉轴都居中 */
.center { display: flex; justify-content: center; align-items: center; }

/* 导航条：左侧 logo，右侧菜单，两端对齐 */
.navbar { display: flex; justify-content: space-between; align-items: center; }
```

> 调试 Flexbox 时，给容器临时加 `outline: 1px solid red`，能直观看到主轴方向和子元素位置。

## flex-grow / shrink / basis：空间怎么分

`flex` 是 `flex-grow`、`flex-shrink`、`flex-basis` 三个属性的简写，控制元素如何伸展和收缩。

| 属性 | 作用 |
| --- | --- |
| `flex-grow` | 容器有剩余空间时，按比例分配 |
| `flex-shrink` | 空间不足时，按比例收缩 |
| `flex-basis` | 元素的初始大小（在分配空间前） |

```css
/* 主内容占满剩余空间，侧栏固定 240px */
.layout { display: flex; }
.sidebar { flex: 0 0 240px; }    /* 不长不缩，固定 240px */
.main { flex: 1 1 0; }            /* 占剩余空间 */
```

常见简写值：

| 写法 | 等价 | 含义 |
| --- | --- | --- |
| `flex: 1` | `1 1 0%` | 等分剩余空间 |
| `flex: auto` | `1 1 auto` | 按内容大小分配后等分剩余 |
| `flex: none` | `0 0 auto` | 不长不缩，按内容大小 |
| `flex: 0 0 200px` | — | 固定 200px |

> 多个子元素写 `flex: 1` 时，是按比例平分**剩余空间**，不是平分总宽度。如果它们的 `flex-basis` 不一样（比如一个是 auto），最终大小不会相等。

## wrap：换行不是免费的

`flex-wrap: wrap` 让元素在空间不够时换行。但换行后，**不同行的元素不再共享主轴对齐**——`justify-content` 只在每一行内生效，跨行对齐要用 `align-content`。

```css
.tag-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
```

```css
/* 卡片行：宽度不够时换行 */
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.cards > * { flex: 1 1 16rem; } /* 每个最小 16rem，剩余空间均分 */
```

如果需要"每行严格 N 列、自动对齐成网格"，那不是 Flexbox 的强项，用 Grid 更合适。

## 常见布局模式

```css
/* 1. 居中（任何元素） */
.center-all { display: flex; align-items: center; justify-content: center; }

/* 2. 顶部导航：左 logo + 右菜单 */
.navbar { display: flex; align-items: center; justify-content: space-between; }

/* 3. 卡片底部：左侧文字 + 右侧操作 */
.card-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }

/* 4. 输入框 + 按钮 */
.input-group { display: flex; }
.input-group input { flex: 1 1 auto; }
.input-group button { flex: 0 0 auto; }

/* 5. Sticky footer：内容区撑开，footer 沉底 */
.page { display: flex; flex-direction: column; min-height: 100vh; }
.page__main { flex: 1 1 auto; }
```

## 那个坑：min-width: auto

Flexbox 最隐蔽的坑：**flex 子元素的 `min-width` 默认是 `auto`，意味着它不会收缩到内容最小宽度以下**。长单词、长 URL、没换行的文本会撑破容器，导致溢出或无法收缩。

```css
/* 问题：长 URL 把容器撑爆 */
.comment { display: flex; }
.comment__text { flex: 1 1 0; } /* 看起来对，但长 URL 仍然溢出 */

/* 修复：显式设置 min-width: 0 */
.comment__text { flex: 1 1 0; min-width: 0; overflow-wrap: break-word; }
```

记住这条规则：**当一个 flex 子元素的内容可能很宽（文本、表格、图片），加上 `min-width: 0`（垂直方向用 `min-height: 0`），否则它无法收缩。** 这是 Flexbox 90% 的"为什么没按我预期工作"的答案。

图片还有另一个坑：默认 `flex: 1` 会让图片被压缩变形。给图片设 `flex: 0 0 auto` 或固定 `max-width`，并保留 `object-fit`。

## 何时别用 Flexbox

- **二维网格**（行列同时精确控制）：用 Grid。
- **全局页面布局**（header/main/sidebar/footer）：Grid 更清晰。
- **文字环绕图片**：用 `float`（少数仍在用 float 的合理场景）。
- **绝对定位**（弹窗、tooltip）：用 `position: absolute/fixed`。

## 务实的检查清单

- 是否想清楚主轴方向，再选 `justify-content` 还是 `align-items`？
- `flex` 简写是否明确（避免只写 `flex-grow`，漏掉 `basis`）？
- flex 子元素内容可能很宽时，是否设了 `min-width: 0`？
- 换行场景是否真的需要 Flexbox，还是 Grid 的 `auto-fit` 更合适？
- 是否避免用 Flexbox 做二维网格和绝对定位？

Flexbox 是工具，不是信仰。能用 20 行 CSS 解决的导航条，不要因为"听起来 Grid 更现代"就硬塞 Grid；反过来也一样。选对工具的判断标准是布局的维度。
