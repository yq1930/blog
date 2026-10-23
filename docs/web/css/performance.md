---
title: CSS 性能优化
description: 分加载和运行两个阶段讲 CSS 性能：为什么 CSS 会阻塞首屏、为什么读一下 offsetWidth 就会卡，并修复字体闪烁、中文字体过大、滚动卡顿等实际问题。
---

# CSS 性能优化

CSS 的性能问题分两类，症状完全不同：

- **加载阶段**：CSS 没下载完，页面一直白着；字体没加载完，文字看不见或者突然变样；
- **运行阶段**：滚动一卡一卡，拖拽跟不上手指，输入有延迟。

优化前先判断是哪一类，再对症下药。盲目给所有元素加 `will-change`、到处改选择器写法，往往收效甚微。

::: tip 读完这篇你会
- 理解渲染流水线，知道哪些操作“贵”
- 处理阻塞渲染的 CSS 和字体，缩短白屏时间
- 发现并修复“强制同步布局”这类运行时卡顿
:::

## 1. 原理：浏览器怎么把 CSS 变成画面

```text
HTML → DOM 树 ┐
              ├→ 样式计算 → 布局 → 绘制 → 合成 → 屏幕
CSS  → 样式表 ┘              ↑重排    ↑重绘   ↑仅合成
```

可以拿装修房子打比方：

- **布局**（也叫重排）：重新测量每件家具的尺寸、重新摆放位置。一件家具变大，周围的都要挪。**最贵**。
- **绘制**（也叫重绘）：位置不变，只是重新刷墙、换颜色。**中等**。
- **合成**：在透明玻璃上挪动贴纸，墙和家具都不用动。**最便宜**。

| 操作 | 触发 |
| --- | --- |
| 改 `transform`、`opacity` | 只合成 |
| 改 `color`、`background`、`box-shadow` | 绘制 + 合成 |
| 改 `width`、`height`、`margin`、`top`、字号；插入删除元素 | 布局 + 绘制 + 合成 |

## 2. 加载阶段：CSS 为什么会让页面白屏

浏览器在 CSS 下载并解析完之前**不会渲染页面**。这是故意的：如果先用无样式的 HTML 渲染，等 CSS 来了再重新排版，用户会看到页面剧烈闪烁。代价是 CSS 越大、请求越慢，白屏越久。

优化思路是：**首屏需要的 CSS 尽快给，用不到的往后放**。

- **构建时合并、压缩**，减少请求数和体积；
- **避免在 CSS 里写 `@import`**：浏览器下载完当前文件、解析到 `@import` 才发现还有依赖，再发请求，形成串行等待。用构建工具在打包时合并；
- **按需加载**：路由级代码分割会让每个页面只加载自己的 CSS；
- **非关键样式不阻塞**：打印样式可以加 `media="print"`，浏览器会以低优先级下载，不阻塞首屏。

```html
<link rel="stylesheet" href="/assets/app.css" />
<link rel="stylesheet" href="/assets/print.css" media="print" />
```

对首屏特别敏感的落地页，可以把首屏用到的少量关键 CSS 直接内联在 `<head>` 里，剩下的再异步加载。判断“关键”的标准是：去掉它，首屏会立刻变形。

## 3. 坑一：字体加载期间，文字看不见或突然跳动

**现象**：页面打开后，标题的位置空白了一两秒才出现文字（慢网络下更久）；或者文字先用系统字体显示，过一会儿“闪”一下变成另一种字体，整段文字的换行位置都变了。

**原因**：自定义字体还没下载完时，浏览器要么先隐藏文字等字体（称为 FOIT），要么先用备用字体显示、下载完再替换（称为 FOUT）。替换时，两种字体的宽度不同，就会引起布局跳动。

**修复**：

```css
@font-face {
  font-family: 'BrandSans';
  src: url('/fonts/brand-sans.woff2') format('woff2');
  font-display: swap; /* 先用备用字体显示，不让用户看空白 */
}
```

- `font-display: swap` 保证文字始终可见；
- 首屏标题用到的关键字体可以 `<link rel="preload" as="font" type="font/woff2" crossorigin>` 提前下载（`crossorigin` 不能省，否则会下载两次）；
- 选择和自定义字体宽度接近的备用字体，减少替换时的跳动。

## 4. 坑二：引入一个中文字体，页面多了好几 MB

**现象**：为了标题好看引入了一款中文字体，首页体积暴涨，手机上标题半天显示不出来。

**原因**：英文字体只有几百个字符，中文字体动辄包含数万个汉字，单个文件常常有数 MB 甚至更大。

**修复**：

