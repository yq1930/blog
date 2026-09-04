---
title: 原生微信小程序架构：从 App 到分包、会话与性能
description: 用清晰的 app、page、component、request、session 边界组织原生微信小程序，并覆盖授权、联调、分包、性能和测试。
---

# 原生微信小程序架构：从 App 到分包、会话与性能

原生微信小程序不缺目录规范，真正缺的是**生命周期之外的状态边界**。业务变大后，最常见的问题并不是 WXML 不会写，而是：

- App.globalData 同时承担设备信息、用户数据、页面通信和临时锁；
- 每个页面都复制一份 wx.request、登录失效和弹窗逻辑；
- TabBar 页面常驻，登录后返回却仍显示游客数据；
- 多个请求同时需要登录或定位，出现重复弹窗与丢回调；
- 主包不断变大，分包只是“目录搬家”，没有首屏预算；
- 授权失败、网络超时、页面返回等分支没有完成态，loading 永久不消失。

本文只讨论 App、Page、Component、WXML、WXSS 与 app.json 组成的原生小程序。与原生项目放在同一工作区的 uni-app、Taro 等项目应按各自框架治理，不能因为目录相邻就当成同一种技术栈。文中所有名称、路径、接口和代码均为完全原创的泛化示例。

## 一张图看清责任边界

~~~text
┌───────────────────────────────────────────────────────────┐
│ app.js / app.json                                         │
│ 启动、全局错误、设备能力、更新、服务装配、页面与分包声明  │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│ runtime                                                   │
│ env / request / session / storage / location / telemetry  │
└───────────────┬───────────────────────────┬───────────────┘
                │                           │
┌───────────────▼────────────────┐ ┌────────▼────────────────┐
│ services                       │ │ components              │
│ 用业务语言封装接口与流程       │ │ properties / events     │
│ 不依赖具体页面实例             │ │ 不直接控制页面栈         │
└───────────────┬────────────────┘ └────────┬────────────────┘
                └──────────────┬─────────────┘
                               ▼
┌───────────────────────────────────────────────────────────┐
│ pages                                                     │
│ 路由参数、页面状态、生命周期编排、展示与用户输入           │
└───────────────────────────────────────────────────────────┘
~~~

这六类对象的职责可以用一句话概括：

| 对象 | 应负责 | 不应负责 |
| --- | --- | --- |
| App | 进程级初始化和服务装配 | 某个业务页面的请求与弹窗 |
| Page | 页面生命周期与视图状态 | 拼域名、刷新令牌、全局授权队列 |
| Component | 可复用交互契约 | 直接跳业务页面、修改任意全局数据 |
| request | 传输、超时、归一化、请求标识 | 决定业务页面文案 |
| session | 登录状态与并发恢复 | 保存页面 UI 状态 |
| service | 一个业务用例 | 读写组件私有 data |

## 推荐目录：按稳定边界，而不是按文件后缀堆放

~~~text
miniprogram/
├── app.js
├── app.json
├── app.wxss
├── runtime/
│   ├── env.js
│   ├── request.js
│   ├── session.js
│   ├── storage.js
│   ├── location.js
│   ├── update.js
│   └── telemetry.js
├── services/
│   ├── sample-account-service.js
│   └── sample-entry-service.js
├── components/
│   ├── state-view/
│   └── search-picker/
├── pages/
│   ├── sample-hub/
│   ├── sample-auth/
│   └── sample-preferences/
├── packages/
│   ├── sample-entries/
│   └── sample-insights/
└── assets/
~~~

这并不要求建立复杂框架。关键是让页面无法绕过 session 与 request 直接各写一套网络协议，也让 runtime 不反向依赖 Page。

## App：保持小、幂等、可重复进入

### onLaunch 只做一次性进程初始化

适合放在 onLaunch 的事情：

- 创建不会随页面变化的服务对象；
- 读取并校验本地会话提示；
- 缓存窗口、状态栏、胶囊等设备指标；
- 注册更新管理器；
- 注册全局错误与 Promise 拒绝监听；
- 查询隐私授权状态，合规后再初始化统计；
- 记录启动场景，但不立刻据此执行某个页面业务。

不适合放在 onLaunch 的事情：

- 无条件弹出定位、用户资料或手机号授权；
- 拉取只服务于首页的一大批数据；
- 直接导航到多个可能冲突的页面；
- 建立没有销毁策略的定时器；
- 把支付轮询、页面 loading 等挂到 App；
- 每次请求前重新注册更新管理器。

~~~js
// app.js，示例只体现装配关系
import { createRuntime } from "./runtime/index";

