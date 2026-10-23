---
title: 错误处理与异常
description: 错误像烫手山芋沿调用栈往上传，谁能处理谁接住。讲清何时 throw、何时 catch，修复吞异常、误报网络错误、丢失堆栈、异步错误抓不到和线上只看到 Script error 等问题。
---

# 错误处理与异常

错误处理写得不好，会出现两种极端：

- **错误被悄悄吞掉**：点了保存没反应，控制台干干净净，开发者根本无从查起；
- **错误没人接**：一个小组件出错，整个页面白屏。

还有更隐蔽的：把自己的代码 bug 当成“网络错误，请重试”提示给用户，用户重试一百次也没用，开发者还以为是网络问题。

这篇讲清错误是怎么传递的、应该在哪一层处理，以及线上排查错误的实用技巧。

::: tip 读完这篇你会
- 说清 `throw` 之后发生了什么，判断错误该在哪一层处理
- 避开吞异常、`try` 范围过大、丢失原始堆栈、异步错误抓不到等坑
- 搭好全局兜底和上报，让线上错误“看得见、查得到”
:::

## 1. 原理：错误沿着调用栈往上传

`throw` 会立刻中断当前函数，然后把错误交给调用它的函数；调用方没有 `try/catch` 就继续往上交，一直到有人接住，或者到达最顶层变成“未捕获错误”。

```text
render()          ← throw new Error('数据格式错误')
  ↑ 没接，继续往上
loadPage()
  ↑ 没接，继续往上
onRouteChange()   ← try/catch 在这里接住，显示错误页
```

可以把它想成公司里的问题上报：员工搞不定就报给组长，组长搞不定再报给经理。**谁有能力处理、谁能给用户一个交代，谁就接住；其他人可以补充情况再往上报，但不能压着不报。**

## 2. 先分清两类错误

| 类型 | 例子 | 应该怎么办 |
| --- | --- | --- |
| **程序错误**（代码写错了） | 读取 `undefined` 的属性、参数类型不对、调用了不存在的方法 | 不要吞掉，让它尽早暴露并上报，修代码 |
| **操作错误**（运行时可能发生） | 网络断开、接口超时、用户无权限、文件不存在 | 预期内处理：重试、降级、给用户明确提示 |

大多数错误处理的混乱，都来自把这两类混为一谈：把程序错误当操作错误处理（提示用户“请重试”），或者把操作错误当程序错误（网络抖一下就白屏）。

## 3. 用自定义错误区分类型

继承 `Error` 并加上业务字段，上层就能按类型分流处理：

```js
class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options) // options 里可以传 { cause }
    this.name = 'HttpError'
    this.status = status
  }
}

async function request(url) {
  const res = await fetch(url)
  if (!res.ok) throw new HttpError(res.status, `请求失败：${res.status}`)
  return res.json()
}

try {
  await request('/api/profile')
} catch (error) {
  if (error instanceof HttpError && error.status === 401) {
    goLogin() // 操作错误：登录过期，带用户去登录
  } else {
    throw error // 其他情况自己处理不了，继续往上交
  }
}
```

## 4. 坑一：空 `catch`，错误被埋进土里

**现象**：用户反馈“点保存没反应”，开发者打开控制台，没有任何报错，也没有任何请求失败。

```js
try {
  await saveDraft()
} catch (e) {} // ❌ 抓到了，然后什么都没做
```

**原因**：错误被接住后既没处理、没提示，也没上报。对用户和开发者来说，它从来没发生过。

**修复**：`catch` 里至少做一件事——处理、上报或重新抛出。

```js
try {
  await saveDraft()
} catch (error) {
  showToast('保存失败，请稍后重试')
  reportError(error, { action: 'saveDraft' }) // 让开发者也知道
}
```

**怎么避免再犯**：开启 ESLint 的 `no-empty` 规则（空代码块报警）。代码评审时，看到 `catch (e) {}`、`catch (e) { return null }` 都要问一句：出错后谁会知道？

## 5. 坑二：`try` 包得太大，把自己的 bug 当成网络错误

**现象**：页面一直提示“网络错误，请重试”，可是 Network 面板里请求明明是成功的。

```js
try {
  const data = await fetchList()
  renderList(data) // renderList 里有个 bug，读了 undefined 的属性
} catch (e) {
  showToast('网络错误，请重试') // ❌ 渲染 bug 也被当成了网络错误
}
```

**原因**：`try` 块里既有“可能失败的请求”，也有“不该失败的渲染代码”。渲染代码的 bug 被同一个 `catch` 接住，并被错误地归类。

**修复**：`try` 只包住真正可能失败的那一步。

```js
let data
try {
  data = await fetchList()
} catch (error) {
  showToast('网络错误，请重试')
  return
}
renderList(data) // 这里出 bug 会正常抛出，被全局兜底上报
```

**怎么避免再犯**：写 `catch` 前先想清楚“我预期会发生什么错误”，提示文案只描述那一种。

## 6. 坑三：包装错误时，把原始堆栈丢了

**现象**：线上上报的错误只有一句“加载用户失败: Unexpected token < in JSON”，看不出是哪个文件哪一行出的问题。

```js
catch (e) {
  throw new Error(`加载用户失败: ${e.message}`) // ❌ 只保留了 message，原始堆栈丢了
}
```

