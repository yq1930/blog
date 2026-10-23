---
title: 事件循环与执行模型
description: 用“一个厨师处理订单”的模型讲清调用栈、宏任务、微任务和渲染时机，解释 setTimeout 为什么不准、loading 为什么不显示、页面为什么会卡死。
---

# 事件循环与执行模型

下面这些问题，背后都是同一个机制：

- `setTimeout(fn, 0)` 为什么不是立刻执行？
- 倒计时为什么切到后台再回来就不准了？
- 点击按钮后先设置了“加载中”再计算，为什么加载提示根本没出现？
- 一个大循环为什么会让整个页面点不动？

这个机制叫**事件循环**。理解它之后，你看异步代码的执行顺序就不用再靠猜。

::: tip 读完这篇你会
- 用“厨师和订单”模型说清宏任务、微任务和渲染的先后
- 准确预测 `setTimeout`、`Promise`、`await` 混在一起时的输出顺序
- 修复倒计时漂移、加载提示不显示、长任务卡死页面三类问题
:::

## 1. 原理：一个厨师，几张订单队列

JavaScript 主线程就像一家店里**唯一的厨师**：同一时间只能做一道菜（执行一段代码）。

- **调用栈**是厨师手上正在做的这道菜。菜没做完，厨师不会理会别的事情。
- **宏任务队列**是排队的正式订单：定时器到点、用户点击、网络响应，都会变成一张订单排进来。
- **微任务队列**是贴在灶台上的便签：`Promise.then`、`await` 之后的代码都写在便签上。
- **渲染**是把做好的菜摆上橱窗：浏览器把 DOM 的变化真正画到屏幕上。

厨师的工作流程永远是这样循环的：

```text
┌─► 从宏任务队列取一张订单，做完（调用栈清空）
│        │
│        ▼
│   把灶台上的便签全部处理完（清空微任务队列，包括处理中新贴上的）
│        │
│        ▼
│   如果到了刷新时间，把画面更新到屏幕（渲染）
│        │
└────────┘
```

这张图能解释后面所有的现象。记住两条规律：

1. **当前代码没跑完，其他任何事都不会发生**，包括渲染和响应点击。
2. **微任务总是在下一个宏任务之前被清空**，所以 Promise 回调比 `setTimeout` 先执行。

## 2. 用规律预测输出顺序

```js
console.log('1')
setTimeout(() => console.log('2'), 0)
Promise.resolve().then(() => console.log('3'))
console.log('4')
// 输出：1 4 3 2
```

逐步推演：`1`、`4` 是当前订单里的同步代码，最先执行；`then` 的回调贴成便签，当前订单结束后立刻处理，输出 `3`；`setTimeout` 的回调是一张新订单，排在最后，输出 `2`。

`await` 也一样，**`await` 之后的代码会被写成便签**：

```js
async function task() {
  console.log('A')
  await null
  console.log('B') // 这一行变成微任务
}

console.log('1')
task()
console.log('2')
// 输出：1 A 2 B
```

| 类别 | 常见来源 | 什么时候执行 |
| --- | --- | --- |
| 同步代码 | 脚本顶层、函数调用 | 立即执行，直到调用栈清空 |
| 微任务 | `Promise.then/catch/finally`、`await` 之后的代码、`queueMicrotask`、`MutationObserver` | 当前任务结束后，全部清空 |
| 宏任务 | `setTimeout`、`setInterval`、用户事件、网络回调、`MessageChannel` | 每轮循环取一个 |
| 渲染前回调 | `requestAnimationFrame` | 浏览器准备绘制下一帧之前 |

## 3. 坑一：倒计时越走越慢，切到后台更离谱

**现象**：活动页的倒计时，开着放一会儿就比真实时间慢了几秒；手机切到后台再回来，差了好几分钟。

```js
let remaining = 60
const timer = setInterval(() => {
  remaining -= 1 // ❌ 假设每次都正好过了 1 秒
  render(remaining)
}, 1000)
```

**原因**：`setTimeout` / `setInterval` 的时间是**最少等待时间**，不是准确时间：

- 厨师正在做别的菜（有其他代码在执行），到点的定时器只能排队等；
- 嵌套层级很深的定时器，浏览器会强制把间隔提高到至少 4ms；
- 页面在后台时，浏览器会把定时器节流到每秒甚至每分钟一次，以节省电量。

每次“少走一点”，累积起来就变成明显的误差。

**修复**：不要数“定时器触发了几次”，每次触发时用**截止时间**重新计算剩余时间。

```js
const deadline = Date.now() + 60_000 // 记住结束的绝对时间

const timer = setInterval(() => {
  const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
  render(remaining)
  if (remaining === 0) clearInterval(timer)
}, 1000)
```

