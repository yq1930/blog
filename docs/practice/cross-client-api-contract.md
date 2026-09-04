---
title: 跨端 API 契约：PC、H5 和小程序怎样统一
description: 用一套简单的请求、响应、错误和幂等约定，减少多客户端联调中的重复判断与意外兼容问题。
---

# 跨端 API 契约：PC、H5 和小程序怎样统一

同一个接口被 PC、H5 和小程序调用后，最容易出现这种情况：

```text
PC 判断 success
H5 判断 code
小程序匹配中文错误文案
```

接口没有真正的共同语言，任何改动都要逐端排查。

本文根据三个 Vue 项目和多个小程序项目中的请求封装整理。代码已经删除真实地址、业务参数和身份信息。

## 读完你能解决什么

- 给不同客户端定义同一种成功和失败结构；
- 让登录失效只恢复一次，不连续弹窗或跳转；
- 避免重复点击和超时重试产生两条数据；
- 安全修改字段，让新旧客户端可以同时在线。

## 项目里为什么会出现多种请求写法

不同年代和运行环境自然会形成不同实现：

| 客户端 | 常见实现 |
| --- | --- |
| PC 管理端 | Axios 实例 + 独立 API 模块 |
| Vue 2 移动 H5 | 挂在 `Vue.prototype` 上的公共请求方法 |
| 另一个 H5 | 自己封装 `XMLHttpRequest` |
| 原生小程序 | `wx.request` 外再包一层登录和错误处理 |

底层实现可以不同，但页面看到的结果应该一致。

```text
Axios ─────────┐
XMLHttpRequest ├──▶ 统一 ApiResult ──▶ 页面
wx.request ────┘
```

## 先定义最简单的响应结构

成功：

```json
{
  "ok": true,
  "data": {
    "id": "demo_001",
    "status": "confirmed"
  },
  "requestId": "req_demo_001"
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "RESOURCE_CONFLICT",
    "message": "当前内容已经发生变化",
    "retryable": false
  },
  "requestId": "req_demo_002"
}
```

顶层四个字段各有一个职责：

- `ok`：这次业务是否成功；
- `data`：成功时的业务数据；
- `error`：失败详情，成功时不需要；
- `requestId`：排查这次请求的关联标识。

`error` 内再放稳定的 `code`、给用户看的 `message`，以及是否允许自动重试的 `retryable`。程序判断 `error.code`，不要匹配提示文字。

不要这样写：

```js
if (message === '请重新登录') {
  goToLogin()
}
```

文案改一个字，逻辑就失效。应判断 HTTP 401 或稳定错误码。

## HTTP 状态怎么用

不需要记很多，先把常用的几种统一：

| 状态 | 表示什么 | 客户端通常怎么做 |
| --- | --- | --- |
| 200 / 201 | 成功 | 展示结果 |
| 400 | 输入格式有误 | 标记表单字段 |
| 401 | 没有有效登录态 | 触发一次登录恢复 |
| 403 | 已登录但没有权限 | 展示无权限提示 |
| 404 | 当前范围找不到资源 | 展示空态或返回列表 |
| 409 | 数据已被别人修改 | 刷新后让用户确认 |
| 429 | 请求过快 | 等待后再试 |
| 5xx | 未能返回成功响应，写操作结果可能未知 | 保留现场，先查询再决定是否重试 |

HTTP 状态描述通用结果，业务错误码描述具体原因，两者并不冲突。

## 把请求层写成一个稳定入口

PC 项目中的请求封装可以简化成：

```js
const service = axios.create({
  baseURL: process.env.BASE_API,
  timeout: 15000
})

service.interceptors.request.use(config => {
  config.headers['X-Request-Id'] = createRequestId()
  config.headers.Authorization = sessionStore.authorization()
  return config
})

service.interceptors.response.use(
  response => unwrap(response),
  error => Promise.reject(normalizeError(error))
)
```

实际项目还会处理历史参数和不同环境。页面不需要知道这些细节，它只调用业务 API：

```js
export function cancelAppointment(id, operationId) {
  return service.post(`/appointments/${id}/cancel`, null, {
    headers: { 'Idempotency-Key': operationId }
  })
}
```

这里的路径和字段是教学示例，不对应真实接口。

## H5 和小程序只替换传输层

H5 的底层可以是 `XMLHttpRequest`：

```js
function sendByXhr(options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(options.method, options.url)
    xhr.timeout = options.timeout || 15000
    xhr.onload = () => Promise.resolve()
      .then(() => parseResponse(xhr))
      .then(resolve, reject)
    xhr.onerror = () => reject(createNetworkError())
    xhr.ontimeout = () => reject(createTimeoutError())
    xhr.send(options.body)
  })
}
```

