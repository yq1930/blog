---
title: Flexbox 弹性布局
description: 用“分蛋糕”讲清 Flex 分配空间的算法，一次性解释长文本撑破容器、flex:1 不等宽、图片被压扁、内部区域不滚动等最常见的 Flexbox 问题。
---

# Flexbox 弹性布局

Flexbox 几乎是每个前端每天都在用的布局工具，但它的很多“怪现象”让人只能靠反复试属性解决：

- 设置了 `flex: 1`，一段长链接还是把容器撑破了；
- 三个元素都写了 `flex: 1`，宽度却不一样；
- 头像图片在一行里被压成了椭圆；
- 中间区域设置了 `overflow: auto`，却怎么也不出现滚动条。

这些问题其实都来自同一套空间分配规则。理解它之后，就不用再靠猜了。

::: tip 读完这篇你会
- 分清主轴和交叉轴，选对 `justify-content` 和 `align-items`
- 用“分蛋糕”模型理解 `flex-grow`、`flex-shrink`、`flex-basis`
- 修复 `min-width: auto` 引起的一整类溢出和不滚动问题
:::

## 1. 先确定方向：主轴和交叉轴

Flex 容器里有两条轴：

- **主轴**：子元素排列的方向，由 `flex-direction` 决定（默认 `row`，水平从左到右）；
- **交叉轴**：和主轴垂直的方向。

```text
flex-direction: row                     flex-direction: column
主轴 ───────────────►                    主轴
┌──────────────────────┐                 │  ┌──────┐
│ [A]  [B]  [C]        │ ↕ 交叉轴         │  │ [A]  │
└──────────────────────┘                 │  │ [B]  │  ↔ 交叉轴
                                         ▼  │ [C]  │
                                            └──────┘
```

所有对齐属性都是相对“轴”定义的，而不是相对“水平/垂直”：

| 属性 | 作用在 | 含义 |
| --- | --- | --- |
| `justify-content` | 主轴 | 子元素沿主轴怎么分布 |
| `align-items` | 交叉轴 | 子元素在交叉轴上怎么对齐（默认 `stretch` 拉伸） |
| `align-self` | 交叉轴（单个子元素） | 覆盖父元素的 `align-items` |
| `gap` | 两个方向 | 子元素之间的间距 |

所以当你把 `flex-direction` 改成 `column` 后，“水平居中”就要改用 `align-items`。这是“居中突然不生效”的常见原因。