App({
  onLaunch(options) {
    this.runtime = createRuntime({ wx });
    this.runtime.device.capture();
    this.runtime.update.start();
    this.runtime.errors.start();
    this.runtime.launch.record(options.scene);
    this.runtime.telemetry.startWhenAllowed();
  },

  onShow(options) {
    this.runtime.launch.resume(options.scene);
  },

  onHide() {
    this.runtime.launch.pause();
  }
});
~~~

服务对象不一定放在 globalData。globalData 更适合少量可序列化、能明确说明失效时机的公共状态。包含 Promise、定时器、监听器和请求队列的对象应由 runtime 管理。

### 设备信息只测一次，能力按需判断

启动时可以缓存：

- windowWidth、windowHeight；
- statusBarHeight；
- safeArea；
- menuButton rect；
- SDKVersion；
- platform 与性能等级。

不要通过某几个固定屏幕尺寸判断异形屏。优先使用 safeArea 和胶囊位置计算自定义导航栏。调用新 API 前使用 wx.canIUse 或存在性检查，版本比较作为兜底。

### 更新管理器只注册一次

推荐流程：

~~~text
启动时创建 UpdateManager
  -> onCheckForUpdate：只记录是否有新版本
  -> onUpdateReady：提示用户并在确认后 applyUpdate
  -> onUpdateFailed：给出稍后重试或重新打开提示
~~~

不要在每个 request 前检查更新。那会重复注册监听，并把两个无关生命周期绑在一起。

## Page：onLoad 接收输入，onShow 核对事实

原生页面常见生命周期职责如下：

| 生命周期 | 推荐职责 |
| --- | --- |
| onLoad | 解析、校验并固化路由参数；初始化页面控制器 |
| onReady | 获取节点、测量布局、启动依赖渲染完成的能力 |
| onShow | 核对会话版本、脏标记和外部操作结果 |
| onHide | 暂停轮询、音视频、位置刷新和活跃期监听 |
| onUnload | 取消请求、清理最终资源 |
| onPullDownRefresh | 复用 refresh Promise，最终 stopPullDownRefresh |
| onReachBottom | 分页锁、hasMore 判断、避免并发翻页 |

TabBar 页面通常不会因为切换而销毁。从登录或注册页 navigateBack 后，原页面只会再触发 onShow，不会重新 onLoad。因此“登录态变化版本”比猜测来源页面可靠：

~~~js
Page({
  data: {
    viewState: "loading",
    profile: null
  },

  onLoad() {
    this.seenSessionRevision = -1;
    this.refreshFlight = null;
  },

  onShow() {
    const runtime = getApp().runtime;
    const revision = runtime.session.revision();
    if (revision === this.seenSessionRevision) return;

    this.refresh()
      .then(() => {
        this.seenSessionRevision = revision;
      })
      .catch(error => {
        // refresh 已更新页面 error 状态；这里消费并记录 Promise 拒绝。
        runtime.errors.capture(error);
      });
  },

  refresh() {
    if (this.refreshFlight) return this.refreshFlight;
    this.refreshFlight = profileService
      .load()
      .then(profile => {
        this.setData({ viewState: "ready", profile });
      })
      .catch(error => {
        this.setData({ viewState: "error" });
        throw error;
      })
      .finally(() => {
        this.refreshFlight = null;
      });
    return this.refreshFlight;
  }
});
~~~

页面还应区分四种视图状态：

- loading：首次加载，通常显示骨架；
- ready：有数据；
- empty：请求成功但为空；
- error：请求未完成，可重试。

不要用一个布尔值 loading 同时表达这四种状态。

### 原生页面返回不等于业务数据变化

wx.previewImage、wx.openLocation、wx.openSetting 等原生页会使当前页面 onHide，再在返回时 onShow。打开前可在页面实例记录一次性 marker，返回时消费；打开失败要立即撤销。这样不会因看了一张图就刷新整个首页。

## Session：把登录与注册建模为串行流程

小程序会话至少有以下状态：

~~~text
unknown
  -> guest
  -> signing-in
       ├─ 已是用户 -> authenticated
       ├─ 需注册/补资料 -> pending-profile
       └─ 网络或平台失败 -> recoverable-error

pending-profile
  ├─ 用户完成 -> authenticated
  └─ 用户取消 -> guest
~~~

“游客”是可用状态，不应等同于异常。公开接口可以继续执行；受保护动作再触发门禁。

### 登录必须 single flight

