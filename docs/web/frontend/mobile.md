---
title: 移动端适配
description: 从 CSS 像素和视口讲起，解决移动端独有的问题：点不准、刘海遮挡、键盘顶起底栏、弹窗背景滚动穿透、1px 边框变粗、手势冲突，以及怎么在真机和 App 内置浏览器里调试。
---

# 移动端适配

移动端的很多问题，在电脑上根本复现不了：

- 按钮在电脑上点得很准，在手机上总是点到旁边的那个；
- iPhone 底部的横条挡住了“提交”按钮；
- 键盘一弹出，固定在底部的工具栏被顶到了屏幕中间；
- 弹窗里滑动列表，结果背后的页面跟着滚；
- 设计稿上细细的 1px 分割线，在手机上看起来特别粗。

这些都是移动端特有的问题。这篇先讲清手机屏幕的几个基本概念，再逐个解决。

::: tip 读完这篇你会
- 理解 CSS 像素、设备像素比和视口
- 处理点击区域、安全区域、键盘遮挡和滚动穿透
- 在真机和微信等 App 内置浏览器里调试页面
:::

## 1. 原理：三种“像素”和两种“视口”

**像素**：

- **物理像素**：屏幕上真实的发光点；
- **CSS 像素**：你在 CSS 里写的 `px`；
- **设备像素比**（`devicePixelRatio`，DPR）：1 个 CSS 像素对应几个物理像素。现在的手机通常是 2 或 3，也就是说 `1px` 的线在屏幕上其实占了 2～3 个物理像素宽。

**视口**：

- **布局视口**：页面排版用的宽度，由 viewport 设置决定；
- **视觉视口**：用户此刻真正看到的区域。双指放大、键盘弹出时，视觉视口会变小，布局视口不变。

可以把布局视口想成一整面墙，视觉视口是你透过窗户看到的那一块。键盘弹出时，就像窗户被挡住了一半，墙并没有变小。很多“固定元素位置不对”的问题都源于此。

## 2. 起点：viewport 设置

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

| 参数 | 含义 |
| --- | --- |
| `width=device-width` | 布局视口宽度等于设备宽度（没有它，手机会按约 980px 宽排版再缩小） |
| `initial-scale=1` | 初始不缩放 |
| `viewport-fit=cover` | 让页面延伸到刘海和圆角区域，配合安全区域使用 |

不要加 `user-scalable=no` 或 `maximum-scale=1` 禁止缩放：视力不好的用户需要放大，这也是可访问性要求。

## 3. 坑一：按钮总是点错

**现象**：列表右侧有“编辑”和“删除”两个小图标按钮，用户经常想点编辑却点到了删除。

**原因**：手指的接触面积比鼠标指针大得多，20px 的按钮在手机上很难点准，两个按钮挨得太近更容易误触。

**修复**：点击区域至少 **44×44 CSS 像素**（苹果和谷歌的设计规范都给出了类似的数值），图标本身可以小，但按钮要够大；相邻按钮之间留至少 8px 间距：

```css
.icon-button {
  display: inline-grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
}

.icon-button svg {
  width: 18px;
  height: 18px;
}
```

危险操作（删除）最好和常用操作分开放，或者加一步确认。

## 4. 坑二：刘海和底部横条挡住了内容

**现象**：固定在底部的“提交订单”栏，有一半被 iPhone 底部的横条（Home Indicator）挡住；横屏时，左侧内容被刘海遮挡。

**修复**：开启 `viewport-fit=cover` 后，用 `env()` 读取系统提供的安全区域尺寸：

```css
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  /* 在原有内边距的基础上，再加上底部安全区域的高度 */
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
```

`env()` 的第二个参数是回退值，在没有安全区域的设备上生效。页面整体也要注意左右两侧的 `safe-area-inset-left/right`，尤其是横屏时。

## 5. 坑三：`100vh` 的页面底部被浏览器工具栏挡住

手机浏览器的地址栏、工具栏会随滚动收起展开，`100vh` 是按收起时的最大高度计算的。用 `100dvh`（动态视口高度）并保留 `100vh` 作为回退，详见 [响应式布局与容器](/web/css/layout)。

## 6. 坑四：键盘弹出后，输入框被挡住，底部栏飞到了中间

**现象**：

- 点击页面下方的输入框，键盘弹出后把它挡住了，用户看不到自己在输入什么；
- 固定在底部的工具栏，在 iOS 上被键盘“顶”到了屏幕中间，或者被键盘盖住。

**原因**：键盘弹出时，变化的是**视觉视口**。不同系统处理方式不同：有的会缩小布局视口，有的只是把页面往上推。`position: fixed` 的元素相对于哪个视口定位，在不同浏览器里也不一致。

**修复**：

1. 输入框获得焦点后，确保它滚动到可见位置：

```js
input.addEventListener('focus', () => {
  // 等键盘动画结束再滚动
  setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
})
```

2. 需要让底部栏贴在键盘上方时，用 `visualViewport` 计算键盘占用的高度：

```js
const vv = window.visualViewport
if (vv) {
  const update = () => {
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--keyboard-height', `${keyboard}px`)
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
}
```

```css
.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--keyboard-height, 0px);
}
```

**怎么避免再犯**：带输入框的页面（聊天、评论、表单）必须在 iOS 和安卓真机上各测一遍，模拟器几乎复现不了键盘问题。

## 7. 坑五：弹窗里滑动，背后的页面也跟着滚

