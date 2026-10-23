---
title: Grid 网格布局
description: 先画格子再放内容。讲清轨道、fr 和 auto-fit 的工作方式，修复 1fr 列被长内容撑宽、卡片太少被拉宽、窄屏溢出、区域写错整体失效等 Grid 常见问题。
---

# Grid 网格布局

Grid 是专门做二维布局（同时控制行和列）的工具：页面骨架、卡片矩阵、表单的标签与输入框对齐，用它都比 Flexbox 简单。但 Grid 也有几个经典的坑：

- 主栏写了 `1fr`，一个代码块就把它撑得比屏幕还宽；
- 卡片只有两张时，被拉得又宽又扁；
- 在 320px 宽的小手机上，卡片网格溢出了屏幕；
- `grid-template-areas` 改了一行，整个页面布局全乱。

这篇先建立“画格子”的思维模型，再逐个解决这些问题。

::: tip 读完这篇你会
- 用轨道、网格线、区域三个概念读懂任何 Grid 代码
- 写出不需要媒体查询的响应式卡片网格
- 知道 `minmax(0, 1fr)` 和 `min(16rem, 100%)` 这两个关键写法为什么必要
:::

## 1. 原理：先画格子，再放东西

Grid 的工作方式像停车场：先在地上画好线（定义行和列），车（子元素）进来后按顺序一个格子一个格子停进去。

```text
     线1      线2            线3      线4
      │ 200px │     1fr      │ 200px │
线1 ──┼───────┼──────────────┼───────┼──
      │  ①   │      ②      │  ③   │   ← 第 1 行轨道
线2 ──┼───────┼──────────────┼───────┼──
      │  ④   │      ⑤      │  ⑥   │   ← 第 2 行轨道
线3 ──┴───────┴──────────────┴───────┴──
```

四个概念：

- **轨道**（track）：一整行或一整列，比如上图中间那列 `1fr`；
- **网格线**（line）：轨道之间的分隔线，从 1 开始编号，跨列、跨行时用它定位；
- **单元格**（cell）：一行和一列交叉的格子；
- **区域**（area）：几个相邻单元格合成的矩形，可以起名字。

```css
.grid {
  display: grid;
  grid-template-columns: 200px 1fr 200px; /* 画三列 */
  gap: 1rem;                              /* 格子之间的间距 */
}
```

子元素不需要写任何定位代码，会自动按顺序填进格子；放不下就自动新开一行。

## 2. `fr`：按比例分剩余空间

`fr` 是 Grid 最常用的单位，表示“剩余空间的几份”。剩余空间 = 容器宽度 − 固定宽度的列 − 间距。

```css
.three-col {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr; /* 剩余空间按 1:2:1 分配 */
}
```

| 单位 | 含义 | 适合 |
| --- | --- | --- |
| `px` / `rem` | 固定长度 | 侧栏、图标列 |
| `fr` | 剩余空间的份数 | 主区、等分列 |
| `auto` | 由内容决定 | 标签列、按钮列 |
| `minmax(a, b)` | 最小 a、最大 b | 响应式列 |

### 坑一：`1fr` 的主栏被代码块撑得比屏幕还宽

**现象**：文章页是“主栏 + 侧栏”两列。某篇文章里有一段很长的代码，整个页面出现横向滚动条，侧栏被挤出了屏幕。

```css
.page {
  display: grid;
  grid-template-columns: 1fr 18rem;
}
```

**原因**：`1fr` 其实是 `minmax(auto, 1fr)` 的简写，它的**最小值是 `auto`**，也就是“不能比内容的最小宽度更窄”。一行不能断开的长代码，最小宽度就是整行代码的宽度，于是把这一列撑开了。这和 Flexbox 里 `min-width: auto` 是同一类问题。

**修复**：把最小值明确设为 0：

```css
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
}

.page pre {
  overflow-x: auto; /* 代码块自己横向滚动，而不是撑开页面 */
}
```

**怎么避免再犯**：放“内容长度不可控”的列（正文、表格、代码）时，用 `minmax(0, 1fr)` 代替 `1fr`。

## 3. 不写媒体查询的响应式卡片网格

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: 1rem;
}
```

从里往外读：

- `minmax(16rem, 1fr)`：每列最少 16rem，最多平分剩余空间；
- `repeat(auto-fit, ...)`：在容器里尽可能多放这样的列；
- 容器变窄，放不下就自动减少列数，不需要任何断点。

外面那层 `min(16rem, 100%)` 是为了下面这个坑。

### 坑二：小屏手机上卡片溢出屏幕

**现象**：在 320px 宽的老款手机上，卡片右边被截掉一截，页面能横向滚动。

**原因**：`minmax(16rem, 1fr)` 的最小值是 16rem（256px）。容器扣掉内边距后如果比 256px 还窄，一列也放不下，可这一列又必须至少 256px，于是溢出。

**修复**：用 `min(16rem, 100%)` 作为最小值：容器足够宽时是 16rem，比 16rem 还窄时就是容器的 100%。

### 坑三：卡片只有一两张时，被拉得又宽又扁

**现象**：搜索结果只有两条时，两张卡片各占半个屏幕，图片被拉伸得很难看。

**原因**：`auto-fit` 会把没用到的空列**折叠掉**，再把空间分给现有的卡片，于是它们被拉宽。

```text
容器能放 4 列，但只有 2 张卡片：

