---
title: 异步流程与 Promise
description: 用“取餐小票”理解 Promise，讲清错误怎么传递、何时并发、怎样取消旧请求和防重复提交，修掉一直转圈、旧数据覆盖新数据等常见异步 bug。
---

# 异步流程与 Promise

异步代码的 bug 有个共同特点：**本地很难复现，线上偶发**。页面一直转圈、搜索结果对不上关键词、按钮点两下生成两条记录……它们往往不是语法写错了，而是没想清楚三件事：结果什么时候回来、失败由谁处理、过时的结果还要不要。

::: tip 读完这篇你会
- 用“取餐小票”模型理解 Promise 和 `async/await`
- 写出不会“永远加载中”的请求代码
- 正确地串行、并发、取消请求，并防止重复提交
:::

## 1. 原理：Promise 是一张取餐小票

在快餐店点餐，收银员不会让你站在柜台前干等，而是给你一张小票。你拿着小票去找座位、刷手机；餐好了会叫号，卖完了也会通知你。

Promise 就是这张小票：

- 它代表一个**将来才有结果**的操作（请求、读文件、定时器）；
- 它只有三种状态：**等待中**（pending）、**成功**（fulfilled）、**失败**（rejected）；
- 状态只会变一次：叫过号的小票不会再变回“等待中”，也不会从“成功”变成“失败”。

```js
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms) // ms 毫秒后把小票标记为“成功”
  })
}

wait(300).then(() => console.log('300ms 到了'))
```

`async/await` 是更好读的写法：`await` 就像“等叫号”，但它只暂停**当前这个函数**，浏览器线程照常处理点击和渲染，页面不会卡住。

```js
async function loadProfile(userId) {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(`请求失败：${response.status}`)
  return response.json()
}
```

注意第二行的判断：`fetch` 只有在网络断开时才会失败，**服务器返回 404、500 时 Promise 照样是“成功”**，必须自己检查 `response.ok`。

## 2. 错误怎么传递

`await` 一个失败的 Promise，相当于在那一行 `throw` 了一个错误。它会沿着调用链向上冒泡，直到被某个 `try/catch` 接住。

```text
fetch 失败 ──► loadProfile 抛出 ──► 调用它的 initPage 抛出 ──► 被 try/catch 接住，显示提示
```

原则：**能给用户反馈的那一层处理错误，中间层不吞错误**。中间层如果写了 `catch` 却不重新抛出，上层就以为一切正常。

### 坑一：请求失败后，页面永远在转圈

**现象**：网络一抖，页面就一直显示“加载中”，只能刷新。

```js
async function init() {
  loading.value = true
  const data = await loadProfile(id) // 这里抛错，下一行永远不会执行
  profile.value = data
  loading.value = false
}
```

**原因**：`await` 抛错后，函数直接跳出，`loading.value = false` 被跳过了。

**修复**：把“结束加载”放进 `finally`，无论成功失败都会执行。

```js
async function init() {
  loading.value = true
  try {
    profile.value = await loadProfile(id)
  } catch (error) {
    errorMessage.value = '加载失败，请重试'
    console.error(error)
  } finally {
    loading.value = false // 一定会执行
  }
}
```

**怎么避免再犯**：每个加载状态都要有三个出口——成功、失败、结束。写完代码后手动把网络调成 Offline（DevTools → Network → Throttling）试一次。

## 3. 串行还是并发

两个互不依赖的请求，没必要一个等完再发另一个：

```js
// ❌ 串行：总耗时 = A + B
const profile = await getProfile()
const notices = await getNotices()

// ✅ 并发：总耗时 ≈ max(A, B)
const [profile2, notices2] = await Promise.all([getProfile(), getNotices()])
```

只有第二个请求需要第一个的结果（比如先拿用户 ID 再查订单）时，才需要串行。

| 方法 | 什么时候用 | 有一个失败时 |
| --- | --- | --- |
| `Promise.all` | 所有结果缺一不可 | 立刻整体失败 |
| `Promise.allSettled` | 各部分互不影响，如仪表盘的多个卡片 | 不影响其他项，逐项看结果 |
| `Promise.race` | 超时控制、谁先回来用谁 | 取决于最先结束的那个 |
| `Promise.any` | 多个备用源，有一个成功就行 | 全部失败才失败 |

如果仪表盘用 `Promise.all` 加载 5 个卡片，其中一个接口挂了，整个页面都会显示失败。这种场景应该用 `allSettled`，挂掉的卡片单独显示错误。

## 4. 坑二：`forEach` 里写 `await`，根本不会等

**现象**：批量删除后提示“全部完成”，刷新一看还有数据没删；外层的 `try/catch` 也抓不到删除失败的错误。

```js
ids.forEach(async (id) => {
  await deleteUser(id)
})
console.log('全部完成') // 删除还没结束就执行了
```

