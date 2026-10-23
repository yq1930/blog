---
title: Axios 请求层
description: 把请求配置、登录态和错误处理收进一个请求层。重点解决业务错误藏在 200 里、错误提示弹三次、token 过期时并发请求同时刷新、默认没有超时、取消请求被当成错误等真实问题。
---

# Axios 请求层

项目刚开始时，在组件里直接 `axios.get(...)` 很方便。页面多了以后，问题就来了：

- 接口返回 HTTP 200，但实际是“余额不足”，页面却显示“操作成功”；
- 一个请求失败，同一句错误提示弹了三次；
- 登录过期的瞬间，页面上五个请求同时去刷新 token，用户被直接踢回登录页；
- 网络很差时，页面一直转圈，永远不会超时。

这些问题的解法都一样：**把与网络相关的通用规则收进一个请求层，组件只关心业务**。

::: tip 读完这篇你会
- 搭建“组件 → 业务接口 → 请求客户端”三层结构
- 用拦截器统一处理登录态、业务错误和错误提示
- 实现“并发请求只刷新一次 token”的单飞（single-flight）逻辑
:::

## 1. 原理：拦截器是请求的“前台”

所有请求进出都要经过前台：出去的请求，前台给它贴上身份标签（token）、编号；回来的响应，前台先拆包、检查有没有问题，再交给具体的人。

```text
组件：  “加载用户资料”
   ↓ 调用
业务接口 api/user.js：  getUser(id)
   ↓ 调用
请求客户端 api/http.js：  请求拦截器（加 token）→ 发送 → 响应拦截器（拆包、统一错误）
   ↓
服务端
```

组件不需要知道接口地址、超时时间、请求头、状态码；业务接口只描述“有哪些资源和操作”；网络规则集中在请求客户端里。将来换登录方式、换错误格式，只需要改一个文件。

## 2. 创建唯一的请求客户端

```js
// src/api/http.js
import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // 由部署环境注入，不写死在代码里
  timeout: 15_000 // Axios 默认是 0，也就是永不超时
})

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

```js
// src/api/user.js —— 业务接口只表达“做什么”
import { http } from './http'

