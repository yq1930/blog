---
title: Vue 2 多端项目怎么管：请求、路由与 UI 库的实用拆分
description: 一个 PC 后台加两个移动 H5，三代请求写法并存、几千行的路由文件、三套 UI 库混用。用“老房子换水管”的思路讲清请求层、兼容层和业务 API 层怎样分工，路由怎样按业务拆分，UI 库怎样划边界，并避开拦截器重复弹框、POST 编码混乱、兼容层变成永久标准等问题。
---

# Vue 2 多端项目怎么管：请求、路由与 UI 库的实用拆分

不少团队还在维护 Vue 2：一个 PC 后台、一个普通 H5、一个微信内的 H5，三套工程都能运行，也都积累了多年的业务代码。

这类项目最现实的问题不是“要不要立刻升级 Vue 3”，而是：

- 新接口应该写在哪一层？
- 几千行的路由文件，新页面怎么继续加？
- Element UI、Vant、cube-ui 同时存在，到底该用哪个？
- 旧页面不能停止更新，新的写法又怎样逐步落地？

本文给出一套可以**一边开发、一边治理**的做法。

::: info 关于示例
本文来自本地私有项目的只读归纳。下文代码已简化脱敏，页面、路由、接口、域名、凭据、用户数据、品牌名称和内部常量均已替换，不能直接对应原项目。
:::

::: tip 读完这篇你会
- 判断一段请求代码属于传输层、兼容层还是业务 API 层
- 新增页面时，不再把所有路由塞进一个 `router/index.js`
- 给 PC 和 H5 规定清楚各自的主 UI 库
- 不推倒旧代码，也能把新功能逐步迁移到统一的写法
:::

## 1. 原理：老房子换水管，先装转接头

一栋住了三代人的老房子，每次装修都留下了不同的水管：最早的铁管、中间的铝塑管、最近的 PPR 管。要全部换掉，就得把墙全砸开，风险很大。

更稳妥的做法是：**新装的水龙头一律接到新的总水管上；旧的水管暂时保留，但在入户处装一个转接头，接到同一个总水管**。之后每次局部装修，顺手把一段旧管换掉。

这个项目里的三套前端，正是这样的“老房子”：

| 工程 | 主要场景 | 现有技术特点 | 最容易出现的问题 |
| --- | --- | --- | --- |
| PC 后台 | 表格、弹窗、批量操作 | Vue 2、Element UI、高级表格组件 | 入口注册过多，请求写法多代并存 |
| 移动 H5 A | 微信或企业容器内的页面 | Vue 2、cube-ui、Vant，少量 PC 组件 | 路由文件很长，宿主逻辑和页面逻辑混在一起 |
| 移动 H5 B | 面向用户的移动页面 | Vue 2、Vant、cube-ui | 页面多，缓存和登录回跳的规则不一致 |

长期项目往往经历过好几次技术选择：早期页面直接使用 `XMLHttpRequest` 再挂到 `Vue.prototype`；中期引入 Axios 在拦截器里处理会话和错误；后期才开始出现按业务拆分的 `src/api/**` 模块。路由有的已经按模块拆开，有的还在一个大文件里；UI 库因为历史页面、PC 和移动端混用而逐渐叠加。

**关键不是批评旧写法，而是给新代码确定唯一的方向。**

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

两个原则：新页面不直接调用 Axios，也不自己拼接会话参数；旧页面暂时保留调用方式，但底层逐步接到同一个客户端。

## 2. 三类请求代码，各管一件事

### 第一类：统一请求客户端（总水管）

这一层只关心基础地址、超时、会话、数据编码、响应判断和错误分类，**不应该知道“保存记录”“提交审批”这类业务名称**。

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

`readSessionId` 用 `try/catch` 包住存储访问，是因为某些 WebView 或隐私模式下，访问 `sessionStorage` 本身就会抛异常。

响应拦截器只做两件事：拆出统一的数据，把各种失败整理成同一种错误：

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

### 第二类：旧页面兼容适配器（转接头）

老项目里常见这样的调用：

```js
this.$legacyApi(path, method, data, success, fail);
```

一次改完几百个页面风险太高。更稳妥的方式是**保留调用签名**，让适配器内部转调统一的客户端：

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