小程序使用 `wx.request`：

```js
function sendByMiniProgram(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: result => Promise.resolve()
        .then(() => parseResponse(result))
        .then(resolve, reject),
      fail: error => reject(normalizeError(error))
    })
  })
}
```

两者最后都返回相同的 `data`，失败时都抛出相同形状的 `ApiError`。

## 登录失效只允许恢复一次

一个页面可能同时发出五个请求。如果五个请求都收到 401，又各自跳转登录，就会出现连续弹窗和回跳循环。

解决方法叫 **single-flight**，白话就是：同一时间只让一个登录恢复任务执行，其他请求等它。

```js
let renewing = null

function renewSessionOnce() {
  if (!renewing) {
    renewing = Promise.resolve().then(
      () => sessionService.renew()
    ).then(
      value => {
        renewing = null
        return value
      },
      error => {
        renewing = null
        throw error
      }
    )
  }

  return renewing
}
```

登录恢复后，查询请求通常可以重放；写请求只有带幂等键时才能安全重放。

## 防重复提交不能只靠按钮置灰

按钮置灰只能防当前页面上的连续点击，防不住：

- 用户刷新后再提交；
- 弱网超时后自动重试；
- 两个设备同时操作；
- 服务端已成功，但响应在途中丢失。

客户端可以复用同一个进行中 Promise，改善交互：

```js
const pending = Object.create(null)

function submitOnce(key, task) {
  if (pending[key]) return pending[key]

  const clear = () => { delete pending[key] }
  const promise = Promise.resolve().then(task).then(
    value => {
      clear()
      return value
    },
    error => {
      clear()
      throw error
    }
  )
  pending[key] = promise
  return promise
}
```

示例使用 `then(success, failure)` 在两个分支都清锁，兼容一部分没有原生 `Promise.prototype.finally` 的旧 WebView。如果项目已统一注入 Promise polyfill，也可以改用 `finally`。

服务端仍要使用幂等键和唯一约束兜底：

```text
同一个 Idempotency-Key + 相同请求
→ 返回第一次结果

同一个 Idempotency-Key + 不同请求
→ 返回冲突，不再次执行
```

## 金额、时间和状态怎样传

### 金额

使用最小货币单位的整数，不直接用浮点数：

```json
{ "amountMinor": 12990, "currency": "CNY" }
```

### 时间

时间点使用带时区的 ISO 字符串：

```json
{ "createdAt": "2030-06-01T09:30:00+08:00" }
```

只有日期时使用 `YYYY-MM-DD`，不要随意补零点。

### 状态

客户端必须能处理服务端新增的状态：

```js
function statusLabel(status) {
  return STATUS_LABELS[status] || '未知状态'
}
```

未知状态不要直接当成“成功”或“处理中”，应提示刷新并记录监控。

## 列表接口只选一种分页方式

普通后台列表可使用页码：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

持续新增的消息流可使用游标：

```json
{
  "items": [],
  "nextCursor": "opaque_cursor",
  "hasMore": true
}
```

`nextCursor` 是服务端生成的不透明字符串，客户端不要解析或自己拼。

## 改字段时怎样兼容旧客户端

安全迁移分三步：

```text
第一步：服务端同时支持旧字段和新字段
第二步：各客户端逐步切到新字段，并观察旧字段调用量
第三步：旧调用归零后，再删除旧字段
```

不要在同一次发布里同时“增加新字段、切换所有客户端、删除旧字段”。小程序审核或 H5 缓存一旦延迟，就会出现中间版本不可用。

## 一份简单的接口说明模板

每个写接口至少写清：

```text
用途：取消一条预约
身份：需要登录，且只能操作当前业务范围内的数据
输入：资源标识、取消原因、幂等键
成功：返回最新状态
业务失败：状态不允许、权限不足、版本冲突
是否可重试：查询可重试；写入仅在幂等键不变时重试
兼容期：新旧字段同时支持到约定日期
```

这比只列出字段名更有用，因为它写清了行为。

## 测试清单

- [ ] 成功响应和失败响应结构一致；
- [ ] 401 并发时只恢复一次登录；
- [ ] 同一个幂等键重复提交只产生一个结果；
- [ ] 同键不同内容会返回冲突；
- [ ] 未知状态不会让页面白屏；
- [ ] 金额没有经过浮点运算；
- [ ] 新服务端兼容旧客户端；
- [ ] 回滚任一端后仍能读取已有数据；
- [ ] 日志不记录凭证和完整个人信息。

## 最后记住

API 契约的目标不是让所有客户端使用同一种技术，而是让它们对同一个结果有同一种理解。

底层可以分别使用 Axios、`XMLHttpRequest` 和 `wx.request`；成功、失败、身份、幂等和字段语义必须统一。