~~~js
// runtime/session.js
export function createSession(platform, authApi, storage) {
  let user = null;
  let flight = null;
  let recoveryFlight = null;
  let version = 0;

  function staleSessionError() {
    return Object.assign(new Error("SESSION_REVISION_CHANGED"), {
      kind: "canceled"
    });
  }

  async function signIn() {
    if (user) return user;
    if (flight) return flight;

    const startedAtVersion = version;
    const loginFlight = Promise.resolve()
      .then(() => platform.login())
      .then(result => {
        if (!result.code) throw new Error("PLATFORM_LOGIN_FAILED");
        return authApi.exchangeCode(result.code);
      })
      .then(result => {
        if (version !== startedAtVersion) throw staleSessionError();
        if (result.kind === "profile-required") {
          throw Object.assign(new Error("PROFILE_REQUIRED"), {
            kind: "profile-required",
            continuation: result.continuation
          });
        }
        // clear 或另一轮登录发生后，旧请求不得把旧用户写回来。
        user = result.user;
        storage.set("session-hint", result.sessionHint);
        version += 1;
        return user;
      })
      .finally(() => {
        if (flight === loginFlight) flight = null;
      });

    flight = loginFlight;
    return loginFlight;
  }

  function clear() {
    version += 1;
    user = null;
    // 底层平台调用可能无法取消，version 会阻止它落地。
    flight = null;
    storage.remove("session-hint");
  }

  function snapshot() {
    return {
      revision: version,
      credential: storage.get("session-hint") || ""
    };
  }

  function recoverExpired(requestSnapshot) {
    // 迟到的旧响应：本代会话已经清理或恢复，不再重复 wx.login。
    if (!requestSnapshot || requestSnapshot.revision !== version) {
      return recoveryFlight || Promise.resolve(user);
    }

    clear();
    const next = signIn();
    const recovery = Promise.resolve(next).finally(() => {
      if (recoveryFlight === recovery) recoveryFlight = null;
    });
    recoveryFlight = recovery;
    return recovery;
  }

  return {
    signIn,
    clear,
    snapshot,
    recoverExpired,
    current: () => user,
    revision: () => version
  };
}
~~~

需要补资料时，不要让 request 层直接操作某个页面组件。request 抛出结构化挑战，由页面门禁或统一导航器打开补资料页；完成后增加 session revision，原 TabBar 页面在 onShow 自行刷新。请求发出时保存 snapshot，失效时交给 recoverExpired，错峰到达的一批旧响应就不会重复清理或登录。

示例使用了 Promise.finally 来强调清理语义。若项目支持的最低基础库或 JavaScript 运行环境不具备该能力，应在构建阶段提供经过验证的 polyfill，或改写为 then 的成功、失败双分支清理；不能因为语法能通过开发工具编译，就假设所有目标终端都支持。

### 平台登录码、业务会话和用户资料要分开

- wx.login 的 code 是短期交换凭据，不是业务登录态；
- 业务 session 由服务端建立与失效；
- 用户昵称、头像等资料不是登录凭据；
- 手机号、定位和用户资料授权应由用户动作触发；
- 本地 storage 只是会话提示，服务端仍是事实来源；
- 清理会话时还要清理关联缓存、正在进行的恢复和用户范围内数据。

## Request：所有路径都要结算，失效请求只重放一次

请求层应统一处理：

- base URL 和环境选择；
- session 与客户端上下文；
- query、form、JSON 编码；
- timeout 和 abort；
- HTTP 与业务结果归一；
- requestId；
- 会话失效后的单次恢复；
- 可选 loading 所有权；
- 安全的错误日志。

页面不应知道会话放在哪个 header，也不应识别多套历史响应中的成功标记、错误码和提示字段。

### 先把 wx.request 变成完整 Promise

~~~js
// runtime/transport.js
export function send(options) {
  let task = null;

  const promise = new Promise((resolve, reject) => {
    try {
      task = wx.request({
        url: options.url,
        method: options.method || "GET",
        data: options.data,
        header: options.headers,
        timeout: options.timeout || 15000,
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response);
          } else {
            reject({
              kind: "http",
              status: response.statusCode,
              response
            });
          }
        },
        fail(error) {
          const message = String(error && error.errMsg || "");
          let kind = "network";
          if (message.indexOf("abort") >= 0) kind = "canceled";
          if (message.indexOf("timeout") >= 0) kind = "timeout";
          reject({
            kind,
            cause: error
          });
        }
      });
    } catch (error) {
      reject({ kind: "client", cause: error });
    }
  });

  promise.abort = () => {
    if (task && task.abort) task.abort();
  };
  return promise;
}
~~~

wx.request 的 complete 适合清理平台 loading，但 Promise 仍应只由 success 或 fail 结算。业务 JSON 解析与错误码归一放在更上一层，便于单测。

### 会话失效后的重放要有上限

