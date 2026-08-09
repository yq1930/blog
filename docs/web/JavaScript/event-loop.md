---
title: 事件循环与执行模型
description: 搞懂调用栈、宏任务和微任务，才能解释为什么 setTimeout 不准、为什么 async 会"卡住"。
---

# 事件循环与执行模型

JavaScript 是单线程的，但浏览器通过事件循环让它能处理异步、网络、用户输入和渲染。不理解事件循环，你就无法准确回答这些问题：`setTimeout(fn, 0)` 为什么不立即执行？Promise 比 setTimeout 先还是后？长任务为什么会让页面卡顿？

## 调用栈是同步执行的唯一通道

每调用一个函数就压一个栈帧，返回时弹出。栈里没清空之前，事件循环不会去处理任何任务。所以"同步代码阻塞异步代码"是根本规律。

```js
console.log('1')
setTimeout(() => console.log('2'), 0)
Promise.resolve().then(() => console.log('3'))
console.log('4')
// 输出顺序：1 4 3 2
```

`2` 最后才输出，是因为 setTimeout 走宏任务，Promise.then 走微任务，而每次同步代码跑完后会**先清空微任务队列**，再取一个宏任务。

## 宏任务与微任务

| 类别 | 常见来源 | 调度时机 |
| --- | --- | --- |
| 同步任务 | 顶层脚本、函数调用 | 立即在调用栈执行 |
| 微任务 | `Promise.then`、`queueMicrotask`、`MutationObserver` | 当前同步代码结束后、下一次渲染前全部清空 |
| 宏任务 | `setTimeout`、`setInterval`、`setImmediate`(Node)、I/O、UI 事件 | 每轮事件循环取一个执行 |

一轮事件循环的简化流程：执行一个宏任务 → 清空所有微任务 → 渲染（如果需要） → 取下一个宏任务。

> 这是为什么 `await` 后面的代码会比 `setTimeout` 回调先跑：`await` 把后续代码注册为微任务。

## 为什么 setTimeout 不精确

`setTimeout(fn, 1000)` 的 1000ms 是**最小延迟**，不是保证时间。下面两种情况都会让它晚于预期：

- 调用栈里还有同步代码在跑（包括上一个长任务）。
- 嵌套超过 5 层时，浏览器会把延迟强制提升到至少 4ms（历史兼容策略）。
- 标签页后台时，定时器会被节流到 1 秒甚至更长。

需要精确节奏（动画、游戏循环、节拍同步）别用 `setInterval`，用 `requestAnimationFrame` 或基于时间戳的差值计算。

## requestAnimationFrame 与渲染时机

浏览器大约每 16.6ms 重绘一次（60fps）。`requestAnimationFrame` 的回调在下次重绘**前**触发，把视觉更新放在这里能保证和屏幕刷新对齐，避免丢帧。

```js
function animate(progress) {
  // 只做视觉相关计算
  box.style.transform = `translateX(${progress}px)`
  if (progress < 300) {
    requestAnimationFrame((t) => animate(progress + 2))
  }
}
requestAnimationFrame((t) => animate(0))
```

| 场景 | 用什么 |
| --- | --- |
| 动画 / 视觉更新 | `requestAnimationFrame` |
| 延后到下次事件循环 | `queueMicrotask` 或 `Promise.resolve().then` |
| 真正的延迟 | `setTimeout`，但接受它不精确 |
| 大计算拆分 | `requestIdleCallback` 或手动分片 |

## 长任务会阻塞一切

任何超过 50ms 的同步任务都被算作长任务。在这期间：点击没反应、动画掉帧、Promise 回调排着队跑不了。用户感知到的"卡"，绝大部分是长任务。

拆分思路：把大计算切成小块，用 `setTimeout(0)` 或 `scheduler.yield()` 让出主线程；重计算移到 Web Worker。

```js
async function chunkProcess(items) {
  for (let i = 0; i < items.length; i += 100) {
    processBatch(items.slice(i, i + 100))
    // 让出主线程，让 UI 有机会响应
    await new Promise((r) => setTimeout(r, 0))
  }
}
```

## 理解了事件循环才能理解 async

`async` / `await` 是 Promise 的语法糖，它没有跳出事件循环——它只是让你用同步的写法写异步。`await` 暂停的是当前 async 函数，把控制权交还给事件循环，等 Promise resolve 后用微任务恢复。

所以"async 函数里的代码"和"同步代码"在阻塞主线程这件事上**没有区别**：`await fetch()` 期间页面不卡，是因为网络请求在浏览器底层异步进行；而 `await heavyCalc()` 中 `heavyCalc` 同步跑的那段时间，页面照样卡死。

## 检查表

- 别用 `setTimeout(0)` 做时序保证，它只保证"在当前同步代码之后"。
- 动画一律走 `requestAnimationFrame`，别用 `setInterval`。
- 任何超 50ms 的同步计算都要拆分或挪到 Worker。
- 记住微任务优先于宏任务，写库时不要在微任务里做长循环。
- 用时间戳判断真实经过的时间，而不是数定时器触发的次数。