export const getUser = (id) => http.get(`/users/${encodeURIComponent(id)}`)
export const updateUser = (id, payload) => http.patch(`/users/${encodeURIComponent(id)}`, payload)
```

组件里只处理自己的状态：

```js
async function loadProfile() {
  loading.value = true
  try {
    profile.value = await getUser(route.params.id)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
```

## 3. 坑一：接口返回 200，页面却显示成功

**现象**：用户余额不足，点击支付后页面提示“支付成功”，实际上什么都没发生。

**原因**：后端约定所有响应都返回 HTTP 200，用响应体里的 `code` 表示业务结果：

```json
{ "code": 40021, "message": "余额不足", "data": null }
```

Axios 只根据 HTTP 状态码判断成功与否，200 就走成功分支。组件拿到这个对象，以为请求成功了。

**修复**：在响应拦截器里检查业务码，不成功就转成错误抛出：

```js
http.interceptors.response.use((response) => {
  const { code, message, data } = response.data
  if (code !== 0) {
    // 带上 config，后面的拦截器才知道这个请求的配置（比如是否静默）
    return Promise.reject(
      new ApiError(message, { code, status: response.status, config: response.config })
    )
  }
  return data // 组件直接拿到 data，不用再写 res.data.data
})
```

```js
class ApiError extends Error {
  constructor(message, { code, status, fields, config } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code     // 业务码
    this.status = status // HTTP 状态码
    this.fields = fields // 表单字段级错误
    this.config = config // 发起请求时的配置
  }
}
```

**怎么避免再犯**：和后端约定统一的响应格式，并且只在请求层判断一次“成功”的标准。

## 4. 坑二：同一个错误提示弹了三次

**现象**：保存失败时，屏幕上叠了三个一模一样的“网络异常”提示。

**原因**：响应拦截器弹了一次；组件的 `catch` 里又弹了一次；全局的错误处理再弹一次。每一层都觉得“错误应该让用户知道”。

**修复**：约定**只在一个地方**提示。常见做法是：拦截器负责默认提示，个别需要自己处理的请求通过配置项关闭它：

```js
// 最后注册的响应拦截器：统一整理错误并提示
http.interceptors.response.use(undefined, (error) => {
  if (axios.isCancel(error)) return Promise.reject(error) // 主动取消不提示，见坑四
  const appError = error instanceof ApiError ? error : normalizeError(error)
  if (!appError.config?.silent) toast.error(appError.message)
  return Promise.reject(appError) // 仍然抛出，让调用方决定后续流程
})

// 需要自定义处理的请求
await http.post('/coupons/check', payload, { silent: true })
```

组件的 `catch` 里只处理流程（比如停止加载、恢复按钮），不再重复弹提示。

## 5. 坑三：token 过期时，五个请求同时去刷新

**现象**：用户停留一段时间后再操作，页面同时发出了五个请求。它们都收到 401，于是都去调用“刷新 token”接口。如果后端的刷新 token 是一次性的，第一次刷新成功后旧的刷新 token 就作废了，后面四次全部失败，用户被踢回登录页。

**原因**：每个请求各自处理 401，彼此不知道别人已经在刷新了。

**修复**：让刷新动作**同一时间只执行一次**，其他请求等待同一个结果，这叫单飞（single-flight）：

```js
let refreshing = null // 正在进行的刷新任务

function refreshTokenOnce() {
  if (!refreshing) {
    refreshing = api
      .refreshToken()
      .then(({ accessToken }) => setAccessToken(accessToken))
      .finally(() => {
        refreshing = null // 无论成功失败，结束后允许下一次刷新
      })
  }
  return refreshing // 所有调用者拿到的是同一个 Promise
}

http.interceptors.response.use(undefined, async (error) => {
  const { config, response } = error
  if (response?.status === 401 && !config._retried && !config.url.includes('/auth/refresh')) {
    config._retried = true // 防止重试后又 401，陷入死循环
    try {
      await refreshTokenOnce()
      return http(config) // 用新 token 重新发送原请求
    } catch {
      redirectToLogin()
    }
  }
  return Promise.reject(error)
})
```

三个关键点：共享同一个刷新 Promise；每个请求只重试一次；刷新接口本身的 401 不再触发刷新。

注意拦截器的**注册顺序**。响应拦截器按注册顺序依次执行，上面几段代码要按“业务码检查 → 刷新 token → 统一提示”的顺序注册：刷新 token 的拦截器需要拿到 Axios 的原始错误（带 `config` 和 `response`），而统一提示必须放在最后，否则 401 还没来得及刷新，用户就先看到了一个错误提示。

## 6. 坑四：取消请求也弹出了“请求失败”

**现象**：用户快速切换标签页，屏幕上不断弹出“请求失败”。

**原因**：切换时取消了上一个页面的请求，取消也会让 Promise 进入失败分支，被当作普通错误提示了。

**修复**：Axios 支持 `AbortController`，取消时识别出来，安静地结束：

```js
const controller = new AbortController()
http.get('/reports', { signal: controller.signal })
controller.abort()

// 拦截器或 catch 里
if (axios.isCancel(error)) return // 主动取消，不提示
```

## 7. 坑五：失败自动重试，结果重复扣款

**现象**：为了提高成功率，给所有请求加了“失败自动重试 3 次”。结果网络超时后，用户被扣了两次钱。

**原因**：超时不代表服务器没处理。请求可能已经成功执行，只是响应在回来的路上丢了。对“创建订单”“支付”这类操作，重试就意味着重复执行。

**修复**：只对**重复执行没有副作用**的请求自动重试（如 GET 查询）；写操作要重试，必须配合后端的幂等机制（同一个请求 ID 只处理一次），详见 [事务、幂等与补偿](/practice/transactional-business-workflow)。

## 8. 不同错误，给用户不同的出路

| 情况 | 页面应该怎么做 |
| --- | --- |
| 网络断开、超时、5xx | 提示可以重试，保留用户已填写的内容 |
| 401 未登录或登录过期 | 统一刷新登录态，失败则跳转登录页 |
| 403 无权限 | 明确说明没有权限，而不是“请求失败” |
| 404 资源不存在 | 显示“内容不存在或已删除” |
| 422 / 业务校验失败 | 把错误显示到对应的表单字段上 |

```js
function normalizeError(error) {
  const status = error.response?.status
  const body = error.response?.data
  return new ApiError(body?.message || '网络连接异常，请稍后重试', {
    status,
    code: body?.code,
    fields: body?.fields,
    config: error.config
  })
}
```

## 排查思路

1. **先看 Network 面板**：请求有没有发出、发了几次、带没带 token、响应体里的 `code` 是什么。
2. **重复提示**：在提示函数里打断点，看 Call Stack 是从哪几层调用的。
3. **刷新 token 的问题**：在 Network 面板筛选刷新接口，看一次 401 之后它被调用了几次。
4. **拦截器的执行顺序**：Axios 的**请求拦截器后注册的先执行**，响应拦截器按注册顺序执行。多个拦截器互相影响时，先确认它们的顺序。
5. 给每个请求加一个请求 ID（放在请求头里），前后端日志能按它对上号。

## 检查清单

- [ ] 全项目只有一个请求客户端，设置了超时
- [ ] 业务错误（200 + 错误码）在拦截器里转成异常
- [ ] 错误提示只在一个地方弹出，可按请求关闭
- [ ] 并发 401 只刷新一次 token，每个请求最多重试一次
- [ ] 主动取消的请求不提示错误
- [ ] 只对查询类请求自动重试，写操作依赖后端幂等
- [ ] 接口地址、token、测试账号不写进代码仓库

## 延伸阅读

- [异步流程与 Promise](/web/JavaScript/async)：竞态、取消和防重复提交
- [认证、授权与会话](/backend/authentication)：access token 和 refresh token
- [PC、H5 与小程序 API](/practice/cross-client-api-contract)：多端共用一套接口约定
