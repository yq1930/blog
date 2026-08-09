---
title: 动画与过渡
description: 区分 transition 和 animation，用对 transform，让动效服务交互而不是炫技。
---

# 动画与过渡

页面上的动效大多为了一个朴素的目的：让用户知道"发生了什么"。弹窗从哪里出现、按钮按下后如何反馈、列表如何展开——这些动效降低认知成本。性能差、过度堆砌、忽略无障碍的动画，反而会让用户烦躁甚至眩晕。本篇讲清楚 transition 和 animation 的边界，以及哪些写法会让浏览器卡顿。

## 先分清 transition 和 animation

两者都能让属性平滑变化，但触发方式和适用场景完全不同。

| 维度 | `transition` | `animation` |
| --- | --- | --- |
| 触发 | 值变化时（hover、class 切换、JS 改属性） | 显式播放，可自动循环 |
| 状态数 | 只有起止两个状态 | 可定义多个关键帧 `@keyframes` |
| 控制 | 只能改持续时间/缓动 | 可控制播放次数、方向、暂停 |
| 适用 | 状态切换的过渡（hover、展开） | 主动的连续动效（加载、入场、循环） |

简单判断：**状态只有"前/后"两态，用 transition；需要中间过程或循环，用 animation。**

```css
/* 状态切换：transition */
.button { transition: background-color 200ms ease; }
.button:hover { background-color: var(--color-primary); }

/* 连续动效：animation */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner { animation: spin 800ms linear infinite; }
```

## 用 transform 和 opacity，而不是 top/left

这是性能动画最关键的一条。动画的属性决定了浏览器要不要重新计算布局。

| 属性 | 触发 | 成本 |
| --- | --- | --- |
| `transform`、`opacity` | 仅合成 | 低，可在合成线程跑 |
| `width`、`height`、`margin` | 重排（layout） | 高，影响周围元素 |
| `top`、`left` | 重排（绝对定位也会） | 高 |
| `background-color`、`color` | 重绘（paint） | 中 |
| `box-shadow` | 重绘 | 中 |

> 移动元素用 `transform: translate()`，而不是改 `top/left`。放大缩小用 `transform: scale()`，而不是改 `width/height`。

```css
/* 差：改 width 触发重排 */
.bad-expand { transition: width 200ms; }
.bad-expand:hover { width: 240px; }

/* 好：用 transform，只动合成层 */
.good-expand { transition: transform 200ms; transform-origin: left center; }
.good-expand:hover { transform: scaleX(1.5); }
```

## 缓动函数要挑对

`ease-out` 适合入场——开始快、结束慢，元素"停"下来时有重量感。`ease-in` 适合退场——开始慢、逐渐加速离开。`linear` 只适合匀速旋转的进度条和加载圈，用在 UI 过渡上会显得机械。

```css
.modal-enter { transition: transform 200ms ease-out, opacity 200ms ease-out; }
.modal-exit  { transition: transform 150ms ease-in,  opacity 150ms ease-in; }
```

避免用 `cubic-bezier` 凭感觉调出"弹跳过大"的效果，除非确实需要趣味性动画。大多数业务场景，`ease-out` 已经足够。

## prefers-reduced-motion：尊重用户设置

部分用户对动画敏感（前庭功能障碍、眩晕），系统层面会开启"减少动效"。忽略这个设置是不友好的，甚至是无障碍缺陷。

```css
.fancy-entrance {
  animation: slideIn 400ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

> 不要把动画做成传达信息**唯一**的方式。重要变化要配文字或视觉反馈，让关掉动画的用户也能理解。

## will-change：用对是优化，用错是负担

`will-change` 提前告诉浏览器"这个元素即将变化"，让它优化合成层。但它是双刃剑：

```css
/* 对的：确实会频繁动画的元素，且在动画前设置 */
.modal { will-change: transform, opacity; }

/* 错的：到处乱加，浪费内存 */
* { will-change: transform; }
```

`will-change` 会常驻一个合成层，占额外内存。正确用法是：**确定某元素接下来会动，提前声明；动画结束后移除**。不要把它当默认优化，更不要加到全局选择器。

## 不要为了动画而动画

最常见的反模式是把每个元素都加 fade-in、每个 hover 都弹跳。结果是页面处处吸引注意力，反而没有焦点。

- 动画要有目的：反馈交互、引导视线、解释状态变化。
- 持续时间别过长：UI 反馈 100-250ms 即可，超过 400ms 用户会觉得"卡"。
- 同屏同时动画的元素别太多，主线程压力会立刻显现。

## 务实的检查清单

- 状态切换用 `transition`，连续/循环动效用 `animation`？
- 移动、缩放是否用了 `transform`，而不是 `top/left/width`？
- 缓动是否匹配方向（入场 ease-out、退场 ease-in）？
- 是否响应了 `prefers-reduced-motion`？
- `will-change` 是否只用在确实需要的元素，且动画后移除？
- 动画是否每个都有明确目的，而非装饰性堆砌？

动画做得好时用户几乎注意不到，做得差时用户只想关掉它。把动效当作交互的注解，而不是主角。