这里保留了旧式的回调语义：失败交给 `onFail` 后，让 Promise 正常结束，避免旧页面忽略返回值时出现“未处理的拒绝”。**新代码不要使用这个适配器**，应直接调用统一的 `request` 并显式处理失败。

### 第三类：业务 API 模块（让页面说人话）

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

以后接口的路径或编码变了，只改 API 模块或请求客户端，页面不用跟着改。

## 3. 坑一：拦截器里既跳登录又弹错误提示

**现象**：登录过期时，页面同时发出的十个请求全部失败，用户看到十个“登录已过期”的提示，页面还被反复跳转了好几次。

**原因**：每个请求失败时，拦截器都单独弹框、单独跳转登录。

**修复**：请求层**只负责分类**（`kind` 标记为 `session`、`business`、`http`、`network`）；会话协调器负责**只处理一次**失效；具体的业务提示由页面决定。

## 4. 坑二：把所有 POST 请求都转成了表单

**现象**：某个接口需要 JSON，请求层却把所有 POST 都按表单编码发送，后端收不到嵌套的数据；或者为了区分，发明了 `legacyJsonPost` 这样的“伪 HTTP 方法”，越积越多。

**修复**：用显式的 `payloadType: 'json' | 'form'` 声明编码方式，而不是长期靠奇怪的方法名来区分。表单编码只接受简单的值，遇到对象直接报错（见第一类代码中的 `encodeScalarForm`），避免把对象悄悄编码成 `[object Object]`。

## 5. 坑三：兼容层变成了永久的新标准

**现象**：两年后，新写的页面还在调用 `$legacyApi`，迁移永远结束不了。

**修复**：在代码评审中明确规则——**兼容层只允许旧文件继续使用**。每迁移完一批页面，就删除对应的旧分支；可以定期统计 `$legacyApi` 的调用数量，看着它逐渐减少到零。

## 6. 路由拆分：按业务域，不按开发人员

推荐的目录：

```text
src/router/
├── index.js
├── common.js
└── modules/
    ├── account.js
    ├── records.js
    └── reports.js
```

`common.js` 只放登录、404、首页等稳定的页面；业务模块自己维护自己的页面：

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

`meta` 字段要少而固定：

| 字段 | 含义 | 不要拿它做什么 |
| --- | --- | --- |
| `title` | 页面标题 | 权限判断 |
| `auth` | 是否要求登录 | 判断具体按钮的权限 |
| `permission` | 稳定的权限码 | 保存角色的中文名 |
| `cache` | 是否进入 `keep-alive` | 代替页面的刷新规则 |
| `depth` | H5 前进后退动画的层级 | 判断是否可以访问 |

如果 PC 的路由由服务端菜单决定，服务端只返回稳定的 `routeKey`，前端用**白名单注册表**映射到组件，**绝不能直接把服务端返回的字符串拼成 `import` 的路径**。

### 坑四：拆路由时顺手改了路由的 `name`

**现象**：路由拆分上线后，部分页面的缓存失效了，面包屑显示错误，有的跳转直接报错。

**原因**：Vue 2 的 `keep-alive`、面包屑、权限和 `router.push({ name })` 跳转都可能依赖路由名。

**修复**：**第一次拆分只搬文件**，路径、名称、`meta`、懒加载方式、菜单和权限关系全部保持不变，不顺便修改业务行为。

## 7. 多个 UI 库怎么划边界

多个库共存，不等于每个页面都可以随意混用。先写一张团队规则表：

| 场景 | 主库 | 允许的补充 | 原因 |
| --- | --- | --- | --- |
| PC 后台 | Element UI | 高级表格、富文本、图表 | 键盘鼠标操作，信息密度高 |
| 移动 H5 | Vant 或 cube-ui，二选一 | 存量的特殊滚动、选择器 | 触摸、底部弹层和移动表单 |
| 反馈能力 | 自己写的薄适配器 | 底层调用本端的主库 | 页面不关心 Toast 来自哪个库 |

可以为 Toast、Confirm、Loading 做一层薄适配，让页面只依赖统一的函数，底层再调用本端的主库。边界规则：

- PC 页面不使用移动端的表单和弹层；
- H5 页面不使用 PC 的栅格和大尺寸对话框；
- 一个新页面只选一个主组件库；
- 图表、视频、富文本等重组件按页面懒加载；
- `main.js` 不再无条件地全局注册低频组件。

