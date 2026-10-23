---
title: 原生微信小程序怎么拆：App、Page、请求、登录与分包
description: 原生小程序变大后，五个请求同时过期打开多次登录、TabBar 页返回后还是旧数据、授权被拒 loading 永远不结束、主包越来越大。用“一家餐厅的分工”讲清 App、Page、Component、request、session 各管什么，并给出统一请求、单次登录、生命周期、授权和分包的具体做法。
---

# 原生微信小程序怎么拆：App、Page、请求、登录与分包

原生微信小程序刚开始很简单：`app.js` 里放公共变量，页面里直接 `wx.request`，需要登录时调用 `wx.login`。

业务变多以后，问题会一起冒出来：

- 五个请求同时过期，打开了好几次登录；
- TabBar 页面切回来，还是旧数据；
- 每个页面各写一套 `wx.request` 和错误弹窗；
- `globalData` 里既有用户资料，又有定时器、回调和提交锁；
- 所有页面都在主包里，冷启动越来越慢；
- 授权被拒绝之后，loading 永远不结束。

这篇文章不引入新框架，只用原生小程序已有的能力，逐步把结构整理清楚。

::: info 关于示例
本文来自本地多套小程序的只读归纳。下文代码已简化脱敏，页面、路由、接口、域名、凭据、用户数据、品牌名称和内部常量均已替换。
:::

::: tip 读完这篇你会
- 分清 `App`、`Page`、`Component` 各自该做什么
- 让所有页面通过同一个 `request` 发请求，并发请求只触发一次登录
- 正确处理页面恢复和用户资料、手机号、定位等授权
- 把低频业务移进分包，并避免主包反向依赖分包
:::

## 1. 原理：一家餐厅的分工

把一个小程序想成一家餐厅：

| 对象 | 餐厅里的角色 | 应该负责 | 不应该负责 |
| --- | --- | --- | --- |
| `App` | 店长 | 开店准备：设备信息、版本更新、装配公共模块 | 某个页面的请求和弹窗 |
| `Page` | 一个包间 | 路由参数、页面状态、生命周期 | 拼接域名、处理全局登录队列 |
| `Component` | 服务员 | 属性、内部交互，有事向包间报告（触发事件） | 直接修改任意页面的数据 |
| `request` | 传菜通道 | 超时、响应归一、网络错误 | 决定登录页长什么样 |
| `session` | 前台的会员登记 | 会话、登录（只登记一次） | 保存页面的筛选条件 |
| `service` | 菜单 | 用业务语言组合接口 | 操作某个 Page 实例 |

每个角色只做自己的事。服务员不会自己跑去改包间的菜单，传菜通道也不会决定客人坐哪个包间。

```text
App 启动并装配 runtime
          │
          ▼
Page / Component ──> service（业务动作）
                          │
                          ▼
                    request（网络）
                          │ 发现会话失效
                          ▼
                    session（只登录一次）
                          │
                          └──> request 最多重试一次
```

### 先分清：原生小程序还是 uni-app

研究中的小程序工作区是多个独立项目的集合。大部分项目包含 `app.js`、`app.json`、`pages/`、`utils/` 等，使用 `App()`、`Page()`、`Component()`、WXML、WXSS 和微信 API，这是**原生**小程序：

```text
app.js
app.json
app.wxss
pages/
component/ 或 components/
utils/
project.config.json
```

同一个工作区里还有一个带 `src/pages.json`、`src/manifest.json`、Vue 3、Vite 和 `@dcloudio/uni-app` 依赖的子项目，它是 **uni-app**。不能因为它也能构建微信小程序，就套用原生项目的目录和写法。

| 类型 | 页面配置 | 组件写法 | 构建入口 |
| --- | --- | --- | --- |
| 原生小程序 | `app.json` | `Component({...})` | 微信开发者工具 |
| uni-app | `pages.json` | Vue 单文件组件 | uni-app CLI / Vite |

两者只共享接口约定，不共享生命周期和构建写法。本文接下来只讲原生小程序。

现有的原生项目里能看到三种典型状态：`app.js` 已经统一计算导航栏和安全区，但 `globalData` 承担了太多职责；`utils/common.js` 已经集中处理了请求、登录和定位，但文件越来越大；有的 `app.json` 已经按业务使用多个分包，有的还保留着空的 `subPackages`。所以最合适的方向不是重写，而是**把大工具文件拆成稳定的小模块**。

## 2. App 只做“开店准备”