~~~js
// runtime/request.js
export function createRequest(transport, session, normalize, config) {
  function mayReplay(input) {
    const method = String(input.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return true;
    return Boolean(input.replayAfterAuth && input.idempotencyKey);
  }

  function start(input) {
    let activeTask = null;
    let canceled = false;
    const canceledError = () =>
      Object.assign(new Error("REQUEST_CANCELED"), { kind: "canceled" });

    async function execute(attempt) {
      if (canceled) throw canceledError();

      const headers = Object.assign({}, input.headers, {
        "X-Request-Id": createRequestId()
      });
      const requestSession = session.snapshot();
      if (requestSession.credential) {
        headers.Authorization = "Bearer " + requestSession.credential;
      }
      if (input.idempotencyKey) {
        headers["Idempotency-Key"] = input.idempotencyKey;
      }

      const task = transport.send({
        url: config.baseUrl + input.path,
        method: input.method,
        data: input.data,
        headers,
        timeout: input.timeout
      });
      activeTask = task;

      let result;
      try {
        const response = await task;
        result = normalize(response.data);
      } catch (error) {
        if (error.kind === "http" && error.status === 401) {
          result = {
            ok: false,
            error: { kind: "auth", code: "HTTP_401" }
          };
        } else if (error.kind === "http" && error.status === 403) {
          result = {
            ok: false,
            error: { kind: "permission", code: "HTTP_403" }
          };
        } else {
          throw error;
        }
      } finally {
        if (activeTask === task) activeTask = null;
      }
      if (canceled) throw canceledError();

      if (!result.error || result.error.kind !== "auth") return result;
      if (attempt >= 1 || input.auth === "none") return result;

      await session.recoverExpired(requestSession);
      if (canceled) throw canceledError();

      if (!mayReplay(input)) {
        return {
          ok: false,
          error: {
            kind: "manual-retry",
            code: "REAUTHENTICATED",
            message: "登录状态已恢复，请再次确认提交"
          }
        };
      }
      return execute(attempt + 1);
    }

    const promise = execute(0);
    return {
      promise,
      abort() {
        canceled = true;
        if (activeTask && activeTask.abort) activeTask.abort();
      }
    };
  }

  return { start };
}
~~~

还需要明确：

- 公开接口标记 auth: none，不能因游客态进入登录循环；
- 写请求只有具备服务端幂等能力才允许重放；
- session.signIn 是 single flight，所以并发失效只登录一次；
- 恢复失败必须让所有等待者结束，而不是永远 pending；
- 页面销毁时 abort 查询，取消错误不弹 toast；
- 业务错误由页面决定展示，基础设施错误由统一反馈策略处理。

调用方保存完整 operation，而不只保存 operation.promise；onUnload 时调用 operation.abort。这样取消句柄不会在 async/await 包装中丢失。对于已发到服务端的写请求，abort 只能停止客户端等待，不能证明服务端没有执行，仍需依靠幂等键与状态查询。

### loading 与提交锁分开

loading 解决“用户是否知道正在处理”，提交锁解决“任务是否重复执行”，两者不是一回事。

页面提交可使用实例级同步锁：

~~~js
export function beginTask(owner, key) {
  owner.__taskLocks = owner.__taskLocks || Object.create(null);
  if (owner.__taskLocks[key]) return false;
  owner.__taskLocks[key] = true;
  owner.setData({ [key]: true });
  return true;
}

export function endTask(owner, key) {
  if (owner.__taskLocks) delete owner.__taskLocks[key];
  owner.setData({ [key]: false });
}
~~~

之所以不能只读取 this.data.submitting，是因为 setData 到视图层有异步时序，同一事件循环内的第二次点击可能仍读到旧值。私有锁同步写入，data 只负责渲染按钮状态。

服务端仍需幂等键。网络超时时，客户端无法知道服务端是否已完成，幂等键是安全查询或重试的依据。

## 定位与授权：排队、降级、一定唤醒等待者

定位流程同时受四类状态影响：

- 用户是否已登录；
- 产品是否真的需要位置；
- 小程序 scope.userLocation 是否未询问、允许或拒绝；
- 手机系统定位总开关是否开启。

应先完成登录和必要的用户动作，再请求定位。不要在 onLaunch 一启动就弹授权。

### 一个可靠的定位时序

~~~text
页面声明需要位置
  -> location.ensure()
      ├─ 有新鲜缓存 -> 立即返回坐标
      ├─ 已有定位请求 -> 回调进入 waiters
      └─ 发起一次平台定位
           ├─ 成功 -> 更新带时间戳缓存 -> 唤醒全部 waiters
           ├─ 小程序权限拒绝 -> 一次引导 -> 无坐标降级 -> 唤醒全部
           ├─ 系统定位关闭 -> 解释性提示 -> 无坐标降级 -> 唤醒全部
           └─ 其他失败 -> 无坐标降级 -> 唤醒全部
~~~

重点不是“必须拿到位置”，而是“拿不到也必须让页面继续”。若产品允许无坐标列表，返回明确的 degraded 结果；若位置是硬性条件，页面进入可重试的 blocked 状态。

~~~js
export function createLocationQueue(platform, cache) {
  let flight = null;

  function ensure(options) {
    const saved = cache.readFresh(options.maxAge);
    if (saved && !options.force) {
      return Promise.resolve({ kind: "located", point: saved });
    }
    if (flight) return flight;

    flight = platform.getLocation()
      .then(point => {
        cache.write(point, Date.now());
        return { kind: "located", point };
      })
      .catch(error => ({
        kind: "degraded",
        reason: classifyLocationError(error)
      }))
      .finally(() => {
        flight = null;
      });

    return flight;
  }

  return { ensure };
}
~~~

若需要引导 wx.openSetting，应遵循：

- 已明确拒绝时才提示，不要每次 onShow 都自动弹；
- 用户取消后改为页面内提示，由主动点击再次打开；
- openSetting 返回后重新检查设置并定位；
- 打开设置失败也要结束定位 Promise；
- 页面卸载后不再 setData；
- 坐标缓存带采集时间和用户范围，退出登录时清理。

### 手机号、头像昵称等能力必须由用户动作触发

平台要求用户手势的能力，应放在 button 对应事件中。不要在 request 拦截器里偷偷触发，因为此时往往没有合法手势，也无法向用户解释授权目的。

授权结果应该是结构化状态：

~~~js
{
  kind: "granted" | "denied" | "canceled" | "unavailable",
  value: null,
  retryable: true
}
~~~

页面根据业务必要性决定继续、降级或阻塞。

## Component：通过 properties 和事件沟通

一个可复用原生组件应具备：

- properties：外部输入，声明类型和默认值；
- data：只保存组件内部视图状态；
- computed 的等价逻辑：集中在 observer 或纯函数；
- methods：处理组件内部交互；
- triggerEvent：向外表达用户意图；
- lifetimes：绑定与释放资源；
- pageLifetimes：仅在确有页面显隐需求时使用；
- 外部样式类或 CSS 变量：提供受控定制点。

~~~js
Component({
  properties: {
    value: {
      type: Array,
      value: []
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    draft: []
  },

  observers: {
    value(next) {
      this.setData({ draft: cloneSelection(next) });
    }
  },

  methods: {
    confirm() {
      if (this.data.disabled) return;
      this.triggerEvent("confirm", {
        value: cloneSelection(this.data.draft)
      });
    }
  }
});
~~~

组件不应：

- 用 getCurrentPages 修改调用页；
- 假设自己只出现在某条业务路由；
- 直接读写 session storage；
- 在 properties observer 中发写请求；
- 把传入对象原地修改后再回传；
- 在 detached 后继续 setData。

### 自定义 TabBar 也是组件，不是全局业务中心

自定义 TabBar 只负责选中态、红点展示和导航意图。红点数据由页面或服务提供，通过明确接口更新。每个 TabBar 页面在 onShow 同步 selected，不依赖上一个页面一定执行过某段代码。

## 分包：以首屏和业务边界为目标

分包不是把大目录搬到 subPackages 就结束。一个可执行的原则是：

### 主包保留

- 启动页和核心 TabBar 页；
- app.js、基础样式和最小 runtime；
- 高频通用组件；
- session、request、storage 等所有页面都需要的能力；
- 首屏立即使用的图片与字体。

### 业务分包承载

- 低频但完整的业务流程；
- 大体积编辑器、图表、富媒体能力；
- 只在某一模块使用的页面、组件和资源；
- 可独立衡量与发布验证的功能组。

一个泛化的 app.json 示例：

~~~json
{
  "pages": [
    "pages/sample-hub/main",
    "pages/sample-account/main",
    "pages/sample-auth/main"
  ],
  "subPackages": [
    {
      "root": "packages/sample-entries",
      "pages": [
        "list/index",
        "detail/index",
        "edit/index"
      ]
    },
    {
      "root": "packages/sample-insights",
      "pages": [
        "overview/index"
      ]
    }
  ],
  "preloadRule": {
    "pages/sample-hub/main": {
      "network": "wifi",
      "packages": ["packages/sample-entries"]
    }
  }
}
~~~

预加载只有在数据证明“用户高概率马上进入”时才开启。否则只是把首屏之后的网络拥堵提前发生。

### 分包边界检查

- TabBar 页面必须位于主包；
- 分包页面不要反向依赖另一个业务分包的私有组件；
- 被多个分包使用的轻量模块放主包，重模块考虑各自封装；
- 独立分包只有在确实能独立运行时使用；
- 图片和媒体资源跟随使用它们的业务包；
- 分包根目录、页面路径和跳转地址由常量或生成脚本校验；
- CI 记录主包、各分包和总包大小，超过预算直接失败；
- 开发工具中“忽略未使用文件”不能代替真实包体审计。

### 页面路由建立小型注册表

原生小程序没有 Vue Router，但仍可以集中管理合法页面：

~~~js
export const routes = Object.freeze({
  sampleHub: "/pages/sample-hub/main",
  sampleAuth: "/pages/sample-auth/main",
  sampleEntryList: "/packages/sample-entries/list/index",
  sampleEntryDetail: "/packages/sample-entries/detail/index"
});

export function toSampleEntryDetail(id) {
  return routes.sampleEntryDetail + "?id=" + encodeURIComponent(id);
}
~~~

这样可以避免路径散落在几十个组件里，也便于静态检查不存在的页面。注册表不应变成通用“任意 URL 跳转器”；每个需要参数的页面提供明确构造函数和校验。

## 性能：优先减少逻辑层与视图层通信

小程序性能不只取决于网络。setData 跨线程通信的体积和频率往往更关键。

### setData 的五条规则

1. 只传视图需要的数据，完整接口响应留在控制器或 service；
2. 更新数组某项时使用数据路径，不重传整个大列表；
3. 把同一帧的多个更新合并；
4. 不在高频 scroll、touchmove 中无节流 setData；
5. 页面隐藏或卸载后不再 setData。

~~~js
function updateRow(page, index, patch) {
  const changes = {};
  Object.keys(patch).forEach(key => {
    changes["rows[" + index + "]." + key] = patch[key];
  });
  page.setData(changes);
}
~~~

对数百项列表，更好的方案通常是分页、虚拟列表或缩小数据结构，而不是不断优化一份巨大 setData。

### 冷启动预算

建议记录：

- App onLaunch 到首屏可交互时间；
- 主包下载与注入耗时；
- 首页必要请求数量；
- 最大图片与首屏图片总量；
- 首次 setData 体积；
- 自定义组件数量与层级；
- 登录、定位是否阻塞公开首屏；
- 分包首次打开耗时。

首屏能先展示公开内容时，不应等待登录、定位、红点、更新检查和统计初始化全部完成。

### 网络与图片

- 首页请求按“首屏必要、首屏稍后、用户触发”分级；
- 相同查询复用 Promise，避免 onLoad 与 onShow 重复请求；
- 下拉刷新等待当前初始化结束或明确取消它；
- 分页使用 pageToken 或稳定游标，避免数据变化造成重复；
- 图片使用服务端裁剪后的实际展示尺寸；
- 图片预览与列表缩略图使用不同资源；
- 上传前压缩应保留方向信息，并设体积和数量上限；
- 大文件上传要有进度、取消和失败重试策略。

### 定时器与轮询

所有定时器记录 owner：

- onShow 开启；
- onHide 暂停；
- onUnload 最终清理；
- 同一 owner 重复 start 前先 stop；
- 轮询请求未结束时不启动下一轮；
- 后台超过阈值后返回先做一次状态核对。

## web-view 与 H5：边界要比普通跳转更严格

原生小程序与 H5 同时存在时，最危险的做法是把长期业务会话直接拼进 web-view URL。地址可能进入日志、分享、截图、浏览器历史和第三方资源 Referer。

推荐使用一次性短期交换码：

~~~text
小程序已登录
  -> 向服务端申请一次性 web-entry-code
  -> 打开白名单 H5 地址，只携带 code 与公开 return target
  -> H5 服务端交换 code，建立自己的短期会话
  -> code 立即失效
~~~

还要满足：

- 只允许配置中的 HTTPS 域名；
- path 和 query 分别编码，不能整体重复编码；
- return target 只能来自本地路由注册表；
- H5 返回消息验证 type、version 和 payload；
- 不信任 web-view 中的“支付成功”，仍向服务端核对；
- 小程序退出登录时，通知或使 H5 会话同步失效；
- web-view 错误页提供返回小程序的明确入口。

## 隐私、授权与遥测

### 授权按“此刻为什么需要”发起

好的授权流程包含：

1. 页面先展示能力价值；
2. 用户主动触发；
3. 调用平台授权能力；
4. 拒绝后允许核心功能降级；
5. 只有再次主动操作才引导设置；
6. 合规记录授权状态，但不把拒绝当异常用户。

位置、相册、摄像头、手机号、订阅消息各自独立，不应做成“进入首页一次要完所有权限”。

app.json 中的 permission、requiredPrivateInfos 等声明要与实际调用保持一致：只声明真实使用的能力，说明文案解释用户收益，删除功能时同步删除声明。配置文件通过审核不代表运行时可以跳过用户意愿，页面仍要处理拒绝、取消与稍后再说。

### 统计初始化也受隐私状态约束

在需要隐私同意的场景，先查询隐私设置，再初始化统计 SDK。不要为了统计启动事件而抢在用户同意前上传设备或用户信息。环境 key 由构建配置提供，不硬编码在业务文件；公开客户端中的标识即使不是秘密，也应有轮换和环境隔离策略。

### 全局错误并不等于上传所有现场

可以在 App 注册：

- onError；
- onUnhandledRejection；
- onPageNotFound；
- request 失败事件；
- session 和 location 状态转换。

建议字段：

~~~json
{
  "event": "request_failed",
  "releaseId": "demo-release",
  "pageRoute": "/packages/sample-entries/detail/index",
  "requestName": "sample-entry.detail",
  "errorKind": "timeout",
  "requestId": "req_demo",
  "durationMs": 15012
}
~~~

禁止记录：

- wx.login code、session、token；
- 手机号、身份证件、精确坐标；
- 完整请求和响应；
- 含用户数据的页面 query；
- 支付参数、签名、完整订单标识；
- 未脱敏的用户输入与图片地址。

路由用模板，用户用匿名标识，坐标最多按产品允许的粗粒度聚合。

## 前后端联调：先约定会话和错误，再对字段

小程序联调最容易卡在“HTTP 200，但业务失败”。建议契约明确：

~~~json
{
  "ok": false,
  "data": null,
  "error": {
    "kind": "validation",
    "code": "FIELD_INVALID",
    "message": "请检查输入",
    "fields": {
      "displayName": "required"
    },
    "retryable": false
  },
  "requestId": "req_demo"
}
~~~

需要共同约定：

- HTTP 状态与业务错误各自含义；
- session 失效的唯一错误类型；
- 游客接口是否允许无 session；
- 写操作幂等键和查询接口；
- 分页是页码还是游标；
- 日期时区、金额单位、空值语义；
- 定位缺失如何表示；
- 客户端最低版本和强制升级策略；
- requestId 如何贯穿服务端日志。

开发与测试环境通过独立配置选择，不在页面里注释、切换域名。无法确认环境性质时停止请求，不能拿生产系统做联调。

## 测试策略

### runtime 单元测试

通过注入假的 wx 对象测试：

- session.signIn 的并发调用只执行一次 wx.login；
- 登录成功增加 revision，失败释放 flight；
- request 的 success、fail、timeout、abort 都结算；
- HTTP 401/403 与 2xx 业务错误都进入正确分类；
- 会话失效最多重放一次；
- 公开接口不触发登录；
- 写请求没有幂等声明时不重放；
- storage 读写异常时安全降级；
- location 并发调用共享一次平台请求；
- 定位成功、拒绝、系统关闭、openSetting 失败都唤醒等待者；
- 更新管理器只注册一组监听。

### Page 测试

以页面控制器或开发者工具自动化覆盖：

- onLoad 参数缺失和非法值；
- TabBar 页面登录前后 onShow；
- session revision 未变时不重复刷新；
- onPullDownRefresh 一定 stop；
- 快速触发两次 onReachBottom 只请求一页；
- onHide 停止轮询，onShow 恢复；
- 原生图片预览返回不误刷新；
- 页面卸载后旧请求不 setData；
- empty、error、ready 状态可以互相转换。

### Component 测试

- property 更新是否同步内部草稿；
- 组件是否只通过事件输出；
- disabled 时不触发动作；
- attached/detached 是否成对管理监听；
- 连续 confirm 是否被任务锁保护；
- 大字号、长文案和安全区布局；
- 自定义 TabBar 在每个 Tab 页 onShow 后选中正确。

### 构建与包体测试

- app.json 中每条页面路径真实存在；
- usingComponents 路径有效；
- 分包没有非法交叉依赖；
- 主包、每个分包和总包不超过团队预算；
- 上传清单不包含测试数据、source map、密钥或无用大文件；
- NPM 构建产物版本与 lockfile 一致；
- 开发、体验、正式环境的可见配置正确隔离。

### 真机与场景矩阵

| 场景 | 必测项 |
| --- | --- |
| 冷启动 | 游客、已登录、本地会话已过期 |
| 热启动 | 前后台切换、系统回收后恢复 |
| TabBar | 登录后返回、红点、重复点击当前 Tab |
| 网络 | 慢网、超时、断网恢复、请求取消 |
| 授权 | 首次允许、首次拒绝、设置页开启、系统定位关闭 |
| 分包 | 首次进入、弱网下载、更新后旧缓存 |
| 支付/外部能力 | 取消、失败、返回后服务端状态核对 |
| web-view | 一次性码过期、返回消息非法、H5 加载失败 |
| 设备 | 支持的最低基础库、iOS、Android、大字号 |

## 常见失败模式

| 失败模式 | 现象 | 根因 | 治理动作 |
| --- | --- | --- | --- |
| App.globalData 放所有状态 | 难以知道谁改了数据 | 进程状态与页面状态混杂 | runtime 服务 + 少量只读全局快照 |
| 每次请求检查更新 | 重复监听、职责混乱 | 更新与网络层耦合 | App 启动时注册一次 |
| 多请求各自 wx.login | 重复登录、回调互相覆盖 | 无 single flight | session 复用一个 flight |
| 登录失败不释放标记 | 之后永远无法重试 | 异常路径未 finally | 所有路径结算并清理 |
| Tab 页只在 onLoad 拉数据 | 登录后仍显示游客态 | TabBar 页面常驻 | onShow 比较 session revision |
| 定位并发只保存一个回调 | 部分页面一直 loading | 后到请求覆盖前一个 | Promise flight 或 waiters 队列 |
| 拒绝定位后每次自动弹 | 用户无法正常浏览 | 授权引导无节制 | 一次提示 + 页面内主动入口 |
| 定位失败不回调 | 页面永久等待 | 把坐标当唯一成功 | 返回 degraded 并唤醒全部 |
| 仅用 data 做提交锁 | 同一帧仍可能重复提交 | setData 有异步时序 | 实例同步锁 + 按任务释放 |
| service 直接 setData | 无法复用和单测 | 领域逻辑依赖页面实例 | service 返回数据，Page 更新视图 |
| 组件直接 navigateTo 业务页 | 组件无法复用 | 组件承担页面编排 | triggerEvent 输出意图 |
| 分包只搬目录 | 主包仍大、共享依赖混乱 | 没有首屏与依赖预算 | 按业务边界和真实指标拆分 |
| 大列表整块 setData | 滚动卡顿、内存升高 | 传输数据过大 | 分页、路径更新、虚拟化 |
| session 拼进 web-view URL | 凭据进入历史和日志 | 缺少跨端交换协议 | 一次性短码换 H5 会话 |
| 所有错误都 showModal | 用户连续被打断 | 基础设施层决定 UI | 错误分类、页面选择反馈 |

## 评审检查清单

### App 与 runtime

- [ ] onLaunch 是否只做进程级、幂等初始化？
- [ ] 更新、错误、隐私和设备监听是否只注册一次？
- [ ] globalData 中每个字段是否有 owner 和失效时机？
- [ ] Promise、定时器和监听队列是否由专门服务管理？
- [ ] 新平台 API 是否有能力检测和降级？

### Page 与 Component

- [ ] onLoad 是否只解析稳定输入，onShow 是否负责恢复核对？
- [ ] TabBar 页面是否响应 session revision？
- [ ] 页面隐藏和卸载是否清理轮询、请求与监听？
- [ ] empty、error、ready、loading 是否明确？
- [ ] 组件是否只通过 properties 和事件通信？
- [ ] 是否避免在 detached 后 setData？

### Request 与 Session

- [ ] 平台 code、业务 session、用户资料是否分离？
- [ ] 登录与刷新是否 single flight？
- [ ] 公开接口是否不会误触发登录？
- [ ] 会话失效重放是否封顶为一次？
- [ ] 网络、超时、取消、HTTP、业务错误是否分类？
- [ ] 写操作是否有实例锁和服务端幂等键？
- [ ] 所有分支是否最终释放 loading 和 flight？

### 授权与位置

- [ ] 权限是否在有解释的用户动作后请求？
- [ ] 拒绝后核心功能是否能合理降级？
- [ ] 系统总开关与小程序授权是否分别处理？
- [ ] 定位并发是否共享一次请求？
- [ ] 所有失败是否唤醒等待者？
- [ ] 坐标缓存是否有时间戳、用户边界和退出清理？

### 分包、性能与发布

- [ ] 主包是否只包含首屏和跨包公共能力？
- [ ] 分包是否围绕完整业务边界？
- [ ] 预加载是否有真实转化和性能数据支持？
- [ ] 主包、分包、首屏 setData 和图片是否有预算？
- [ ] 页面路径、组件依赖和路由注册表是否自动校验？
- [ ] 真机是否覆盖最低基础库、iOS、Android、大字号和弱网？
- [ ] 产物是否排除了测试数据、凭据和调试文件？

## 结语

原生小程序的架构不需要模仿一个庞大的 Web 框架。它需要的是少数清晰、稳定、可以测试的边界：

- App 管进程，不管页面业务；
- Page 管生命周期，不管底层协议；
- Component 管输入输出，不越过页面编排；
- request 管传输与错误，不直接决定 UI；
- session 管身份状态，不把授权弹窗塞进拦截器；
- 分包服务于首屏和业务边界，不只是目录整洁。

当登录、请求、定位和页面恢复都成为“必定结算、至多一次、可以重入”的状态机后，小程序才能在功能持续增长时仍保持可预测。