### 坑五：同一个页面混用三套弹窗

**现象**：一个页面里同时有 Element 的确认框、Vant 的弹出层和 cube-ui 的提示，样式不统一还在其次，更麻烦的是：关闭的语义不同、返回的 Promise 结果不同、遮罩层级互相覆盖。

**修复**：一个页面只保留一套主要的交互体系，通过薄适配器调用。

### 坑六：为了复用，把 PC 和 H5 做成同一个组件

**现象**：为了“少写代码”，让一个列表组件同时适配 PC 表格和手机列表，组件里充满了 `if (isMobile)`，两边都不好用。

**修复**：PC 的批量表格操作和手机的列表，不是同一种交互。**应该复用的是 API、校验和数据转换，而不是视图**。

## 8. 按步骤落地

1. **先盘点**：请求入口有哪些；哪些页面直接用了 Axios 或 XHR；哪些路由是同步导入的；`main.js` 全局注册了哪些组件；每个 UI 库实际被哪些页面使用。
2. **规定新代码的写法**，从今天起执行三条规则：新接口必须放进 `src/api/<业务域>.js`；新页面必须进入对应的路由模块；新页面只能使用所属终端的主 UI 库。**只约束新增的代码，就能立刻停止债务增长。**
3. **统一请求结果**：成功只返回业务数据，失败一律 `reject` 一个 `Error`；不要混用 `response`、`response.data` 和 `resolve({ success: false })`。
4. **接入兼容适配器**：保留 `$legacyApi` 的参数形式，把内部实现换成统一的客户端；先选两个低风险的页面验证，再按业务域逐个迁移。
5. **拆分路由和入口**：一次只移动一个业务域，保持对外的标识不变。
6. **收紧 UI 边界**：先禁止新的混用，再处理存量的页面；删除一个全局组件前，先用 `rg` 全局搜索，确认没有隐式的使用。

## 排查思路

- **请求问题**：在 Network 面板看请求头里的 `Content-Type` 和请求体的编码是否正确；在拦截器里打断点，看错误被分到了哪一类。
- **重复提示、重复跳转**：在弹框和跳转的函数里打断点，看调用栈是从哪几个请求来的。
- **拆分路由后页面异常**：对比拆分前后的 `router.getRoutes()`（Vue Router 3 中可以检查 `router.options.routes`），确认路径、名称、`meta` 都没有变化。
- **UI 库体积问题**：用打包分析工具看每个 UI 库的体积和被哪些页面引用。

## 检查清单

**请求层**

- [ ] GET 参数没有重复编码
- [ ] 表单和 JSON 请求的 `Content-Type` 正确
- [ ] 超时被识别为网络类错误
- [ ] 业务失败返回 `Error`，不会误进成功分支
- [ ] 会话失效时，多个并发请求只触发一次处理
- [ ] 兼容适配器的成功、失败回调都只执行一次

**路由**

- [ ] 刷新深层地址，仍能打开正确的页面
- [ ] 未登录访问受保护的页面，会保存安全的回跳目标
- [ ] 懒加载失败时有提示或重试入口
- [ ] `keep-alive` 页面返回后的状态符合预期
- [ ] 未知的服务端 `routeKey` 不会加载任意组件
- [ ] 404 路由仍然放在动态路由的最后

**UI 与构建**

- [ ] 新页面只使用本端的主 UI 库，低频重组件没有全局注册
- [ ] PC 页面在常用桌面宽度下可以操作
- [ ] H5 页面在 375px 宽度和真机 WebView 中可以操作
- [ ] 三个工程分别完成一次生产构建
- [ ] 构建产物里没有真实的域名、密钥或调试凭据

最后记住：**请求层统一协议，API 模块表达业务；路由按业务域拆分；每个终端、每个新页面都选定一个主 UI 库。** 即使暂时不升级 Vue 3，项目也会越来越好维护，而不是随着每次需求变得更复杂。

## 延伸阅读

- [旧系统渐进改造](/practice/legacy-modernization-roadmap)：整体的改造路线
- [跨端 API 契约](/practice/cross-client-api-contract)：统一的响应结构
- [移动 H5 会话与恢复](/practice/mobile-h5-reliability)：H5 里的登录和页面恢复