**怎么避免再犯**：凡是和真实时间挂钩的逻辑（倒计时、超时判断、计时器），都用时间戳差值计算。涉及活动开始、截止这类关键时间，还要以服务器时间为准，因为用户的手机时间可能不准。

## 4. 坑二：先设置了“加载中”，提示却从没出现

**现象**：点击“导出”按钮后，代码先显示加载提示，再执行一段很重的计算。结果界面卡住两秒，加载提示一闪都没有闪过，计算完直接出结果。

```js
button.addEventListener('click', () => {
  loadingEl.hidden = false   // 想先显示加载提示
  const result = heavyCalc() // 同步计算 2 秒
  loadingEl.hidden = true
  show(result)
})
```

**原因**：修改 DOM 不等于立刻画到屏幕上。渲染发生在**当前任务结束之后**，而整个点击回调是一个任务。等它结束时，`hidden` 已经被改回 `true`，浏览器根本没有机会把“加载中”画出来。

**修复**：先让出主线程，让浏览器有机会渲染一帧，再开始计算。

```js
function nextFrame() {
  // 等到下一帧绘制之后再继续
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

button.addEventListener('click', async () => {
  loadingEl.hidden = false
  await nextFrame() // 浏览器在这里把加载提示画出来
  const result = heavyCalc()
  loadingEl.hidden = true
  show(result)
})
```

**怎么避免再犯**：真正的解法是别让重计算阻塞主线程（见下一节）。但只要你需要“先让用户看到某个变化，再做耗时操作”，就要记得先让出一次主线程。

## 5. 坑三：一个大循环让整个页面点不动

**现象**：导入一个几万行的表格时，页面完全卡死，按钮点不动、滚动不了，浏览器甚至提示“页面无响应”。

**原因**：处理几万行数据的同步循环是一道巨大的菜，厨师做完之前，所有点击、渲染都在排队。浏览器把超过 50ms 的任务称为**长任务**，用户能明显感觉到卡顿。

**修复一：分片处理**，每处理一批就让出主线程，让点击和渲染插进来。

```js
async function processInChunks(rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    processBatch(rows.slice(i, i + size))
    updateProgress(Math.min(i + size, rows.length), rows.length)
    await new Promise((resolve) => setTimeout(resolve, 0)) // 让出主线程
  }
}
```

**修复二：放到 Web Worker**。Worker 是另一个线程（另一个厨师），纯计算任务交给它，主线程只负责界面。

**怎么避免再犯**：数据量可能很大的处理（导入、导出、解析、排序大列表）都要先估算耗时；超过几十毫秒就分片或放进 Worker。

::: warning 微任务也会卡死页面
厨师会把便签**全部**处理完才去渲染，处理过程中新贴上的便签也要处理。如果代码在 `then` 里不断产生新的 `then`，渲染就永远轮不到，页面同样会卡死。让出主线程必须用宏任务（`setTimeout`、`MessageChannel`），`await Promise.resolve()` 做不到。
:::

## 6. 做动画用 `requestAnimationFrame`

屏幕通常每秒刷新 60 次，约 16.7ms 一帧。`requestAnimationFrame` 的回调正好在每次绘制前执行，用它更新动画能和屏幕刷新对齐，不会丢帧，页面在后台时还会自动暂停。

```js
function slideBox(duration = 600) {
  const start = performance.now()

  function frame(now) {
    // 用经过的时间算进度，而不是数帧数：掉帧时动画也不会变慢
    const progress = Math.min(Math.max((now - start) / duration, 0), 1)
    box.style.transform = `translateX(${progress * 300}px)`
    if (progress < 1) requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
```

用 `setInterval` 做动画，回调时机和屏幕刷新对不齐，容易出现抖动和掉帧。

## 排查思路：页面卡顿时怎么找原因

1. 打开 DevTools 的 **Performance** 面板，点击录制，复现卡顿操作，停止录制。
2. 在 Main（主线程）轨道里找右上角带**红色三角**的灰色块，那就是长任务。
3. 点开长任务，看下方的调用树（Bottom-Up / Call Tree），耗时最多的函数就是要优化的目标。
4. 线上监控可以用 `PerformanceObserver` 监听 `longtask`，把长任务上报，找到真实用户卡在了哪里。

## 检查清单

- [ ] 和时间相关的逻辑用时间戳差值计算，而不是数定时器次数
- [ ] 需要先展示变化再做耗时操作时，先让出一次主线程
- [ ] 超过 50ms 的同步计算分片处理或交给 Web Worker
- [ ] 动画用 `requestAnimationFrame` 或 CSS 动画，不用 `setInterval`
- [ ] 不在微任务里做长循环或无限递归

## 延伸阅读

- [异步流程与 Promise](/web/JavaScript/async)：Promise 的状态和错误传递
- [性能与加载体验](/web/frontend/performance)：长任务如何影响交互指标
- [动画与过渡](/web/css/animation)：哪些 CSS 属性做动画不会卡
