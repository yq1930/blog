---
title: 移动端适配
description: 从触摸目标、安全区域到输入法遮挡，解决移动端那些桌面端遇不到的坑。
---

# 移动端适配

移动端适配不是"把桌面页面缩小"。触摸目标、安全区域、输入法遮挡、100vh 陷阱、手势冲突——这些是移动端独有的问题，桌面端的直觉在这里常常失效。本篇讲移动端最容易踩的几个坑和对应的解决思路。

## viewport：一切的起点

移动端的 viewport meta 标签决定了浏览器如何渲染页面宽度。没有它，手机会把桌面页面当成 980px 宽来缩放显示，用户得手动放大：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

| 参数 | 含义 |
| --- | --- |
| `width=device-width` | 视口宽度等于设备宽度 |
| `initial-scale=1` | 初始缩放为 1，不放大不缩小 |
| `viewport-fit=cover` | 允许内容延伸到刘海/圆角区域（配合安全区域） |

> 别用 `user-scalable=no` 禁止缩放——这是无_ACCESSIBILITY_问题，部分老浏览器还有 bug。允许用户放大，做好自己的响应式就行。

## 触摸目标尺寸

手指比鼠标光标大得多。按钮、链接太小或太挤，用户会误触相邻元素。苹果和谷歌的建议是**可点击区域至少 44×44 CSS 像素**，且目标间留有间距：

```css
/* 差：太小的按钮，容易误触 */
.close { width: 20px; height: 20px; }

/* 好：可视尺寸可以小，但点击区域至少 44px */
.close {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* 内部图标小一点没关系，整个元素是点击区 */
.close__icon { width: 16px; height: 16px; }
```

相邻可点击元素之间至少留 8px 间距。列表项整行可点比只让标题可点更好用——增大命中区域，减少误触。

## 100vh 的陷阱

桌面端 `100vh` 等于视口高度。但在移动端浏览器，地址栏会动态显示/隐藏，`100vh` 取的是地址栏隐藏时的高度——结果页面底部被地址栏遮住，用户怎么滚都看不到。

| 单位 | 行为 |
| --- | --- |
| `100vh` | 桌面正常，移动端可能被地址栏遮挡 |
| `100dvh` | 动态视口高度，跟随地址栏变化（推荐） |
| `100svh` | 最小视口高度（地址栏显示时） |
| `100lvh` | 最大视口高度（地址栏隐藏时） |

```css
/* 用 dvh 解决移动端全屏问题 */
.fullscreen { min-height: 100dvh; }

/* 兼容老浏览器：先写 vh 再写 dvh */
.fullscreen { min-height: 100vh; min-height: 100dvh; }
```

## 安全区域：刘海和 Home Indicator

全面屏手机顶部有刘海/灵动岛，底部有 Home Indicator。内容贴到边缘会被遮挡。`viewport-fit=cover` 配合 `env()` 函数处理安全区域：

```css
.app-shell {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* 底部固定栏，避开 Home Indicator */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
```

```css
/* 加回退值，老设备不支持 env() 时用 0 */
.bottom-bar { padding-bottom: 0; padding-bottom: env(safe-area-inset-bottom); }
```

## 输入法遮挡

用户点击输入框时，软键盘弹出会遮挡正在编辑的字段。处理思路：

- 让表单容器可滚动，键盘弹出时浏览器会自动把焦点元素滚进视口（大多数现代浏览器）。
- 避免用 `position: fixed` 把输入框钉死在底部——键盘弹出后它会被顶出可视区，且 fixed 元素不参与自动滚动。
- 监听 `visualViewport` 的 resize 事件，手动调整布局：

```js
// 监听键盘弹出，调整底部栏位置
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const offset = window.innerHeight - window.visualViewport.height
    document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`)
  })
}
```

```css
.bottom-bar { transform: translateY(calc(-1 * var(--keyboard-offset, 0px))); }
```

## 输入类型决定键盘

不同 `input type` 触发不同键盘，直接影响输入效率：

| `type` | 键盘 |
| --- | --- |
| `type="email"` | 带 @ 符号 |
| `type="tel"` | 数字拨号键盘 |
| `type="url"` | 带 / 和 .com |
| `type="number"` | 数字键盘（注意：限制字符，不适合长数字如手机号，用 `inputmode`） |
| `inputmode="numeric"` | 数字键盘但不限制输入 |
| `inputmode="search"` | 搜索键代替回车 |

```html
<!-- 手机号：用 inputmode 而不是 type=number，避免上下箭头和字符限制 -->
<input type="tel" inputmode="numeric" pattern="[0-9]*" />
```

## 手势冲突

移动端手势（滑动、长按、双指缩放）容易和浏览器原生手势或组件间冲突：

| 冲突 | 表现 | 处理 |
| --- | --- | --- |
| 横向滑动轮播 vs 浏览器返回手势 | 用户划轮播触发返回 | 用 `touch-action` 限定方向 |
| 下拉刷新 vs 页面滚动 | 顶部下拉触发刷新，但滚动列表也想下拉 | 只在滚到顶部时启用 |
| 双指缩放 vs 自定义地图手势 | 浏览器抢走缩放 | `touch-action: none` 接管 |

```css
.carousel { touch-action: pan-y; } /* 只处理水平，垂直交给浏览器滚动 */
.map { touch-action: none; }       /* 完全接管手势 */
```

> 慎用 `touch-action: none`，它会让页面在该元素上完全无法滚动。只在确实需要自定义手势（地图、画板）时用。

## 移动端性能注意

移动设备的 CPU 和内存远弱于桌面，且网络不稳定：

| 问题 | 对策 |
| --- | --- |
| 主线程阻塞 | 避免大量同步 JS，长任务拆分 |
| 图片过大 | 用响应式图片 `srcset`，按屏幕宽度加载合适尺寸 |
| 滚动卡顿 | 避免在滚动事件里做重计算，用 `passive` 监听器 |
| 动画掉帧 | 优先 `transform`/`opacity`，不用 `top/left` |

```js
// 滚动监听用 passive，不阻塞滚动
el.addEventListener('scroll', handleScroll, { passive: true })
```

```html
<!-- 响应式图片：不同屏幕加载不同尺寸 -->
<img
  src="/img/hero-small.jpg"
  srcset="/img/hero-small.jpg 480w, /img/hero-medium.jpg 1024w, /img/hero-large.jpg 1920w"
  sizes="(max-width: 48rem) 100vw, 50vw"
  alt="封面图"
  loading="lazy"
/>
```

## 务实的检查清单

- viewport meta 是否正确设置，包含 `viewport-fit=cover`？
- 可点击元素是否至少 44×44 像素，且彼此留有间距？
- 全屏高度是否用了 `dvh` 而非 `vh`，避免被地址栏遮挡？
- 全面屏的安全区域是否用 `env(safe-area-inset-*)` 处理？
- 输入框是否用了正确的 `type`/`inputmode` 触发合适键盘？
- 软键盘弹出时焦点元素是否能自动进入视口？
- 手势冲突是否用 `touch-action` 明确划分？
- 图片是否响应式加载、屏外懒加载？

移动端适配的本质是"假设用户用一根手指、在小屏幕、不稳定网络下操作"。所有设计决策都围绕这个假设展开：够大的点击区、不被遮挡的内容、合适的键盘、流畅的滚动。
