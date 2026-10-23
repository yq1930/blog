---
title: 跨端 API 契约：PC、H5 和小程序怎样统一
description: 同一个接口被 PC、H5、小程序调用，各端却用不同方式判断成功失败。用一套统一的响应结构、错误码、登录恢复和幂等约定，修复匹配中文文案判断逻辑、401 时连续弹窗跳转、按钮置灰挡不住重复提交、改字段时旧客户端崩溃等真实问题。
---

# 跨端 API 契约：PC、H5 和小程序怎样统一

同一个接口被 PC、H5 和小程序调用后，最容易出现这种局面：

```text
PC 判断 success
H5 判断 code
小程序匹配中文错误文案
```

接口没有真正的“共同语言”，于是任何一处改动都要逐端排查：后端改了一个提示文案，小程序的登录跳转就失效了；登录过期时，H5 连续弹出三个登录框；网络一慢，同一笔预约被提交了两次。

本文根据三个 Vue 项目和多个小程序项目中的请求封装整理，代码已经删除真实地址、业务参数和身份信息。

::: tip 读完这篇你会
- 给不同客户端定义同一种成功和失败结构
- 让登录失效时只恢复一次，不连续弹窗或跳转
- 避免重复点击和超时重试产生两条数据
- 安全地修改字段，让新旧客户端可以同时在线
:::

## 1. 原理：底层可以不同，“说的话”必须相同

不同年代、不同运行环境，自然会形成不同的请求写法：

| 客户端 | 常见实现 |
| --- | --- |
| PC 管理端 | Axios 实例 + 独立 API 模块 |
| Vue 2 移动 H5 | 挂在 `Vue.prototype` 上的公共请求方法 |
| 另一个 H5 | 自己封装的 `XMLHttpRequest` |
| 原生小程序 | `wx.request` 外再包一层登录和错误处理 |

这就像几位同事分别用电话、邮件、即时通讯和你沟通：工具不同没关系，但大家对“办好了”“办不了”“需要你补材料”的说法必须一致，否则每个人都要靠猜。

```text
Axios ─────────┐
XMLHttpRequest ├──▶ 统一 ApiResult ──▶ 页面
wx.request ────┘
```

**底层传输可以不同，页面看到的结果必须一致。**

## 2. 先定义最简单的响应结构

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

`error` 里再放稳定的 `code`（给程序判断）、`message`（给用户看）和 `retryable`（是否允许自动重试）。

## 3. 坑一：用中文提示文案判断程序逻辑

**现象**：后端把提示从“请重新登录”改成了“登录已过期，请重新登录”，小程序的自动跳转登录页就失效了，用户卡在页面上。

```js
if (message === '请重新登录') {
  goToLogin()
}
```

**原因**：文案是给人看的，随时可能调整措辞、翻译成其他语言。用它来控制程序逻辑，改一个字就会失效。

**修复**：程序判断 HTTP 401 或稳定的错误码 `error.code`；`message` 只用于展示。

## 4. HTTP 状态码怎么用

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
| 5xx | 没能返回成功响应，写操作的结果可能未知 | 保留现场，先查询再决定是否重试 |

HTTP 状态码描述通用结果，业务错误码描述具体原因，两者并不冲突。

## 5. 把请求层写成一个稳定入口

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

实际项目还会处理历史参数和不同环境，但页面不需要知道这些细节，它只调用业务 API：

```js
export function cancelAppointment(id, operationId) {
  return service.post(`/appointments/${id}/cancel`, null, {
    headers: { 'Idempotency-Key': operationId }
  })
}
```

这里的路径和字段是教学示例，不对应真实接口。

### H5 和小程序只替换传输层

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

两者最后都返回相同的 `data`，失败时都抛出相同形状的 `ApiError`。注意 `wx.request` 的 `success` 回调只表示“收到了响应”，HTTP 状态是 401 或 500 时同样会进入 `success`，所以必须在 `parseResponse` 里统一判断。

## 6. 坑二：登录过期时连续弹窗、反复跳转

**现象**：一个页面同时发出五个请求，登录恰好过期，五个请求都收到 401，各自去跳转登录或刷新登录态，结果出现连续弹窗和回跳循环。

**原因**：每个请求独立处理 401，彼此不知道别人已经在处理了。

**修复**：使用 **single-flight**，白话就是：同一时间只让一个登录恢复任务执行，其他请求等它的结果。

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

登录恢复后，查询请求通常可以重新发送；**写请求只有带着幂等键时才能安全地重发**。前端的通用写法见 [Axios 请求层](/web/vue/axios)。