**原因**：新建的 `Error` 有自己的堆栈，指向这一行 `throw`；原始错误的堆栈（真正出问题的位置）被丢弃了。

**修复**：用 ES2022 的 `cause` 把原始错误挂上去，形成一条错误链：

```js
catch (e) {
  throw new Error('加载用户失败', { cause: e }) // ✅ 原始错误保留在 error.cause 里
}
```

Chrome 控制台打印这类错误时会同时显示原因；上报时把 `error.cause` 一起带上即可。

## 7. 坑四：异步代码里的错误，外面的 `try` 抓不到

**现象**：明明包了 `try/catch`，控制台还是出现 `Uncaught Error` 或 `Uncaught (in promise)`。

```js
try {
  setTimeout(() => {
    throw new Error('定时器里出错') // ❌ 外面的 catch 抓不到
  }, 0)
} catch (e) {}

try {
  saveDraft() // ❌ 忘了 await，返回的 Promise 失败时 catch 抓不到
} catch (e) {}
```

**原因**：`try/catch` 只能接住**同一段同步执行过程**里抛出的错误。定时器回调是之后在另一个任务里执行的，那时 `try` 早已结束；没有 `await` 的 Promise 失败也一样，错误发生时 `try` 已经执行完了。

**修复**：在回调内部处理，或者 `await` 这个 Promise：

```js
setTimeout(() => {
  try {
    doWork()
  } catch (error) {
    reportError(error)
  }
}, 0)

try {
  await saveDraft() // ✅ 等它完成，失败时才会进入 catch
} catch (error) {
  showToast('保存失败')
}
```

**怎么避免再犯**：开启 TypeScript ESLint 的 `no-floating-promises` 规则，它会标出所有“返回了 Promise 却没人等待和处理”的调用。

## 8. 坑五：抛出的不是 `Error` 对象

**现象**：上报平台里一堆错误显示为 `undefined`，或者只有一行字，没有堆栈。

```js
throw '余额不足'                       // ❌ 字符串没有 stack
return Promise.reject({ code: 1001 }) // ❌ 普通对象也没有 stack
```

**修复**：永远抛出 `Error`（或它的子类）实例，需要的业务信息挂在属性上：

```js
const error = new Error('余额不足')
error.code = 'INSUFFICIENT_BALANCE'
throw error
```

## 9. 全局兜底：最后一道安全网

总会有没被接住的错误。全局监听的主要用途是**上报**，让你知道线上发生了什么：

```js
window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { source: 'window.error' })
})

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { source: 'unhandledrejection' })
})

// Vue 3：组件渲染、生命周期、事件处理中的错误
app.config.errorHandler = (error, instance, info) => {
  reportError(error, { source: 'vue', info })
}
```

上报时注意：

- **去重和限流**：同一个错误在循环里触发，一分钟能上报几万次，把日志服务打垮。
- **带上下文**：页面地址、版本号、用户操作，否则只有一行堆栈很难复现。
- **用 Source Map 还原堆栈**：线上代码被压缩过，堆栈是 `a.js:1:23456`。把 Source Map 上传到监控平台，而不是公开部署到线上。

::: warning 线上只看到 “Script error.”
如果脚本放在另一个域名的 CDN 上，出于安全限制，浏览器只会告诉页面 “Script error.”，没有文件、行号和堆栈。解决办法是 `<script>` 加上 `crossorigin="anonymous"`，同时 CDN 返回 `Access-Control-Allow-Origin` 响应头。
:::

## 10. 给用户的信息和给开发者的信息分开

- **给用户**：说人话，告诉他能做什么——“网络不稳定，请稍后重试”“登录已过期，请重新登录”。不要展示堆栈和英文报错。
- **给开发者**：完整的错误对象、堆栈、`cause`、请求参数、请求 ID。

两者用同一个错误对象承载，在展示层和上报层分别取用即可。

## 排查思路：错误被吞了怎么找

1. 打开 DevTools 的 Sources 面板，在右侧 Breakpoints 区域勾选 **Pause on caught exceptions**（在被捕获的异常处也暂停）。
2. 重新操作一遍。哪怕错误被某个 `catch` 吞掉，调试器也会停在**抛出错误的那一行**。
3. 看 Call Stack，一层层往上找到吞掉它的 `catch`。
4. 线上问题：在监控平台按错误信息聚合，看首次出现时间是否和某次发布吻合；再用 Source Map 定位到源码行。

## 检查清单

- [ ] 没有空 `catch`，每个 `catch` 都处理、上报或重新抛出
- [ ] `try` 只包住预期会失败的步骤，提示文案和错误类型匹配
- [ ] 包装错误时用 `{ cause }` 保留原始错误
- [ ] 异步调用都被 `await` 或显式处理
- [ ] 只抛出 `Error` 实例
- [ ] 有全局错误兜底，上报带去重、限流和上下文
- [ ] 跨域脚本加了 `crossorigin`，Source Map 只上传到监控平台

## 延伸阅读

- [异步流程与 Promise](/web/JavaScript/async)：错误在 Promise 链中如何传递
- [错误处理与请求追踪](/backend/error-handling)：服务端如何返回可排查的错误
- [日志、指标与可观测性](/engineering/observability)：错误上报之后怎么分析
