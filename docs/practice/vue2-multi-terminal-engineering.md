---
title: Vue 2 多端项目怎么管：请求、路由与 UI 库的实用拆分
description: 从一个 PC 后台和两个移动 H5 的真实维护现场出发，讲清三类请求代码如何收口、路由如何按业务拆分，以及多个 UI 库怎样划清边界。
---

# Vue 2 多端项目怎么管：请求、路由与 UI 库的实用拆分

不少团队还在维护 Vue 2：一个 PC 后台、一个普通 H5、一个微信内 H5，
三套工程都能运行，也都积累了多年业务代码。

这类项目最现实的问题不是“要不要立刻升级 Vue 3”，而是：

- 新接口应该写在哪一层；
- 几千行路由文件怎么继续加页面；
- Element UI、Vant、cube-ui 同时存在时该用哪个；
- 旧页面不能停更，新写法又怎样逐步落地。

本文给出一套可以边开发边治理的做法。

> 本文来自本地私有项目的只读归纳。下文代码已简化脱敏，页面、路由、接口、
> 域名、凭据、用户数据、品牌名称和内部常量均已替换，不能直接对应原项目。

## 读完能解决什么

读完后，你可以直接完成四件事：

1. 判断一段请求代码属于传输层、兼容层还是业务 API 层；
2. 新增页面时，不再把所有路由塞进一个 `router/index.js`；
3. 给 PC 与 H5 规定清楚各自的主 UI 库；
4. 不推倒旧代码，也能把新功能逐步迁移到统一写法。

## 项目现场：不是一套前端，而是三种使用环境

我们研究的前端大致分成三类：

| 工程 | 主要场景 | 现有技术特点 | 最容易出现的问题 |
| --- | --- | --- | --- |
| PC 后台 | 表格、弹窗、批量操作 | Vue 2、Element UI、高级表格组件 | 入口注册过多、请求写法多代并存 |
| 移动 H5 A | 微信或企业容器内页面 | Vue 2、cube-ui、Vant，少量 PC 组件 | 路由文件很长、宿主与页面逻辑混在一起 |
| 移动 H5 B | 面向用户的移动页面 | Vue 2、Vant、cube-ui | 页面多、缓存与登录回跳规则不一致 |

这不是某个团队特有的问题。长期项目往往经历过几次技术选择：

- 早期页面直接使用 `XMLHttpRequest`，再挂到 `Vue.prototype`；
- 中期引入 Axios，在拦截器里处理会话和错误；
- 后期开始出现按业务拆分的 `src/api/**` 模块；
- 路由一部分已按模块拆开，一部分仍集中在单个大文件；
- UI 库因为历史页面、PC 与移动端混用而逐渐叠加。

关键不是批评旧写法，而是为新代码确定唯一方向。

## 一张小流程图：新页面只走一条主链路

```text
Vue 页面
   │ 调用 listRecords(params)
   ▼
业务 API 模块（只写业务动作与路径）
   │ 调用 request(config)
   ▼
统一请求客户端（会话、编码、超时、错误）
   │
   ▼
后端接口

旧页面 ──> 兼容适配器 ──> 同一个统一请求客户端
```

这个图表达两个原则：

- 新页面不直接调用 Axios，也不直接拼接会话参数；
- 旧页面暂时保留调用方式，但底层逐步接到同一个客户端。

## 项目中可借鉴的简化代码片段：三类请求代码

项目里出现三类请求代码很正常，但它们不能互相代替。

### 第一类：统一请求客户端

这一层只关心基础地址、超时、会话、数据编码、响应判断和错误分类，
不应该知道“保存记录”“提交审批”之类业务名称。

```js
// src/utils/request.js
// 代码已简化脱敏
import axios from "axios";

const client = axios.create({
  baseURL: process.env.API_BASE_URL,
  timeout: 15000
});

function readSessionId() {
  try {
    return sessionStorage.getItem("session_id") || "";
  } catch (error) {
    return "";
  }
}

function encodeScalarForm(data) {
  return Object.keys(data || {}).map(key => {
    const value = data[key];
    if (value !== null && typeof value === "object") {
      throw new TypeError("表单编码只接受标量，结构化数据请使用 JSON");
    }
    return encodeURIComponent(key) + "=" + encodeURIComponent(value == null ? "" : value);
  }).join("&");
}

client.interceptors.request.use(config => {
  const sessionId = readSessionId();
  if (sessionId) config.headers["X-Session-Id"] = sessionId;

  if (config.payloadType === "form") {
    config.headers["Content-Type"] = "application/x-www-form-urlencoded";
    config.data = encodeScalarForm(config.data);
  }
  return config;
});
```

响应拦截器只做两件事：拆出统一数据，并把各种失败整理成同一种错误：

