---
title: Axios 请求层
description: 将请求配置、错误处理与业务接口分层，避免页面组件变成难以维护的网络脚本。
---

# Axios 请求层

组件的职责是展示状态和响应用户操作；请求层的职责是发送网络请求、统一处理协议细节。把两者分开，接口变动、鉴权策略和错误展示才不会散落在每个页面里。

## 推荐的三层结构

```text
页面 / 组件
    ↓ 调用业务方法
api/modules/user.js
    ↓ 调用统一客户端
api/http.js
    ↓ Axios / fetch
服务端接口
```

页面只知道“加载用户资料”，不需要知道 base URL、超时、请求头或状态码。业务模块只描述资源接口；底层客户端统一管理网络规则。

## 创建唯一的 HTTP 客户端

下面示例以 Vite 环境变量为例。地址、令牌和其他凭据都应由部署环境注入，不能写进源码。

```js
// src/api/http.js
import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json'
  }
})

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(normalizeHttpError(error))
)
```

请求拦截器适合补充鉴权、请求标识等横切信息；响应拦截器适合把不同接口的错误转换成同一种应用错误。两者都不应该默默吞掉失败。

## 业务模块只暴露业务意图

```js
// src/api/modules/user.js
import { http } from '../http'

export function getUser(userId) {
  return http.get(`/users/${encodeURIComponent(userId)}`)
}

export function updateUser(userId, payload) {
  return http.patch(`/users/${encodeURIComponent(userId)}`, payload)
}
```

组件使用时只处理自身状态：

```js
async function loadProfile() {
  loading.value = true
  error.value = null

  try {
    profile.value = await getUser(route.params.id)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}
```

## 统一错误，但保留可操作的信息

错误归一化的目标不是把所有失败都变成“请求错误”，而是让调用方能采取下一步动作。

```js
function normalizeHttpError(error) {
  const status = error.response?.status
  const message = error.response?.data?.message || '网络连接异常，请稍后重试'

  return {
    status,
    message,
    fields: error.response?.data?.fields || {},
    retryable: !status || status >= 500
  }
}
```

| 场景 | 页面应呈现什么 |
| --- | --- |
| 加载中 | 明确的骨架或加载状态 |
| 网络中断 / 5xx | 可重试提示，不丢失用户已填写内容 |
| `401` | 统一刷新登录态或引导登录 |
| `403` | 明确说明没有权限 |
| `422` | 定位到对应字段并给出修正提示 |

## 避免这几种做法

- 在每个组件里重复配置 `baseURL`、超时和 token。
- 用响应拦截器直接弹窗，导致同一错误在多个层级重复提示。
- 把所有异常都重试；写操作应先确认幂等性，避免重复扣费或重复创建。
- 将 access token、接口地址或测试账号写入仓库。

请求层的价值是把变化集中到少数文件。页面越多，这层边界带来的维护收益越明显。
