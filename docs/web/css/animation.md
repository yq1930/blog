---
title: 动画与过渡
description: 讲清 transition 与 animation 的分工、为什么 transform 动画不卡，并修复 display:none 不过渡、height:auto 不能动、动画结束跳回原位、transform 让 fixed 弹窗错位等常见问题。
---

# 动画与过渡

好的动效能告诉用户“发生了什么”：弹窗从哪里来、列表在展开、按钮已经被按下。但动画也是 CSS 里“玄学问题”最多的地方：

- 元素从 `display: none` 显示出来，过渡效果怎么都不生效；
- 想做一个展开收起的动画，`height: auto` 就是动不了；
- 动画播完，元素又“啪”地跳回了原位；
- 给容器加了一个入场动画，里面的弹窗位置全乱了。

这篇从浏览器怎么绘制画面讲起，把这些问题挨个拆开。

::: tip 读完这篇你会
- 分清 `transition` 和 `animation` 的使用场景
- 知道为什么 `transform` 和 `opacity` 做动画最流畅
- 解决显示隐藏、高度展开、结束状态、fixed 定位错乱等动画坑
:::

## 1. 原理：为什么有的动画卡，有的不卡

浏览器画出一帧画面，大致要经过三个步骤：

```text
布局（Layout）：算出每个元素的位置和大小
    ↓
绘制（Paint）：把文字、颜色、阴影画到图层上
    ↓
合成（Composite）：把多个图层叠起来，显示到屏幕
```

动画每一帧都要重新走一遍流程，改哪个属性，决定了要从哪一步开始重来：

| 改的属性 | 从哪一步重来 | 成本 |
| --- | --- | --- |
| `width`、`height`、`top`、`left`、`margin` | 布局 | 高：还会影响周围的元素 |
| `color`、`background`、`box-shadow` | 绘制 | 中 |
| `transform`、`opacity` | 只需合成 | 低：可以交给 GPU，不占主线程 |

打个比方：改 `width` 像是重新摆放房间里的家具，所有东西都要重新量尺寸；改 `background` 像是重新刷墙；改 `transform` 则像在一块透明玻璃上挪动一张贴纸，下面的画完全不用动。

所以做动画的第一原则是：**移动用 `translate`，缩放用 `scale`，显隐用 `opacity`**。

```css
/* ❌ 改 left：每帧都要重新布局 */
.drawer { left: -300px; transition: left 300ms; }
.drawer.is-open { left: 0; }

/* ✅ 改 transform：只需合成，流畅得多 */
.drawer { transform: translateX(-100%); transition: transform 300ms ease-out; }
.drawer.is-open { transform: translateX(0); }
```

## 2. `transition` 还是 `animation`

| | `transition` | `animation` |
| --- | --- | --- |
| 怎么触发 | 属性值变化时（hover、切换类名） | 元素渲染出来就播放 |
| 有几个状态 | 起点和终点两个 | 可以用 `@keyframes` 定义很多个 |
| 能否循环 | 不能 | 能 |
| 适合 | 状态切换：悬停、展开、选中 | 主动的动效：加载圈、入场、提示抖动 |

```css
/* 状态切换用 transition */
.button { transition: background-color 150ms ease; }
.button:hover { background-color: var(--color-primary-hover); }

/* 循环动效用 animation */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner { animation: spin 800ms linear infinite; }
```

## 3. 坑一：从 `display: none` 显示出来，没有过渡效果

**现象**：弹层用 `display: none` 隐藏，显示时同时把 `opacity` 从 0 改成 1，结果它是直接“蹦”出来的，没有淡入。

**原因**：`display: none` 的元素根本不参与渲染，浏览器没有“它原来是透明的”这个起点。`display` 和 `opacity` 在同一帧里改变，过渡没有可以开始的状态。

**修复**：用 `visibility` 加 `opacity` 来做显隐，元素一直在渲染树里：

```css
.popover {
  opacity: 0;
  visibility: hidden;
  transition: opacity 200ms ease, visibility 200ms;
}
.popover.is-open {
  opacity: 1;
  visibility: visible;
}
```

`visibility: hidden` 的元素看不见，也点不到、读屏软件读不到，效果和 `display: none` 接近，但能参与过渡。用 Vue 时，`<Transition>` 组件已经帮你处理好了插入和移除的时机，直接用它即可。

::: details 新写法：`@starting-style`
较新的浏览器支持用 `@starting-style` 声明“元素刚出现时的起始样式”，再配合 `transition-behavior: allow-discrete`，就能直接对 `display` 做过渡。目前浏览器支持还不完全一致，正式使用前请确认目标用户的浏览器版本。
:::

## 4. 坑二：`height: auto` 做不了展开动画

**现象**：折叠面板从 `height: 0` 展开到 `height: auto`，没有动画，直接跳到了展开状态。

**原因**：过渡需要在两个**具体的数值**之间计算中间值。`auto` 不是一个数值，浏览器不知道从 0 到 `auto` 的中间是多少。

**修复**：用 Grid 的 `fr` 单位“曲线救国”。`0fr` 到 `1fr` 是可以过渡的：

```html
<div class="collapse" :class="{ 'is-open': open }">
  <div class="collapse__inner">折叠的内容……</div>
</div>
```

