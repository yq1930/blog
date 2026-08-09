---
title: 异步流程与 Promise
description: 用 Promise、async/await 和取消边界管理请求、并发与失败，让异步代码的结果可预测。
---

# 异步流程与 Promise

异步代码的难点不在语法，而在于结果何时回来、失败由谁处理、旧结果是否还能写入页面。先把这三个问题想清楚，再选择 `Promise` 或 `async/await`。

## 一个 Promise 只描述一次最终结果

Promise 只有三种状态：等待中、已完成、已拒绝。状态一旦从等待中离开就不能再改变，所以它适合表示一次请求、一次文件读取或一次后台计算。

```js
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

wait(300).then(() => console.log('done'))
```

不要把 Promise 当作“能随时发消息的对象”。持续事件应使用事件监听、可观察流或明确的订阅接口。

## `async/await` 让顺序流程更容易读

`async` 函数总会返回 Promise；`await` 只暂停当前函数，不会阻塞浏览器线程。把可能失败的步骤放在 `try/catch` 中，并让调用方拿到可处理的错误。

```js
async function loadProfile(userId) {
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`)
    if (!response.ok) throw new Error(`request failed: ${response.status}`)

    return await response.json()
  } catch (error) {
    console.error('load profile failed', error)
    throw error
  }
}
```

`catch` 不是必须在每一层都写。能够补充上下文或转成用户提示的层处理错误；其余层应继续抛出，避免“失败被吃掉后页面一直加载中”。

## 并发不是把多个 `await` 排成一行

彼此独立的任务应并发发起，再统一等待。依赖上一步结果的任务才需要串行。

```js
const [profile, notices] = await Promise.all([
  getProfile(),
  getNotices()
])
```

| 方法 | 适用场景 | 失败行为 |
| --- | --- | --- |
| `Promise.all` | 所有结果都不可缺少 | 任一失败立即拒绝 |
| `Promise.allSettled` | 需要汇总每项结果 | 总会完成，逐项查看状态 |
| `Promise.race` | 超时或抢占场景 | 最先结束的结果决定状态 |

## 处理竞态：旧请求不能覆盖新页面

用户快速切换筛选条件时，先发出的请求可能后返回。用 `AbortController` 取消旧请求，或者只接受最新一次请求的结果。

```js
let controller

async function search(keyword) {
  controller?.abort()
  controller = new AbortController()

  const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`, {
    signal: controller.signal
  })

  return response.json()
}
```

取消是正常控制流，不应当显示为“系统错误”。在错误处理处识别取消原因后安静结束即可。

## 常见错误：在 `forEach` 里用 `async` 回调

需要"依次处理一批异步任务"时，很多人直觉地写 `forEach` + `await`，但这正是异步里最隐蔽的坑：

```js
// 看起来对，实际不会等待
ids.forEach(async (id) => {
  await deleteUser(id)
})
console.log('全部完成') // 会在删除还没结束时就执行
```

**症状**：循环"跑完了"但任务其实没结束；后续代码提前执行；外层的 `try/catch` 抓不到里面的异常；并发触发还可能撞上接口限流。最迷惑的是——本地数据少时偶尔正常，上线后偶发出错又难复现。

**为什么错**：`forEach` 不等待回调返回的 Promise，也不会把多个 Promise 串起来。它只是"把回调丢出去"，至于回调里的异步什么时候完成、有没有失败，`forEach` 一概不管。

**正确做法**：要串行用 `for...of`，要并发用 `Promise.all`：

```js
// 串行：一个完成再做下一个
for (const id of ids) {
  await deleteUser(id)
}

// 并发：同时发起，全部完成再继续
await Promise.all(ids.map((id) => deleteUser(id)))
```

记住一条：`forEach` 是同步的，它不认识 `async`。循环里要 `await`，就别用 `forEach`。

## 异步代码检查表

- 每个加载状态都要有成功、空数据和失败出口。
- 独立请求使用并发，存在数据依赖时才串行。
- 重试只用于可安全重试的操作；写入请求先考虑幂等性。
- 路由切换、组件卸载或条件变化时，取消不再需要的请求。