```js
// app.js
// 代码已简化脱敏
const runtime = require("./runtime/index");
App({
  globalData: {
    navBarHeight: 0,
    safeArea: null
  },
  onLaunch(options) {
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.globalData.safeArea = system.safeArea;
    this.globalData.navBarHeight = system.statusBarHeight + menu.height + 8;
    this.runtime = runtime.create({ wx });
    this.runtime.update.start();
    this.runtime.launch.record(options.scene);
  },
  onShow(options) {
    this.runtime.launch.resume(options.scene);
  }
});
```

`globalData` 只适合放少量、含义稳定的公共值。**Promise、回调队列、定时器和请求状态放进 `runtime`，不要塞进 `globalData`。**

### 坑一：在文件顶层调用 `getApp()`，拿到的是空的

**现象**：某个工具文件在顶层写了 `const app = getApp()`，偶尔报错 `Cannot read property 'globalData' of undefined`。

**原因**：模块被加载的时候，App 可能还没有初始化完成。

**修复**：在函数内部或生命周期里再调用 `getApp()`，用到时再取。

## 3. 统一请求：把 `wx.request` 完整地变成 Promise

### 坑二：把 `success` 当成了“业务成功”

**现象**：接口返回了 401 或 500，页面却显示成功。

**原因**：`wx.request` 的 `success` 只表示**收到了响应**，HTTP 状态码是 401、500 时同样会进入 `success`。`complete` 则无论成功失败都会执行，适合用来结束底层的 loading 或做统计。

**修复**：在统一的处理函数里检查状态码和业务结果：

```js
// runtime/request.js
// 代码已简化脱敏
function handleResponse(result, options, retryCount, session, snapshot, send) {
  const body = result.data || {};
  const detail = body.error || {};
  const httpOk = result.statusCode >= 200 && result.statusCode < 300;
  if (httpOk && body.ok) return body.data;

  const method = (options.method || "GET").toUpperCase();
  const canReplay = method === "GET" || method === "HEAD" || options.idempotencyKey;
  const expired = result.statusCode === 401 || detail.code === "SESSION_EXPIRED";
  if (expired && retryCount === 0) {
    return session.ensure(snapshot).then(() => {
      if (canReplay) return send(options, 1);
      const error = new Error("登录已恢复，请重新提交");
      error.code = "RETRY_REQUIRED";
      error.kind = "session";
      error.retryable = false;
      throw error;
    });
  }

  const error = new Error(detail.message || "请求失败");
  error.code = expired
    ? "SESSION_EXPIRED"
    : detail.code || (httpOk ? "BUSINESS_ERROR" : "HTTP_" + result.statusCode);
  error.status = result.statusCode;
  error.retryable = Boolean(detail.retryable);
  error.kind = expired ? "session" : (httpOk ? "business" : "http");
  throw error;
}
```

底层只负责调用 `wx.request`，收到响应后交给上面的统一处理函数：

```js
// 同一文件
function createRequest({ wx, session }) {
  function send(options, retryCount) {
    const snapshot = session.snapshot();
    const idempotencyHeader = options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : {};
    return new Promise((resolve, reject) => wx.request({
      url: options.url,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 15000,
      header: Object.assign({}, options.header || {}, session.header(), idempotencyHeader),
      success: resolve,
      fail: reject
    })).then(
      result => handleResponse(result, options, retryCount, session, snapshot, send),
      error => {
        error.kind = "network";
        error.code = error.code || "NETWORK_ERROR";
        throw error;
      }
    );
  }
  return options => send(options, 0);
}
module.exports = { createRequest };
```

两个关键规则：

- **最多重试一次**，避免登录一直失败时无限递归；
- **只有查询请求，或者带了幂等键的写请求，才会自动重发**。普通的写请求在登录恢复后，会提示用户“请重新提交”，避免自动重试制造两份数据。

## 4. 登录：同一时间只允许一个

### 坑三：五个请求各自调用了 `wx.login`

**现象**：登录过期后打开页面，开发者工具里能看到 `wx.login` 被调用了好几次，用户被反复要求授权，或者后端收到多个换取会话的请求，最后保存下来的会话不知道是哪一个。

**修复**：缓存正在进行中的登录任务，所有等待者复用同一个 Promise；成功和失败都要清除缓存。

```js
// runtime/session.js
// 代码已简化脱敏
function requestLogin(wx, exchangeCode) {
  return new Promise((resolve, reject) => wx.login({
    success: result => {
      if (!result.code) return reject(new Error("NO_LOGIN_CODE"));
      Promise.resolve().then(() => exchangeCode(result.code)).then(resolve, reject);
    },
    fail: reject
  }));
}
```

