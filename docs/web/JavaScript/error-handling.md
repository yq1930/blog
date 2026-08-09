---
title: 错误处理与异常
description: 区分程序错误和操作错误，在合适的层级捕获和上报，而不是到处 try/catch。
---

# 错误处理与异常

错误处理的难点不在语法，而在"什么时候该 throw、什么时候该 catch、什么时候让它继续冒泡"。到处写 try/catch 是新手最常见的反应，结果是错误被悄悄吃掉，bug 反而更难查。

## 先分清两类错误

| 类型 | 含义 | 处理方式 |
| --- | --- | --- |
| 程序错误（Programmer Error） | 代码写错了：传了 null 给必填参数、调用了不存在的 API | 不应捕获，让它快速失败暴露问题 |
| 操作错误（Operational Error） | 运行时可能发生的事：网络断开、文件不存在、超时 | 预期处理：重试、降级、提示用户 |

把这两类混为一谈是大多数错误处理灾难的根源。程序错误不该被 catch 后默默吞掉——你希望它早点炸出来，好在开发阶段就发现。

## Error 类型与 throw 的代价

JavaScript 内置了 `Error`、`TypeError`、`RangeError`、`SyntaxError` 等。自定义错误时继承 `Error` 并附上业务字段，方便上层按类型分流：

```js
class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

class NetworkError extends Error {
  constructor(status) {
    super(`request failed: ${status}`)
    this.name = 'NetworkError'
    this.status = status
  }
}
```

> `throw` 会打断当前执行并展开调用栈，性能开销不小。不要用它做常规的流程控制（"找不到就用 throw 跳出去"），那会让代码难以理解和调试。

## try/catch 的范围要小

`try` 块包得越大，越容易误抓本不该处理的异常。理想做法是只包住"可能失败的那一行"，并在 catch 里判断是不是预期错误：

```js
// 反例：包了一大坨，连打日志的错都被吃掉
try {
  const data = await load()
  render(data)
  trackEvent('loaded')
} catch (e) {}

// 正例：只包真正可能失败的步骤
let data
try {
  data = await load()
} catch (e) {
  showError('加载失败，请重试')
  return
}
render(data)
```

空 catch 是最危险的代码之一。抓了又不处理、不上报、不重新抛出，等于把 bug 埋进土里。

## 错误冒泡与"在能处理的层处理"

错误会沿调用栈向上传播，直到被某个 catch 捕获。判断原则：**谁有能力处理这个错误、谁能给出用户可感知的反馈，谁就处理；其余层只负责补充上下文后重新抛出。**

```js
async function getUser(id) {
  try {
    return await api.get(`/users/${id}`)
  } catch (e) {
    // 这里只是补充上下文，不当数据用
    throw new Error(`获取用户 ${id} 失败: ${e.message}`)
  }
}
```

不要在每一层都写 catch。中间层 catch 后又 throw 一个新 Error 是常见做法，但保留原始 stack 才好排查：

```js
catch (e) {
  const wrapped = new Error('用户加载失败')
  wrapped.cause = e // ES2022，保留原错误链
  throw wrapped
}
```

## 全局错误捕获：最后的安全网

页面总有漏网的错误。`window.onerror` 和 `unhandledrejection` 是兜底，主要用途是**上报**，而不是"修复"：

```js
window.addEventListener('error', (event) => {
  reportToServer({
    type: 'error',
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    stack: event.error?.stack
  })
})

window.addEventListener('unhandledrejection', (event) => {
  reportToServer({ type: 'unhandledrejection', reason: event.reason })
})
```

> 上报要采样、去重、限流，否则一个未捕获的 Promise 在循环里能瞬间打爆日志服务。

## 上报策略

| 维度 | 建议 |
| --- | --- |
| 采样率 | 高频错误降采样，低频错误全量 |
| 去重 | 同一 stack + message 在短时间内只报一次 |
| 上下文 | 带 URL、用户态、版本号、最近一次操作 |
| 用户反馈 | 严重错误提供"上报问题"入口 |

## 不要吞异常的几种典型反例

```js
// 反例 1：空 catch
try { doSomething() } catch (e) {}

// 反例 2：只 console 不上报
catch (e) { console.log(e) }

// 反例 3：返回假数据假装成功
catch (e) { return null } // 调用方无法区分"真没数据"还是"出错了"

// 反例 4：把程序错误当操作错误处理
function add(a, b) {
  try { return a + b } catch (e) { return 0 } // 参数错误本不该发生
}
```

记住一条原则：**让失败可见**。处理不了的错误就让它冒泡到全局兜底；能处理的就给出明确结果；介于两者之间的，至少要留下日志。

## 检查表

- 区分程序错误（让它炸）和操作错误（预期处理），别混为一谈。
- try 块尽量小，只包住真正可能失败的代码。
- 不要写空 catch；要么处理、要么上报、要么重新抛出。
- 中间层捕获后用 `cause` 保留原始错误链，别丢掉 stack。
- 全局兜底要采样去重，主要用途是上报而非"修复"。