```js
// 同一文件

client.interceptors.response.use(
  response => {
    const body = response.data || {};
    if (body.ok) return body.data;

    const detail = body.error || {};
    const error = new Error(detail.message || "请求失败");
    error.kind = detail.code === "SESSION_EXPIRED" ? "session" : "business";
    error.code = detail.code || "BUSINESS_ERROR";
    error.retryable = Boolean(detail.retryable);
    return Promise.reject(error);
  },
  error => {
    const response = error.response;
    const detail = response && response.data && response.data.error || {};
    error.status = response ? response.status : 0;
    error.code = detail.code || (response ? "HTTP_" + response.status : "NETWORK_ERROR");
    error.retryable = Boolean(detail.retryable);
    if (detail.message) error.message = detail.message;
    if (response && (response.status === 401 || detail.code === "SESSION_EXPIRED")) {
      error.kind = "session";
      error.code = "SESSION_EXPIRED";
    } else if (response && detail.code) {
      error.kind = "business";
    } else {
      error.kind = response ? "http" : "network";
    }
    return Promise.reject(error);
  }
);

export default client;
```

注意：拦截器负责分类，不要在这里为每个错误都弹框。
否则十个并发请求失败时，用户会收到十个提示。

### 第二类：旧页面兼容适配器

老项目常见这样的调用：

```js
this.$legacyApi(path, method, data, success, fail);
```

一次改完几百个页面风险很高。更稳妥的方式是保留调用签名，
但让适配器内部转调统一客户端：

```js
// src/plugins/legacy-api.js
// 代码已简化脱敏
import request from "@/utils/request";

export default {
  install(Vue) {
    Vue.prototype.$legacyApi = function(
      url,
      method,
      data,
      onSuccess = () => {},
      onFail = () => {}
    ) {
      const requestedMethod = method || "get";
      const normalizedMethod = requestedMethod === "legacyJsonPost" ? "post" : requestedMethod.toLowerCase();
      const options = {
        url,
        method: normalizedMethod,
        payloadType: requestedMethod === "legacyJsonPost" ? "json" : "form"
      };
      if (["get", "head", "delete"].indexOf(normalizedMethod) >= 0) {
        options.params = data;
      } else {
        options.data = data;
      }
      return request(options).then(
        value => {
          onSuccess(value);
          return value;
        },
        error => {
          onFail(error);
          return undefined;
        }
      );
    };
  }
};
```

兼容层只有一个目的：给迁移留时间。

这里保留旧式回调语义：失败交给 `onFail` 后收敛 Promise，避免旧页面忽略返回值时出现未处理拒绝。新代码不要使用这个适配器，应直接调用统一 `request` 并显式处理 rejected Promise。

新增页面不要再调用它；每迁移完一批页面，就删除对应旧分支。

### 第三类：业务 API 模块

业务 API 模块让页面说人话。

```js
// src/api/record.js
// 代码已简化脱敏
import request from "@/utils/request";

export function listRecords(params) {
  return request({
    url: "/records",
    method: "get",
    params
  });
}

export function saveRecord(input) {
  return request({
    url: "/records/save",
    method: "post",
    data: input,
    payloadType: "json"
  });
}
```

页面只处理展示状态：

```js
// 代码已简化脱敏
import { listRecords } from "@/api/record";

export default {
  data: () => ({ rows: [], loading: false, error: "" }),
  async created() {
    this.loading = true;
    try {
      this.rows = await listRecords({ page: 1 });
    } catch (error) {
      this.error = error.message;
    } finally {
      this.loading = false;
    }
  }
};
```

以后接口路径或编码变化，只改 API 模块或请求客户端，页面不用跟着改。

## 路由拆分：按业务域，不按开发人员

PC 项目已经能看到按业务模块拆路由的好处；
H5 项目则暴露出单文件持续增长的问题。

推荐目录：

```text
src/router/
├── index.js
├── common.js
└── modules/
    ├── account.js
    ├── records.js
    └── reports.js
```

`common.js` 只放登录、404、首页等稳定页面；业务模块自己维护页面：

```js
// src/router/modules/records.js
// 代码已简化脱敏
export default [
  {
    path: "/records",
    name: "record-list",
    component: () => import("@/pages/records/list.vue"),
    meta: { auth: true, title: "记录", cache: true }
  },
  {
    path: "/records/:id",
    name: "record-detail",
    component: () => import("@/pages/records/detail.vue"),
    meta: { auth: true, title: "记录详情", cache: false }
  }
];
```

入口只负责合并：

```js
// src/router/index.js
// 代码已简化脱敏
import Vue from "vue";
import Router from "vue-router";
import common from "./common";
import account from "./modules/account";
import records from "./modules/records";
import reports from "./modules/reports";

Vue.use(Router);

export default new Router({
  routes: [...common, ...account, ...records, ...reports],
  scrollBehavior: () => ({ x: 0, y: 0 })
});
```

`meta` 字段也要少而固定：

| 字段 | 含义 | 不要拿它做什么 |
| --- | --- | --- |
| `title` | 页面标题 | 权限判断 |
| `auth` | 是否要求登录 | 判断具体按钮权限 |
| `permission` | 稳定权限码 | 保存角色中文名 |
| `cache` | 是否进入 `keep-alive` | 代替页面刷新规则 |
| `depth` | H5 前进后退动画层级 | 判断是否可访问 |