auto-fit:  [   卡片 1    ][   卡片 2    ]       空列被折叠，卡片拉伸
auto-fill: [ 卡片1 ][ 卡片2 ][      ][      ]   空列保留，卡片保持宽度
```

**修复**：希望卡片宽度稳定时，改用 `auto-fill`；或者给最大值设上限，比如 `minmax(min(16rem, 100%), 20rem)`，再用 `justify-content` 控制整体对齐。

## 4. 命名区域：用“画图”的方式布局页面骨架

```css
.page {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header  header"
    "sidebar main"
    "footer  footer";
  min-height: 100dvh;
}

.page__header  { grid-area: header; }
.page__sidebar { grid-area: sidebar; }
.page__main    { grid-area: main; }
.page__footer  { grid-area: footer; }

/* 窄屏：改成单列，只需要重画这张图 */
@media (max-width: 48rem) {
  .page {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "header"
      "main"
      "sidebar"
      "footer";
  }
}
```

调整布局时只改“图”，子元素的代码一行都不用动。

### 坑四：改了一行区域定义，整个布局全乱了

**现象**：给页面加了一个通知栏区域后，所有元素都挤成了一列，好像 Grid 完全没生效。

**原因**：`grid-template-areas` 有严格的规则，任何一条不满足，**整条声明都会被浏览器丢弃**：

- 每一行字符串的单元格数量必须相同，并且等于列数；
- 同名区域必须连成一个矩形，不能是 L 形或者断开的；
- 空单元格用 `.` 表示，不能留空。

声明被丢弃后，子元素的 `grid-area` 找不到对应的区域，全部按默认规则排成一列。浏览器不会报错。

**修复与预防**：在 DevTools 的 Styles 面板里，无效的声明会被划掉，并带一个黄色警告图标，看到它就说明区域定义写错了。修改区域定义时，逐行数一下单元格数量。

## 5. 跨行跨列与隐式轨道

```css
.featured {
  grid-column: span 2; /* 跨 2 列 */
}

.hero {
  grid-column: 1 / -1; /* 从第 1 条线到最后一条线，即占满整行 */
}
```

`-1` 表示最后一条网格线，`1 / -1` 是“占满一整行”的常用写法。

子元素数量超出了你定义的行数时，浏览器会自动创建**隐式行**。它们的高度默认由内容决定，需要统一高度时用 `grid-auto-rows` 设置：

```css
.gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 12rem; /* 自动生成的行都是 12rem 高 */
}
```

::: warning 慎用 `grid-auto-flow: dense` 和 `order`
`dense` 会让后面的小元素回填前面的空隙，`order` 会改变显示顺序。它们只改变**视觉顺序**，不改变 DOM 顺序。用键盘 Tab 浏览或使用读屏软件的用户，会按 DOM 顺序在页面上“跳来跳去”。内容的阅读顺序有意义时，就别用它们打乱。
:::

## 6. Grid 还是 Flexbox

| 场景 | 选择 |
| --- | --- |
| 页面骨架（头部、侧栏、主区、页脚） | Grid |
| 卡片矩阵、相册、需要行列都对齐的列表 | Grid |
| 表单的“标签 + 输入框”对齐 | Grid |
| 导航条、按钮组、标签列表 | Flexbox |
| 一行内元素的对齐和间距分配 | Flexbox |

判断标准：**需要行和列同时对齐用 Grid，只沿一个方向排开用 Flexbox**。两者经常嵌套使用：Grid 搭骨架，骨架里的导航条用 Flexbox。

## 排查思路

1. **打开 Grid 可视化**：DevTools 的 Elements 面板里，Grid 容器旁边有 `grid` 标记，点击后页面上会画出网格线、线编号和区域名称，一眼就能看出元素落在了哪个格子。
2. **列被撑宽**：选中那一列里的元素，看是哪个子元素的内容最宽；把 `1fr` 改成 `minmax(0, 1fr)` 验证。
3. **布局整体失效**：在 Styles 面板找有没有被划掉、带警告图标的 `grid-template-*` 声明。
4. **用不同数量的数据测试**：0 条、1 条、2 条、刚好一行、多行，`auto-fit` 和 `auto-fill` 的差异只在数量少时出现。

## 检查清单

- [ ] 内容长度不可控的列使用 `minmax(0, 1fr)`
- [ ] 响应式卡片网格使用 `repeat(auto-fit/auto-fill, minmax(min(Xrem, 100%), 1fr))`
- [ ] 根据“数据少时是否允许拉伸”选择 `auto-fit` 或 `auto-fill`
- [ ] 页面骨架用 `grid-template-areas`，每行单元格数量一致、区域是矩形
- [ ] 间距统一用 `gap`，不给子元素拼 margin
- [ ] 没有用 `dense`、`order` 打乱有意义的阅读顺序

## 延伸阅读

- [Flexbox 弹性布局](/web/css/flexbox)：`min-width: auto` 的同类问题
- [响应式布局与容器](/web/css/layout)：容器查询与断点
- [可访问性实战](/web/frontend/accessibility)：视觉顺序与键盘顺序