## 7. 坑三：按钮置灰了，还是提交了两次

**现象**：提交按钮在请求期间已经置灰，但后台仍然偶尔出现两条相同的预约。

**原因**：按钮置灰只能挡住**当前页面上的连续点击**，挡不住：

- 用户刷新页面后再提交；
- 弱网下超时自动重试；
- 两台设备同时操作；
- 服务端其实已经成功，但响应在回来的路上丢了，用户以为失败又点了一次。

**修复**：两层防护。客户端复用同一个进行中的 Promise，改善交互：

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

这里用 `then(成功, 失败)` 在两个分支都清除锁，是为了兼容一部分没有原生 `Promise.prototype.finally` 的旧 WebView。如果项目已经统一注入了 Promise polyfill，也可以改用 `finally`。

**服务端用幂等键和唯一约束兜底**，这才是真正可靠的一层：

```text
同一个 Idempotency-Key + 相同请求
→ 返回第一次结果

同一个 Idempotency-Key + 不同请求
→ 返回冲突，不再次执行
```

## 8. 坑四：金额、时间、状态各端理解不一致

### 金额：不要用浮点数

使用最小货币单位的整数（比如“分”），避免浮点计算误差：

```json
{ "amountMinor": 12990, "currency": "CNY" }
```

### 时间：带上时区

时间点使用带时区的 ISO 字符串：

```json
{ "createdAt": "2030-06-01T09:30:00+08:00" }
```

只有日期时使用 `YYYY-MM-DD`，不要随意补上零点。

### 状态：能处理“不认识的新状态”

服务端将来可能新增状态，客户端必须能容忍：

```js
function statusLabel(status) {
  return STATUS_LABELS[status] || '未知状态'
}
```

未知的状态不要直接当成“成功”或“处理中”，应该提示用户刷新，并记录到监控里。这些约定的原理，见 [API 契约与前后端联调](/engineering/api-contract)。

## 9. 列表接口只选一种分页方式

普通后台列表使用页码：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

持续新增的消息流使用游标：

```json
{
  "items": [],
  "nextCursor": "opaque_cursor",
  "hasMore": true
}
```

`nextCursor` 是服务端生成的不透明字符串，客户端不要解析，也不要自己拼。

## 10. 坑五：改字段时，旧客户端崩溃了

**现象**：一次发布里同时做了三件事：新增字段、把所有客户端切到新字段、删除旧字段。H5 和 PC 都正常，但小程序的新版本还在审核中，旧版本的用户全部报错。

**修复**：安全迁移分三步，**不要在一次发布里做完**：

```text
第一步：服务端同时支持旧字段和新字段
第二步：各客户端逐步切到新字段，并观察旧字段调用量
第三步：旧调用归零后，再删除旧字段
```

小程序审核或 H5 缓存一旦延迟，跨版本的中间状态就必须能正常工作。

## 11. 一份接口说明模板

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

这比只列出字段名有用得多，因为它写清了**行为**。

## 排查思路

1. **某个端判断结果不对**：对比三个端的请求层，看各自是怎么判断成功失败的，是否有端在匹配文案。
2. **登录相关的循环和连续弹窗**：在 Network 面板看一次 401 之后，登录恢复接口被调用了几次。
3. **重复数据**：查看两条重复记录的请求是否带了相同的幂等键；没有带，说明客户端没有生成或没有传递；带了却仍然重复，说明服务端的唯一约束没有生效。
4. **只有部分用户出错**：按客户端类型和版本号筛选日志，确认是不是旧版本客户端的兼容问题。

## 检查清单

- [ ] 成功和失败的响应结构在所有端一致
- [ ] 程序判断错误码和 HTTP 状态，不匹配提示文案
- [ ] 并发 401 时只恢复一次登录
- [ ] 同一个幂等键重复提交只产生一个结果，同键不同内容返回冲突
- [ ] 未知状态不会让页面白屏
- [ ] 金额没有经过浮点运算，时间带时区
- [ ] 新服务端兼容旧客户端，回滚任一端后仍能读取已有数据
- [ ] 日志不记录凭证和完整的个人信息

## 延伸阅读

- [多端系统全景图](/practice/full-stack-system-map)：一次需求会影响哪些端
- [事务、幂等与补偿](/practice/transactional-business-workflow)：服务端怎样兜底重复请求
- [移动 H5 会话与恢复](/practice/mobile-h5-reliability)：微信 H5 里的登录恢复