```js
// 同一文件
function createSession({ wx, exchangeCode }) {
  let sessionId = wx.getStorageSync("session_id") || "";
  let loginFlight = null;
  let revision = 0;
  function login() {
    if (loginFlight) return loginFlight;
    const request = requestLogin(wx, exchangeCode);
    const save = request.then(result => {
      wx.setStorageSync("session_id", result.sessionId);
      sessionId = result.sessionId;
      revision += 1;
      return result;
    });
    loginFlight = save.then(
      result => {
        loginFlight = null;
        return result;
      },
      error => {
        loginFlight = null;
        throw error;
      }
    );
    return loginFlight;
  }
  return {
    ensure: snapshot => snapshot.revision === revision ? login() : Promise.resolve(),
    snapshot: () => ({ revision }),
    header: () => (sessionId ? { "X-Session-Id": sessionId } : {})
  };
}
module.exports = { createSession };
```

`revision` 的作用是：如果在请求发出之后，会话已经被别的请求刷新过了（版本号变了），就不需要再登录一次，直接用新会话重试即可。

真实项目里往往还有“未注册”“需要补充资料”“用户取消”三种结果，它们**不能都伪装成登录成功**，应该分别返回明确的状态，并保证所有等待者最终都能结束等待。

## 5. Page：`onLoad` 接收参数，`onShow` 恢复数据

### 坑四：TabBar 页面切回来，还是旧数据

**现象**：在“我的订单”TabBar 页面点进详情、取消了一个订单，返回后列表里这个订单还显示“待支付”。

**原因**：TabBar 页面切走后通常不会销毁；从登录页 `navigateBack` 回来，也不会再次触发 `onLoad`。只在 `onLoad` 里加载数据，这些情况都不会刷新。

**修复**：下面的简化示例选择每次 `onShow` 都刷新，并用同一个 Promise 合并同时到达的刷新；如果请求很重，可以改成只在收到“数据已变更”的标记时刷新。

```js
// pages/records/list.js
// 代码已简化脱敏
const recordService = require("../../services/record");
Page({
  data: { state: "loading", rows: [] },
  onLoad(options) {
    this.categoryId = String(options.categoryId || "");
    this.refreshFlight = null;
    this.destroyed = false;
  },
  onShow() { this.refresh().catch(() => {}); },

  refresh() {
    if (this.refreshFlight) return this.refreshFlight;
    const task = Promise.resolve().then(
      () => recordService.list(this.categoryId)
    ).then(
      rows => {
        if (!this.destroyed) this.setData({ state: "ready", rows });
        return rows;
      },
      error => {
        if (!this.destroyed) this.setData({ state: "error" });
        throw error;
      }
    );
    const ownFlight = task.then(
      rows => { if (this.refreshFlight === ownFlight) this.refreshFlight = null; return rows; },
      error => { if (this.refreshFlight === ownFlight) this.refreshFlight = null; throw error; }
    );
    this.refreshFlight = ownFlight;
    return ownFlight;
  },
  onUnload() {
    this.destroyed = true;
  }
});
```

### 坑五：页面已经关闭了，回调还在 `setData`

**现象**：控制台出现警告，页面关闭后仍然有 `setData` 调用；偶尔还会出现数据错乱。

**修复**：页面卸载后，正在进行中的回调不应该再 `setData`。上面的代码用 `destroyed` 标记丢弃了迟到的结果；也可以使用请求编号或者可取消的任务。生命周期的完整分工是：`onLoad` 固定参数，`onShow` 核对会话和外部结果，`onHide` 暂停轮询，`onUnload` 清理最终的资源。

## 6. Component：用事件向外沟通

```js
// 代码已简化脱敏
Component({
  properties: { value: String, disabled: Boolean },
  methods: {
    choose(event) {
      if (this.data.disabled) return;
      this.triggerEvent("change", { id: event.currentTarget.dataset.id });
    }
  }
});
```

组件只发出 `change` 事件，由页面决定是请求、跳转还是保存。这样组件才能被多个页面复用，也能单独测试。

## 7. 授权：由用户动作触发，每种结果都要结束

### 坑六：用户拒绝了授权，loading 永远不结束

**现象**：页面请求定位，用户点了“拒绝”，页面一直显示加载中，按钮也一直是禁用状态。

**原因**：代码只处理了“同意”的回调，“拒绝”“系统定位关闭”“接口调用失败”都没有让等待结束。

**修复**：用户资料、手机号等敏感能力，应该由**按钮点击**触发。定位也要告诉用户“为什么此刻需要它”，拒绝后提供“继续使用”或“去设置页开启”的路径。