- **能用系统字体就用系统字体**：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif` 在各平台都有不错的效果，零下载；
- **只用在少量固定文字上**（如 Logo、标题）：用字体子集工具只保留实际用到的字，体积能从几 MB 降到几十 KB；
- **必须全量使用**：选择支持按 `unicode-range` 分片的字体服务或方案，让浏览器只下载页面上出现的字所在的分片。

## 5. 运行阶段：强制同步布局

正常情况下，你连续修改样式，浏览器会把它们攒起来，在下一帧统一计算布局。但如果你**改了样式之后立刻读取布局信息**（比如 `offsetWidth`），浏览器为了给你一个准确的值，只能马上把布局算一遍。这叫**强制同步布局**。

### 坑三：一个循环让页面卡了几百毫秒

**现象**：给列表里每一项设置高度，列表有几百项时，页面明显卡顿。

```js
// ❌ 读和写交替：每次循环都触发一次完整的布局计算
for (const el of items) {
  el.style.height = `${el.offsetWidth * 0.75}px` // 读 offsetWidth → 写 height → 下一轮再读……
}
```

**原因**：第一轮写了 `height`，布局就“脏”了；第二轮读 `offsetWidth` 时，浏览器只好立刻重新布局。几百项就是几百次布局，这种现象叫**布局抖动**（layout thrashing）。

**修复**：先把要读的都读完，再统一写：

```js
// ✅ 先批量读，再批量写：整个过程只布局一次
const widths = items.map((el) => el.offsetWidth)
items.forEach((el, i) => {
  el.style.height = `${widths[i] * 0.75}px`
})
```

会触发强制布局的常见读取：`offsetWidth/Height/Top/Left`、`clientWidth/Height`、`scrollTop/scrollHeight`、`getBoundingClientRect()`、`getComputedStyle()`。

当然，这个例子最好的写法是根本不用 JS：`aspect-ratio: 4 / 3` 就能让高度跟着宽度走。

## 6. 坑四：滚动监听让页面一卡一卡

**现象**：页面上有“滚动到某处显示返回顶部按钮”“元素进入视口时播放动画”等功能，滚动时明显掉帧。

```js
// ❌ 滚动时每一帧都读布局，还可能触发多次
window.addEventListener('scroll', () => {
  for (const el of sections) {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible')
  }
})
```

**原因**：`scroll` 事件触发得非常频繁，每次都对很多元素调用 `getBoundingClientRect()`，再配合加类名修改样式，就成了反复的读写交替。

**修复**：判断“元素是否进入视口”交给 `IntersectionObserver`，浏览器会在合适的时机异步通知你，不需要你在滚动时反复测量：

```js
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target) // 只需要触发一次
    }
  }
})

sections.forEach((el) => observer.observe(el))
```

确实需要监听滚动时，加上 `{ passive: true }` 告诉浏览器你不会阻止滚动，并用 `requestAnimationFrame` 把处理合并到每帧一次。

## 7. 坑五：毛玻璃和大阴影让低端手机滚动卡顿

**现象**：在电脑上很流畅的页面，在中低端安卓手机上滚动卡顿，特别是有固定顶栏的页面。

**原因**：`backdrop-filter: blur()`（毛玻璃）、大范围的 `box-shadow`、`filter` 都是绘制成本很高的效果。固定在顶部的毛玻璃顶栏，在滚动的每一帧都要重新模糊它后面的内容。

**修复**：在性能敏感的场景降低效果，比如用半透明纯色背景代替毛玻璃、减小阴影的模糊半径；或者只在高性能设备上启用这些效果。

## 8. 长页面：让浏览器跳过看不见的部分

```css
.feed-item {
  content-visibility: auto;            /* 不在屏幕附近的元素，跳过布局和绘制 */
  contain-intrinsic-size: auto 320px;  /* 预估高度，避免滚动条跳动 */
}
```

`content-visibility: auto` 对很长的列表、文档效果明显。注意必须提供 `contain-intrinsic-size` 作为占位高度，否则浏览器会把屏幕外的元素当作 0 高度，滚动条会忽长忽短。

对于独立的小部件（卡片、第三方挂件），可以用 `contain: layout paint` 告诉浏览器“它内部的变化不会影响外面”，缩小每次重新计算的范围。

## 9. 选择器性能：通常不是瓶颈

浏览器从右往左匹配选择器，`.nav *` 这类写法确实更慢。但在现代浏览器里，选择器匹配很少成为真正的瓶颈。保持两个习惯就够了：关键选择器用类名，嵌套不超过 3 层。把精力优先花在上面几个坑上。

## 排查思路

1. **白屏久**：用 Lighthouse 跑一次，看 “Eliminate render-blocking resources”（消除阻塞渲染的资源）里列出了哪些 CSS 和字体；在 Network 面板看 CSS、字体文件的大小和加载时机。
2. **文字跳动、布局偏移**：在 DevTools 的 Rendering 面板勾选 Layout Shift Regions，发生偏移的区域会闪蓝色。
3. **交互卡顿**：用 Performance 面板录制，找长任务里的紫色 Layout 块。DevTools 会在强制同步布局的地方标出 “Forced reflow” 警告，并指向触发它的代码行。
4. **滚动卡顿**：在 Rendering 面板勾选 Paint flashing，看滚动时哪些区域在不停重绘。

## 检查清单

- [ ] CSS 在构建时合并压缩，没有运行时 `@import`
- [ ] 字体使用 `woff2` 和 `font-display: swap`，关键字体预加载
- [ ] 中文字体优先用系统字体，自定义字体做子集
- [ ] JS 里布局的读写分批进行，没有在循环里交替读写
- [ ] 可见性判断用 `IntersectionObserver`，不在滚动事件里测量布局
- [ ] 动画只改 `transform` 和 `opacity`
- [ ] 毛玻璃、大阴影在低端设备上有降级方案

## 延伸阅读

- [动画与过渡](/web/css/animation)：为什么 `transform` 动画更流畅
- [性能与加载体验](/web/frontend/performance)：LCP、CLS、INP 等指标怎么看
- [事件循环与执行模型](/web/JavaScript/event-loop)：长任务如何阻塞交互