**原因**：`forEach` 只负责调用回调，不关心回调返回的 Promise。每个回调里的 `await` 只暂停那个回调自己，`forEach` 早就跑完了。

**修复**：要一个接一个执行就用 `for...of`；要同时执行就用 `Promise.all`。

```js
// 串行：一个完成再做下一个
for (const id of ids) {
  await deleteUser(id)
}

// 并发：同时发起，全部完成再继续
await Promise.all(ids.map((id) => deleteUser(id)))
```

**怎么避免再犯**：`forEach`、`map`、`filter` 都不会等待 `async` 回调。看到 `forEach(async` 就是 bug 信号。并发量很大时（比如上千个请求），还要分批，避免把接口打满。

## 5. 坑三：旧请求后返回，覆盖了新结果

**现象**：搜索框里输入“苹果”，结果列表显示的却是“苹”的结果。只在网络慢的时候偶尔出现。

**原因**：输入“苹”和“苹果”各发了一个请求。网络是不保证顺序的，先发出的“苹”反而后返回，把正确结果覆盖了。这叫**竞态**：多个异步操作抢着写同一个地方。

```text
发出「苹」────────────────────────────► 返回（晚到，覆盖了正确结果）
     发出「苹果」──────────► 返回（先到，先显示）
```

**修复**：发新请求前，取消旧请求。

```js
let controller = null

async function search(keyword) {
  controller?.abort() // 取消上一次还没回来的请求
  controller = new AbortController()

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`, {
      signal: controller.signal
    })
    renderResults(await response.json())
  } catch (error) {
    if (error.name === 'AbortError') return // 主动取消不是错误，安静结束
    showError('搜索失败')
  }
}
```

不方便取消的场景（比如用的库不支持 `signal`），也可以给每次请求编号，只接受最新编号的结果。

**怎么避免再犯**：凡是“用户能连续触发、结果写到同一位置”的请求（搜索、筛选、切换标签页），都要考虑竞态。页面卸载时也要取消请求，避免往已经销毁的组件写数据。

## 6. 坑四：按钮连点两下，生成两条记录

**现象**：网络慢的时候，用户点了两次“提交”，后台出现两条一模一样的订单。

**原因**：第一次请求还没回来，第二次点击又发了一个。

**修复**：让同一个保存任务在进行中时，重复调用直接复用同一个 Promise。

```js
let pending = null

function submitOrder(form) {
  if (pending) return pending // 已经在提交了，返回同一张“小票”

  pending = api.createOrder(form).finally(() => {
    pending = null // 无论成功失败都释放，允许下一次提交
  })
  return pending
}
```

再配合按钮的 `disabled` 状态，能挡住绝大多数重复提交。但前端拦截只是第一道防线：用户刷新页面重试、网络超时自动重发，仍然可能重复。真正可靠的去重要靠服务端，详见[事务、幂等与补偿](/practice/transactional-business-workflow)。

## 7. 别忘了超时

`fetch` 默认没有超时，网络很差时可能挂起很久。现代浏览器可以直接用 `AbortSignal.timeout`：

```js
const response = await fetch('/api/report', {
  signal: AbortSignal.timeout(8000) // 8 秒后自动取消
})
```

超时触发的错误名是 `TimeoutError`，可以据此提示“网络较慢，请重试”。

## 排查思路

1. **控制台出现 `Uncaught (in promise)`**：说明有 Promise 失败了却没人处理。顺着调用栈找到那个没有 `catch` 的 `await` 或 `.then`。
2. **怀疑竞态**：打开 Network 面板，观察同一接口的多个请求的发出顺序和返回顺序（Waterfall 一栏），后发先至就是竞态。
3. **怀疑重复提交**：Network 面板筛选该接口，看一次点击发了几个请求。
4. **复现偶发问题**：在 Network 面板把网速调成 Slow 3G，大部分“偶发”问题会变成“必现”。
5. **看完整的异步调用栈**：Chrome DevTools 默认会把 `await` 之前的调用链也显示出来，断点停住后看 Call Stack 面板即可。

## 检查清单

- [ ] 每个 `fetch` 都检查了 `response.ok`
- [ ] 每个加载状态都在 `finally` 里结束
- [ ] 互不依赖的请求用 `Promise.all` / `allSettled` 并发
- [ ] 没有 `forEach(async ...)`
- [ ] 搜索、筛选类请求会取消旧请求，`AbortError` 不当作错误提示
- [ ] 提交类操作有防重复机制，服务端也有兜底

## 延伸阅读

- [事件循环与执行模型](/web/JavaScript/event-loop)：`await` 之后的代码是什么时候执行的
- [错误处理与异常](/web/JavaScript/error-handling)：错误应该在哪一层处理
- [Axios 请求层](/web/vue/axios)：把超时、取消、错误提示统一收进请求层