```css
/* 水平垂直居中 */
.center {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

## 2. 原理：Flex 是怎么分蛋糕的

一行里的子元素怎么分配宽度，可以想成分一块蛋糕（容器宽度）：

1. **先按 `flex-basis` 给每人一份基础量**。`flex-basis` 是“分配之前的初始大小”，`auto` 表示按自己的内容或 `width` 来。
2. **算剩下多少**：剩余空间 = 容器宽度 − 所有基础量之和 − 间距。
3. **有剩余**：按 `flex-grow` 的比例把剩下的分给大家。`flex-grow: 0` 的人不参与。
4. **不够分**：按 `flex-shrink × 基础量` 的比例让大家吐出一部分。
5. **但每个人吐到“最小尺寸”就不能再吐了**。Flex 子元素的最小宽度默认是 `min-width: auto`，意思是**不能比自己内容的最小宽度更窄**（比如一个不能断行的长单词的宽度）。

第 5 步是绝大多数 Flex 怪现象的根源，后面的坑基本都和它有关。

`flex` 是这三个属性的简写：

| 写法 | 等价于 | 含义 |
| --- | --- | --- |
| `flex: 1` | `1 1 0%` | 基础量为 0，所有空间按比例平分 |
| `flex: auto` | `1 1 auto` | 先按内容给基础量，剩下的再平分 |
| `flex: none` | `0 0 auto` | 按内容大小，不伸也不缩 |
| `flex: 0 0 240px` | — | 固定 240px |

```css
/* 侧栏固定宽度，主区占满剩余空间 */
.layout { display: flex; }
.sidebar { flex: 0 0 240px; }
.main { flex: 1; min-width: 0; } /* min-width: 0 的作用见坑一 */
```

## 3. 坑一：长文本、长链接把容器撑破

**现象**：评论列表里，一条包含长链接的评论把整行撑宽，右侧的操作按钮被挤出屏幕。

```css
.comment { display: flex; }
.comment__avatar { flex: none; }
.comment__text { flex: 1; } /* 看起来会自适应，但长链接还是溢出 */
```

**原因**：分蛋糕的第 5 步。`.comment__text` 的 `min-width` 默认是 `auto`，它不愿意比自己内容的最小宽度更窄，而一条没有空格的长链接无法断行，最小宽度就是整条链接的长度。

**修复**：允许它收缩到 0，并允许长单词断行：

```css
.comment__text {
  flex: 1;
  min-width: 0;              /* 允许比内容更窄 */
  overflow-wrap: anywhere;   /* 长单词、长链接可以在任意位置断行 */
}
```

需要单行省略号时，同样离不开 `min-width: 0`：

```css
.title {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**怎么避免再犯**：记住一句话——**Flex 子元素里放了可能很长的内容（文字、表格、代码块、图片），就给它加 `min-width: 0`**。这能解决 Flexbox 里一大半“为什么不按我预期收缩”的问题。

## 4. 坑二：都写了 `flex: 1`，宽度却不一样

**现象**：三列都写了 `flex: 1`，内容多的那一列明显更宽。

**原因**有两种可能：

- 写的其实是 `flex-grow: 1`。它的 `flex-basis` 仍是 `auto`，即先按内容给基础量，再平分**剩余**空间，内容多的列基础量大，自然更宽。
- 写的确实是 `flex: 1`（基础量为 0），但某一列的内容有一个很宽的最小尺寸（长单词、固定宽度的子元素），又碰到了 `min-width: auto` 的下限。

**修复**：要严格等分，用 `flex: 1` 并加上 `min-width: 0`：

```css
.col {
  flex: 1;
  min-width: 0;
}
```

如果要的是“严格等宽的几列”，用 Grid 的 `grid-template-columns: repeat(3, minmax(0, 1fr))` 更直接。

## 5. 坑三：图片被压扁，或者被拉长

**现象一**：一行里放了头像和文字，文字很长时，头像被挤成了椭圆。

**原因**：图片也是 Flex 子元素，默认 `flex-shrink: 1`，空间不够时它也会参与收缩。

**修复**：让固定尺寸的元素不参与收缩：

```css
.avatar {
  flex: none; /* 等价于 0 0 auto：不伸不缩 */
  width: 48px;
  height: 48px;
  object-fit: cover;
}
```

**现象二**：图片的高度被拉得和旁边的文字块一样高，变形了。

**原因**：交叉轴默认 `align-items: stretch`，没有设置高度的子元素会被拉伸到和这一行最高的元素一样高。

**修复**：容器改为 `align-items: flex-start`（或 `center`），或者只给图片设置 `align-self: flex-start`。

## 6. 坑四：中间区域设置了 `overflow: auto`，却不出现滚动条

**现象**：一个上中下结构的面板：顶部标题、中间列表、底部按钮。列表很长时，整个面板被撑高，按钮被推出可视区域，中间列表就是不滚动。

```css
.panel { display: flex; flex-direction: column; height: 100%; }
.panel__body { flex: 1; overflow: auto; } /* 期望它在中间滚动 */
```

**原因**：还是第 5 步，只不过换成了垂直方向。`flex-direction: column` 时，子元素的 `min-height` 默认是 `auto`，`.panel__body` 不愿意比它的内容更矮，于是把面板撑高，而不是自己滚动。如果外面还有一层 Flex 容器，外层的那个子元素也要同样处理。

**修复**：

```css
.panel__body {
  flex: 1;
  min-height: 0; /* 允许比内容更矮，多出来的部分才会滚动 */
  overflow: auto;
}
```

**怎么避免再犯**：竖向 Flex 布局里的滚动区域，加 `min-height: 0`；多层嵌套时，从滚动区域往上逐层检查每个 Flex 子元素。

## 7. 坑五：换行后最后一行对不齐

**现象**：卡片列表用了 `flex-wrap: wrap` 和 `justify-content: space-between`，最后一行只有两张卡片时，它们被分到了两端，中间空出一大块。

**原因**：`justify-content` 是**每一行单独**计算的。最后一行只有两个元素，`space-between` 就把它们推到两边。

**修复**：需要“对齐成网格”的场景，换成 Grid：

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 1rem;
}
```

Flex 的强项是“沿一个方向流动”，比如标签列表、按钮组，每行长短不一是正常的；需要行列都对齐时，就是 Grid 的场景。

## 8. 常用布局片段

```css
/* 导航条：左侧 logo，右侧菜单 */
.navbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

/* 输入框 + 按钮：输入框占满剩余空间 */
.input-group { display: flex; gap: 0.5rem; }
.input-group input { flex: 1; min-width: 0; }
.input-group button { flex: none; }

/* 页脚沉底：内容少时页脚也在页面底部 */
.page { display: flex; flex-direction: column; min-height: 100dvh; }
.page__main { flex: 1; }

/* 把最后一个元素推到最右边 */
.toolbar { display: flex; gap: 0.5rem; }
.toolbar__spacer { margin-left: auto; }
```

`margin-left: auto` 在 Flex 里会“吃掉”主轴上所有剩余空间，是把某个元素单独推到一侧的简单办法。

## 排查思路

1. **打开 Flexbox 可视化**：在 DevTools 的 Elements 面板里，Flex 容器旁边有一个 `flex` 标记，点击后页面上会画出容器、子元素和间距的轮廓。
2. **看 Computed 面板**：选中子元素，查看实际的 `width`、`min-width`、`flex-basis`，确认它卡在了哪一步。
3. **溢出、不滚动、不收缩**：先给可疑子元素加 `min-width: 0`（竖向加 `min-height: 0`）试试。九成情况会立刻好。
4. **对齐不生效**：先确认主轴方向，再确认属性加在了容器上还是子元素上（`justify-content` 加在容器上，`align-self` 加在子元素上）。

## 检查清单

- [ ] 先确定主轴方向，再选择对齐属性
- [ ] `flex` 用完整简写，清楚 `flex: 1` 和 `flex-grow: 1` 的区别
- [ ] 放长内容的 Flex 子元素加了 `min-width: 0`
- [ ] 竖向 Flex 的滚动区域加了 `min-height: 0`
- [ ] 图片、头像等固定尺寸元素设置了 `flex: none`
- [ ] 需要行列都对齐的场景用 Grid

## 延伸阅读

- [Grid 网格布局](/web/css/grid)：二维布局和 `minmax(0, 1fr)`
- [响应式布局与容器](/web/css/layout)：什么时候需要断点
- [前端调试技巧](/web/frontend/debugging)：更多 DevTools 用法