如果 PC 路由由服务端菜单决定，服务端只返回稳定的 `routeKey`，
前端用白名单注册表映射组件，不能直接把服务端字符串拼成 `import` 路径。

## 多 UI 库怎么划边界

多库共存不等于每个页面都可以随意混用。

建议先写一张团队规则表：

| 场景 | 主库 | 允许的补充 | 原因 |
| --- | --- | --- | --- |
| PC 后台 | Element UI | 高级表格、富文本、图表 | 键鼠操作与高信息密度 |
| 移动 H5 | Vant 或 cube-ui 二选一 | 存量特殊滚动、选择器 | 触摸、底部弹层与移动表单 |
| 反馈能力 | 自有薄适配器 | 底层调用本端主库 | 页面不关心 Toast 来自哪里 |

可以为 Toast、Confirm、Loading 做薄适配，让页面只依赖统一函数，
底层再调用本端主库。边界规则很简单：

- PC 页面不使用移动端表单与弹层；
- H5 页面不使用 PC 栅格和大尺寸对话框；
- 一个新页面只选一个主组件库；
- 图表、视频、富文本等重组件按页面懒加载；
- `main.js` 不再无条件注册低频组件。

## 按步骤落地

1. **先盘点。** 列出以下清单：

- 请求入口有哪些；
- 哪些页面直接使用 Axios 或 XHR；
- 哪些路由是同步导入；
- `main.js` 全局注册了哪些组件；
- 每个 UI 库实际被哪些页面使用。

2. **规定新代码写法。** 从今天起执行三条规则：

1. 新接口必须放进 `src/api/<domain>.js`；
2. 新页面必须进入对应路由模块；
3. 新页面只能使用所属终端的主 UI 库。

只约束新增代码，就能立刻停止债务增长。

3. **统一请求结果。** 成功只返回业务数据，失败都 `reject Error`；
不要混用 `response`、`response.data` 和 `resolve({ success: false })`。

4. **接入旧适配器。** 保留 `$legacyApi` 的参数形式，把内部实现换成
统一客户端；先选两个低风险页面验证，再逐域迁移。

5. **拆路由与入口。** 一次只移动一个业务域，保持路径、名称、`meta`、
懒加载、菜单与权限关系不变，不顺便修改业务行为。

6. **收紧 UI 边界。** 先禁止新混用，再处理存量页面；删除一个全局组件前，
先用 `rg` 确认没有隐式使用。

## 常见坑

### 坑一：拦截器里既跳登录又弹业务错误

并发失败会造成重复跳转和重复弹框。
请求层只分类，会话协调器只处理一次失效，页面决定业务提示。

### 坑二：把所有 POST 都转成表单

有的接口需要 JSON，有的需要表单。
用显式 `payloadType`，不要通过奇怪的伪 HTTP 方法长期区分。

### 坑三：兼容层变成永久新标准

如果新页面还在调用 `$legacyApi`，迁移不会结束。
在代码评审中明确：兼容层只允许旧文件继续使用。

### 坑四：拆路由时改了 `name`

Vue 2 的 `keep-alive`、面包屑、权限和跳转都可能依赖路由名。
第一次拆分只搬文件，不改对外标识。

### 坑五：同一页面混用三套弹窗

样式只是表面问题，更麻烦的是关闭语义、Promise 结果和遮罩层级不同。
一个页面只保留一套主要交互体系。

### 坑六：为了复用，把 PC 与 H5 做成同一个组件

表格批量操作和手机列表不是同一种交互。
应该复用 API、校验和数据转换，而不是强行复用视图。

## 测试与清单

### 请求层测试

- [ ] GET 参数没有重复编码；
- [ ] 表单与 JSON 请求的 `Content-Type` 正确；
- [ ] 超时被识别为网络类错误；
- [ ] 业务失败返回 `Error`，不会误进成功分支；
- [ ] 会话失效的多个并发请求只触发一次处理；
- [ ] 兼容适配器成功、失败回调都只执行一次。

### 路由测试

- [ ] 刷新深层地址仍能打开正确页面；
- [ ] 未登录访问受保护页会保存安全的回跳目标；
- [ ] 懒加载失败有提示或重试入口；
- [ ] `keep-alive` 页面返回后状态符合预期；
- [ ] 未知服务端 `routeKey` 不会加载任意组件；
- [ ] 404 路由仍放在动态路由最后。

### UI 与构建检查

- [ ] 新页面只使用本端主 UI 库；
- [ ] 低频重组件没有全局注册；
- [ ] PC 页面在常用桌面宽度可操作；
- [ ] H5 页面在 375px 宽度和真机 WebView 可操作；
- [ ] 三个工程分别完成一次生产构建；
- [ ] 构建产物没有写入真实域名、密钥或调试凭据。

最后记住：请求层统一协议，API 模块表达业务；路由按业务域拆分；每个终端和新页面都选定主 UI 库。即使暂时不升级 Vue 3，项目也会
越来越容易维护，而不是随着每次需求继续变复杂。
