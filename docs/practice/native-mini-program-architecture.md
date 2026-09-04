---
title: 原生微信小程序怎么拆：App、Page、请求、登录与分包
description: 从多套真实小程序的维护现场出发，用普通开发者能照做的方式拆清 App、Page、Component、request、session、授权和分包。
---

# 原生微信小程序怎么拆：App、Page、请求、登录与分包

原生微信小程序刚开始很简单：`app.js` 放公共变量，页面里直接
`wx.request`，需要登录时调用 `wx.login`。

业务变多后，问题会一起出现：

- 五个请求同时过期，打开多次登录页；
- TabBar 页面返回后还是旧数据；
- 每个页面各写一套 `wx.request` 和错误弹窗；
- `globalData` 里既有用户资料，又有定时器、回调和提交锁；
- 所有页面都在主包里，冷启动越来越慢；
- 授权被拒绝后，loading 永远不结束。

这篇文章不引入新框架，只用原生小程序已有的能力逐步整理结构。

> 本文来自本地多套小程序的只读归纳。下文代码已简化脱敏，
> 页面、路由、接口、域名、凭据、用户数据、品牌名称和内部常量均已替换。

## 读完能解决什么

你可以照着本文完成这些改造：

1. 分清 `App`、`Page`、`Component` 各自该做什么；
2. 让所有页面通过同一个 `request` 发请求；
3. 让并发请求只触发一次登录；
4. 正确处理用户资料、手机号、定位等授权；
5. 把低频业务移入分包，并避免主包反向依赖分包。

## 项目现场：原生与 uni-app 子项目并存

研究中的小程序工作区不是一个项目，而是多个独立项目的集合。

其中大部分项目包含：

```text
app.js
app.json
app.wxss
pages/
component/ 或 components/
utils/
project.config.json
```

这类是原生微信小程序，使用 `App()`、`Page()`、`Component()`、
WXML、WXSS 和微信 API。

同一工作区里还存在一个带有 `src/pages.json`、`src/manifest.json`、
Vue 3、Vite 与 `@dcloudio/uni-app` 依赖的子项目。它是 uni-app，
不能因为也能构建微信小程序，就套用原生项目的目录和注册方式。

两者应该分别治理：

| 类型 | 页面配置 | 组件写法 | 构建入口 |
| --- | --- | --- | --- |
| 原生小程序 | `app.json` | `Component({...})` | 微信开发者工具 |
| uni-app | `pages.json` | Vue 单文件组件 | uni-app CLI / Vite |

本文接下来只讲原生小程序。

从现有原生项目还能看到三种典型状态：

- `app.js` 已统一计算导航栏与安全区，但 `globalData` 职责较多；
- `utils/common.js` 已集中处理请求、登录和定位，但文件逐渐过大；
- 有的 `app.json` 已按业务使用多个分包，有的仍保留空 `subPackages`。

这说明最合适的方向不是重写，而是继续把大工具文件拆成稳定的小模块。

## 一张小流程图：页面不直接管理登录

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

## 先把六个对象的责任写清楚

| 对象 | 应该负责 | 不应该负责 |
| --- | --- | --- |
| `App` | 启动、设备信息、更新、装配公共模块 | 某个页面的请求和弹窗 |
| `Page` | 路由参数、页面状态、生命周期 | 拼域名、处理全局登录队列 |
| `Component` | 属性、内部交互、向外触发事件 | 直接修改任意页面数据 |
| `request` | 超时、响应归一、网络错误 | 决定登录页长什么样 |
| `session` | 会话、登录 single-flight | 保存页面筛选条件 |
| `service` | 用业务语言组合接口 | 操作某个 Page 实例 |

## 项目中可借鉴的简化代码片段

### 1. App 只做进程级初始化

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

`globalData` 适合少量、含义稳定的公共值。
Promise、回调队列、定时器和请求状态放进 `runtime`，不要塞进 `globalData`。

### 2. 把 wx.request 完整地变成 Promise

`success` 只代表收到了响应，不代表业务成功；
`complete` 无论成功失败都会执行，适合结束底层 loading 或统计。

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

底层传输只负责调用 `wx.request`，收到响应后再交给上面的统一处理函数：

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

这里规定“最多重试一次”，避免登录失败时无限递归。
关键写操作还应带幂等键；自动重试不能制造两份数据。

### 3. 登录只允许一个在途任务

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

会话模块缓存正在执行的登录任务，成功和失败都要清锁：

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

真实项目往往还有“未注册”“需要补资料”“用户取消”三种结果。
它们不能都伪装成登录成功，应分别返回明确状态，并保证等待者最终结束。

### 4. Page 用 onLoad 接收参数，用 onShow 恢复

TabBar 页面切走后通常不会销毁，从登录页 `navigateBack` 也不会再次
触发 `onLoad`。下面的简化示例选择每次 `onShow` 都刷新，并用同一个
Promise 合并同时到达的刷新；请求很重时，再改成消费“数据已变更”标记。

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