**现象**：打开一个底部弹出的选择面板，在面板里上下滑动选项，滑到底之后再滑，背后的页面开始滚动。这叫**滚动穿透**。

**原因**：浏览器的默认行为是“滚动链”：内部区域滚到头之后，继续的滚动会传递给外层可滚动的元素。

**修复**：

```css
.sheet__body {
  overflow-y: auto;
  overscroll-behavior: contain; /* 滚到头时不再把滚动传给外层 */
}
```

如果弹窗打开期间要完全锁定背景，可以在打开时固定 `body`，关闭时恢复原来的滚动位置：

```js
let savedY = 0

function lockScroll() {
  savedY = window.scrollY
  Object.assign(document.body.style, { position: 'fixed', top: `-${savedY}px`, width: '100%' })
}

function unlockScroll() {
  Object.assign(document.body.style, { position: '', top: '', width: '' })
  window.scrollTo(0, savedY) // 回到打开弹窗前的位置
}
```

只写 `body { overflow: hidden }` 在 iOS Safari 的部分版本上锁不住，而且关闭后页面可能跳回顶部，所以要像上面这样记录并恢复位置。

## 8. 坑六：1px 的分割线看起来很粗

**现象**：设计稿上细细的分割线，在 3 倍屏的手机上看起来明显比设计稿粗。

**原因**：设计师通常按物理像素画 1 像素细线，而 CSS 的 `1px` 在 DPR 为 3 的屏幕上占 3 个物理像素。

**修复**：较新的 iOS 和安卓浏览器支持小数像素，可以直接写 `0.5px`；需要兼容更多设备时，用伪元素画线再缩放：

```css
.list-item {
  position: relative;
}

.list-item::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--color-border);
  transform: scaleY(0.5); /* 缩成一半，看起来更细 */
  transform-origin: bottom;
}
```

## 9. 让键盘适合输入的内容

| 内容 | 写法 | 弹出的键盘 |
| --- | --- | --- |
| 邮箱 | `type="email"` | 带 @ 和 . |
| 手机号 | `type="tel"` | 拨号键盘 |
| 验证码、证件号 | `type="text" inputmode="numeric"` | 数字键盘，不会吞掉开头的 0 |
| 金额 | `inputmode="decimal"` | 带小数点的数字键盘 |
| 搜索 | `type="search" enterkeyhint="search"` | 回车键显示“搜索” |

输入框字号不要小于 16px，否则 iOS 会自动放大页面，详见 [表单设计与校验](/web/frontend/form-design)。

## 10. 手势冲突

| 冲突 | 表现 | 处理 |
| --- | --- | --- |
| 横向轮播 vs 页面纵向滚动 | 想上下滚页面，却拖动了轮播 | 轮播设置 `touch-action: pan-y`，把纵向滚动交给浏览器 |
| 自定义画板、地图 vs 浏览器缩放 | 双指缩放时整个页面被放大 | 该区域设置 `touch-action: none`，由自己处理手势 |
| 下拉刷新 vs 列表滚动 | 列表没滚到顶就触发了刷新 | 只在滚动位置为 0 时启用下拉刷新；不需要浏览器自带的下拉刷新时，可设 `overscroll-behavior-y: contain` |

`touch-action: none` 会让该区域完全不能滚动页面，只在确实需要完全接管手势的地方使用。

## 11. 移动端性能

手机的 CPU、内存和网络都比电脑差很多：

- 图片用 `srcset` 按屏幕宽度加载合适尺寸，屏幕下方的图片懒加载；
- 滚动监听加 `{ passive: true }`，可见性判断用 `IntersectionObserver`；
- 动画只改 `transform` 和 `opacity`；
- 测试时在 Performance 面板把 CPU 降速 4～6 倍，更接近中低端手机的真实表现。

## 排查思路：在真机上调试

1. **iPhone**：在 iPhone 的“设置 → Safari → 高级”中打开“网页检查器”，用数据线连接 Mac，在 Mac 版 Safari 的“开发”菜单里选择手机上的页面，就能使用完整的开发者工具。
2. **安卓**：手机开启 USB 调试，连接电脑后在 Chrome 地址栏打开 `chrome://inspect`，选择对应页面。
3. **微信等 App 内置浏览器**：这些环境往往无法直接连接开发者工具，可以在测试环境临时引入 vConsole 或 eruda 这类页面内调试面板，查看日志、网络请求和本地存储。**不要把它们发布到生产环境**。
4. **先用 DevTools 设备模式粗查**布局问题，再用真机细查键盘、安全区域、手势、滚动穿透这类问题。

## 检查清单

- [ ] viewport 设置正确，没有禁止缩放
- [ ] 可点击区域至少 44×44，相邻按钮有间距
- [ ] 固定在边缘的元素加上了 `env(safe-area-inset-*)`
- [ ] 全屏高度使用 `dvh` 并保留 `vh` 回退
- [ ] 输入框获得焦点后可见，底部栏在键盘弹出时位置正确
- [ ] 弹窗内滚动不穿透到背景
- [ ] 输入框使用合适的 `type` / `inputmode`，字号不小于 16px
- [ ] 主要流程在 iOS 和安卓真机上测试过

## 延伸阅读

- [响应式布局与容器](/web/css/layout)：`dvh`、横向滚动条
- [表单设计与校验](/web/frontend/form-design)：中文输入法、数字输入
- [移动 H5 会话与恢复](/practice/mobile-h5-reliability)：微信 H5 里的真实问题