```text
检查 getSetting
  -> 未询问或已同意：调用 getLocation
  -> 已拒绝：解释用途，由用户决定是否 openSetting
  -> 系统定位关闭：提示去系统设置，同时返回“无位置”
```

**无论同意、拒绝、系统定位关闭还是 API 失败，调用者都要得到一个结果**：关闭 loading、释放提交锁、允许再次尝试，不能让等待队列永久挂起。也不要在 `onLaunch` 里一启动就弹出没有任何上下文的授权请求。

## 8. 分包：围绕首屏和业务边界

主包保留首页、登录、TabBar、公共组件和 runtime；低频且相对独立的业务放进分包：

```json
{
  "pages": ["pages/home/index", "pages/account/index"],
  "subPackages": [
    {
      "root": "packages/reports",
      "pages": ["pages/list/index", "pages/detail/index"]
    }
  ]
}
```

分包不是简单地搬目录，还要遵守：

- **主包不能引用只存在于分包里的组件和代码**；
- 分包可以依赖主包的公共模块（单向依赖），不要为了分包把公共工具复制一份；
- TabBar 页面必须留在主包；
- 每个分包的入口都要单独测试冷启动（直接从分享链接打开分包页面）；
- 大图片优先放到 CDN，不要靠分包来掩盖资源体积的问题。

## 9. 按步骤落地

1. **识别项目类型**：看到 `app.json + Page()` 才按原生项目处理；看到 `pages.json + .vue + @dcloudio/uni-app` 就按 uni-app 处理。
2. **从 `common.js` 里拆出 request 和 session**：先保持原来的调用结果不变，只移动网络和登录的逻辑；选一个低风险的列表页接入，验证成功、失败和过期重试。
3. **整理生命周期**：按第 5 节的分工调整每个页面。
4. **整理组件通信**：把组件直接修改页面、直接跳转业务路由的代码，逐步改成 `triggerEvent`。
5. **补齐授权的完成状态**：为同意、拒绝、失败、从设置页返回分别测试。
6. **最后做分包**：先记录主包体积和首屏路径，一次迁移一个低频业务域，构建后检查依赖方向，并在真机上测试首次进入。

## 排查思路

1. **登录相关问题**：在 `wx.login` 和换取会话的接口处打日志，数一数一次页面打开调用了几次。
2. **数据不刷新**：在 `onLoad`、`onShow` 里打日志，确认返回页面时触发了哪个生命周期。
3. **页面卡在 loading**：列出所有可能的结束路径（成功、失败、拒绝、取消、超时），确认每一条都会关闭 loading。
4. **分包问题**：用开发者工具的代码依赖分析查看主包是否引用了分包文件；直接用分包页面的路径冷启动测试。

## 检查清单

**request 与 session**

- [ ] 网络失败、超时、格式不对的响应都会 reject
- [ ] 五个并发失效的请求只调用一次 `wx.login`，登录失败后可以再次尝试
- [ ] 原请求最多重试一次，写请求带幂等键，重试不会重复创建数据

**App、Page 与 Component**

- [ ] `onLaunch` 不弹出没有上下文的授权
- [ ] TabBar 页从登录页或编辑页返回后刷新正确
- [ ] `onHide` 暂停轮询，`onUnload` 清理监听和定时器，卸载后不再 `setData`
- [ ] 组件通过 properties 输入、通过事件输出

**授权与分包**

- [ ] 首次同意、首次拒绝、再次拒绝、从设置页开启都在真机测试过
- [ ] 系统定位关闭时，等待状态也会结束
- [ ] TabBar 和首屏必需的代码在主包，主包没有引用分包文件
- [ ] 每个分包首次进入和再次进入都正常

**发布前**

- [ ] 配置里没有真实的密钥、凭据或调试地址
- [ ] 错误日志不上传手机号、会话值和授权的原始数据
- [ ] 至少一台 iOS 和一台 Android 真机走完关键路径

最后记住：**App 管启动，Page 管页面，Component 管交互，request 管网络，session 管登录，分包控制首屏成本**。拆成稳定的小模块，比另造一个大框架更实用。

## 延伸阅读

- [移动 H5 会话与恢复](/practice/mobile-h5-reliability)：H5 里同样的 single-flight 思路
- [动态导航与规则缓存](/practice/runtime-navigation-rules)：小程序的动态跳转改造
- [跨端 API 契约](/practice/cross-client-api-contract)：小程序和其他端共用的接口约定