```css
.collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 250ms ease;
}
.collapse.is-open {
  grid-template-rows: 1fr;
}
.collapse__inner {
  overflow: hidden; /* 收起时把内容藏起来 */
  min-height: 0;
}
```

常见的另一种写法是把 `max-height` 从 0 过渡到一个很大的值（如 `1000px`），但实际内容往往远小于这个值，收起时会有一段明显的“延迟”，不如 Grid 的写法自然。

## 5. 坑三：动画播完，元素跳回了原位

**现象**：元素用 `@keyframes` 从下方滑入，播放结束的瞬间，它又跳回了动画开始前的位置（或者透明度变回了 0）。

**原因**：`animation` 默认只在播放期间生效，结束后元素恢复成它自身样式里定义的状态。

**修复**：最清晰的做法是**让元素的正常样式就是最终状态**，动画只负责“从起点过来”：

```css
@keyframes slide-in {
  from { opacity: 0; transform: translateY(16px); }
  /* 不写 to：默认使用元素自身的样式作为终点 */
}

.toast {
  opacity: 1;
  transform: none;
  animation: slide-in 250ms ease-out;
}
```

另一种做法是加 `animation-fill-mode: forwards`，让元素停在最后一帧。但这样元素的“真实样式”和看到的样式不一致，后面再改样式时容易困惑。

## 6. 坑四：加了 `transform` 之后，里面的弹窗位置全乱了

**现象**：给页面主体容器加了一个入场动画（`transform: translateY(...)`），结果容器里的全屏弹窗不再覆盖整个屏幕，而是只盖住了容器；弹窗的 `z-index` 设成 9999 也压不住页面头部。

**原因**：带有 `transform`（以及 `filter`、`perspective`、`will-change: transform`）的元素会产生两个副作用：

1. 它成为里面所有 `position: fixed` 元素的定位参照物，fixed 元素不再相对于屏幕定位，而是相对于这个容器；
2. 它创建了一个新的**层叠上下文**，里面元素的 `z-index` 只在容器内部比较，再大也越不过容器本身的层级。

**修复**：弹窗、抽屉、全局提示这类需要相对屏幕定位的组件，渲染到 `<body>` 下面，不要放在可能被加动画的容器里。Vue 用 `<Teleport to="body">`，React 用 Portal。

**怎么避免再犯**：给大容器加 `transform` 动画前，先检查里面有没有 fixed 元素；动画结束后，把 `transform` 恢复为 `none`。

## 7. 时长和缓动

- **时长**：按钮、开关这类小反馈 100～200ms；弹窗、抽屉 200～300ms；超过 400ms 用户会觉得“慢”。
- **缓动**：入场用 `ease-out`（先快后慢，像物体落定）；退场用 `ease-in`（先慢后快，像离开）；`linear` 只适合匀速旋转的加载圈。
- **数量**：同一屏里同时动的东西不要太多，动画应该引导视线，而不是让每个元素都抢注意力。

## 8. 尊重“减少动态效果”设置

有些用户对动画敏感（会头晕、恶心），会在系统里开启“减少动态效果”。这时应该关掉或弱化动画：

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

这里用 `0.01ms` 而不是 `0`，是为了让依赖 `transitionend`、`animationend` 事件的 JS 逻辑仍然能正常触发。另外，重要的状态变化不能只靠动画表达，还要有文字或图标。

## 9. `will-change`：别到处加

`will-change: transform` 会提前给元素创建独立图层，让动画开始时更顺滑。但每个图层都占内存，到处加反而会让页面更卡，特别是在手机上。

- 只加在**确实会频繁动画**的少数元素上；
- 动画结束后去掉（JS 里可以在 `transitionend` 时移除）；
- 不要写 `* { will-change: transform }`。

还要记得，它和 `transform` 一样会影响里面的 fixed 元素和 `z-index`（见坑四）。

## 排查思路

1. **动画效果不对**：打开 DevTools 的 Animations 面板（Ctrl/Cmd + Shift + P，输入 Animations），可以把动画放慢到 10%、反复回放，逐帧看哪里不对。
2. **动画卡顿**：用 Performance 面板录制，看每一帧里有没有紫色的 Layout（布局）和绿色的 Paint（绘制）块；有的话，说明动画属性触发了布局或绘制。
3. **看哪些区域在重绘**：在 Rendering 面板勾选 Paint flashing，重绘的区域会闪绿色。动画期间大片闪绿，就要考虑换成 `transform`。
4. **fixed 或 z-index 异常**：沿着元素往上找祖先，看有没有 `transform`、`filter`、`will-change`。

## 检查清单

- [ ] 移动、缩放、显隐用 `transform` 和 `opacity`
- [ ] 需要过渡的显隐用 `visibility` + `opacity`，或框架的过渡组件
- [ ] 展开收起用 `grid-template-rows: 0fr → 1fr`
- [ ] 动画的最终状态写在元素自身样式里
- [ ] 弹窗、抽屉渲染到 `body` 下，不受容器 `transform` 影响
- [ ] 响应了 `prefers-reduced-motion`
- [ ] `will-change` 只加在少数确实需要的元素上

## 延伸阅读

- [CSS 性能优化](/web/css/performance)：布局、绘制、合成的详细成本
- [事件循环与执行模型](/web/JavaScript/event-loop)：`requestAnimationFrame` 做 JS 动画
- [可访问性实战](/web/frontend/accessibility)：动效与无障碍