页面卸载后，在途回调不应继续 `setData`。
实际代码可以使用请求编号、`destroyed` 标记或可取消任务丢弃迟到结果。

### 5. Component 用事件向外沟通

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

组件发出 `change`，页面决定是否请求、跳转或保存。
这样组件才可以被多个页面复用和单独测试。

### 6. 授权必须由用户动作触发

用户资料、手机号等敏感能力，应由按钮点击触发。
定位也要告诉用户“为什么此刻需要”，拒绝后提供继续使用或去设置页的路径。

```text
检查 getSetting
  -> 未询问或已同意：调用 getLocation
  -> 已拒绝：解释用途，由用户决定是否 openSetting
  -> 系统定位关闭：提示去系统设置，同时返回“无位置”
```

无论同意、拒绝、系统定位关闭还是 API 失败，调用者都要得到结果，
不能把等待队列永久挂起。

### 7. 分包围绕首屏和业务边界

主包保留首页、登录、TabBar、公共组件和 runtime；
低频且相对独立的业务放进分包。

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

分包不是简单搬目录，还要遵守：

- 主包不能引用只存在于分包的组件和代码；
- 分包可以依赖主包公共模块；
- TabBar 页面必须留在主包；
- 分包入口必须完成独立冷启动测试；
- 大图片优先放 CDN，不要靠分包掩盖资源问题。

## 按步骤落地

1. **识别项目类型。** 看到 `app.json + Page()` 才按原生项目处理；
看到 `pages.json + .vue + @dcloudio/uni-app` 就按 uni-app 处理。

2. **从 common.js 拆 request 与 session。** 先保持原调用结果不变，只移动网络和登录逻辑。
选择一个低风险列表页接入，验证成功、失败和过期重试。

3. **整理生命周期。** `onLoad` 固化参数，`onShow` 核对会话和外部结果，
`onHide` 暂停轮询，`onUnload` 清理最终资源。

4. **整理组件通信。** 把组件直接改页面、直接跳业务路由的代码，逐步改成 `triggerEvent`。

5. **补齐授权完成态。** 为同意、拒绝、失败、从设置页返回分别测试。
loading、提交锁和等待队列都必须结束。

6. **再做分包。** 先记录主包体积与首屏路径，再一次迁移一个低频业务域，
构建后检查依赖方向和真机首次进入。

## 常见坑

- **文件顶层调用 `getApp()`：** 模块加载时 App 可能未初始化，在函数或生命周期中读取更稳妥。
- **把 success 当业务成功：** `wx.request.success` 只表示收到响应，仍要检查状态码和业务结果。
- **多个请求各自 `wx.login`：** 缓存登录 Promise，所有等待者复用，失败后清空。
- **授权取消没有回调：** 取消也是结果，必须关闭 loading、释放锁并允许再次尝试。
- **只在 `onLoad` 刷新 TabBar 页：** 返回通常只触发 `onShow`，用版本或脏标记刷新。
- **为了分包复制公共工具：** 公共 runtime 留在主包，分包单向复用。
- **原生与 uni-app 共用脚手架：** 两者只共享接口契约，不共享生命周期和构建写法。

## 测试与清单

### Request 与 Session

- [ ] 网络失败、超时、非对象响应都会 reject；
- [ ] 五个并发失效请求只调用一次 `wx.login`；
- [ ] 登录失败后可以再次尝试；
- [ ] 原请求最多重试一次；
- [ ] 写请求带幂等键，不因重试重复创建数据。

### App、Page 与 Component

- [ ] `onLaunch` 不弹出无上下文授权；
- [ ] TabBar 页从登录或编辑页返回后刷新正确；
- [ ] `onHide` 暂停轮询，`onUnload` 清理监听和定时器；
- [ ] 页面卸载后，迟到响应不会继续 `setData`；
- [ ] 组件通过 properties 输入、通过事件输出。

### 授权与分包

- [ ] 首次同意、首次拒绝、再次拒绝、设置页开启都已真机测试；
- [ ] 系统定位关闭时仍会结束等待状态；
- [ ] TabBar 和首屏必需代码位于主包；
- [ ] 主包没有引用分包文件；
- [ ] 每个分包首次进入和二次进入都正常；
- [ ] 原生项目与 uni-app 项目使用各自构建命令。

### 发布前

- [ ] 配置中没有真实密钥、凭据或调试地址；
- [ ] 错误日志不上传手机号、会话值和授权原始数据；
- [ ] 开发者工具构建通过；
- [ ] 至少一台 iOS 和一台 Android 真机完成关键路径。

最后记住：App 管启动，Page 管页面，Component 管交互，request 管网络，
session 管登录，分包控制首屏成本；小模块比另造一个大框架更实用。
