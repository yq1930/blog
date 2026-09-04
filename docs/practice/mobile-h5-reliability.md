---
title: 微信内 H5 与移动 H5 的可靠性工程
description: 系统梳理移动 H5 的登录态、页面生命周期、微信能力、支付与分享、表单、兼容性、监控和测试策略。
---

# 微信内 H5 与移动 H5 的可靠性工程

移动 H5 的“偶现问题”通常并不偶然。它只是同时受到浏览器历史栈、Vue 组件缓存、微信 WebView 生命周期、OAuth 跳转、JSSDK 回调、弱网和软键盘等多个状态机影响，而普通桌面浏览器很难完整复现。

可靠性设计的核心不是再加几个 try/catch，而是让每条用户路径都满足四个条件：

1. 每个异步操作最终一定结算；
2. 同一操作至多结算一次；
3. 页面恢复后重新核对事实，而不是相信旧内存；
4. 宿主能力失败时有可解释、可继续的降级路径。

本文基于多类长期运行的 Vue 2 移动项目做脱敏归纳。所有路径、对象、接口和代码均为完全原创的泛化示例。

## 先承认：移动 H5 有不止一个运行时

“这是个网页”不足以描述运行环境。至少要区分：

| 运行时 | 可用能力 | 典型风险 |
| --- | --- | --- |
| 普通移动浏览器 | 标准 Web API | 不支持微信分享、支付等宿主能力 |
| 微信内 WebView | Web API + JSSDK | 签名 URL、ready 时机、前后台恢复 |
| 企业容器内 WebView | JSSDK + 组织能力 | 可能存在二次配置、应用身份和能力白名单 |
| 小程序 web-view | Web API + miniProgram bridge | 返回小程序、消息边界、双重会话 |
| 桌面调试浏览器 | DevTools、mock | 无法真实模拟支付、键盘和宿主返回 |

不要只靠 userAgent 决定业务。userAgent 适合做“环境提示”，能力是否真的可用仍要运行时检测：

~~~js
export function detectHost(win) {
  const ua = String(win.navigator.userAgent || "").toLowerCase();
  return {
    looksLikeWechat: ua.indexOf("micromessenger") >= 0,
    looksLikeWorkContainer: ua.indexOf("wxwork") >= 0,
    hasMiniProgramBridge: Boolean(
      win.wx && win.wx.miniProgram && win.wx.miniProgram.navigateTo
    ),
    supportsHistoryReplace: Boolean(
      win.history && win.history.replaceState
    )
  };
}
~~~

能力检测失败时，要么禁用入口并解释原因，要么使用标准 Web 降级；不能让点击毫无反应。

## 推荐的可靠性分层

~~~text
┌─────────────────────────────────────────────────────┐
│ Vue 页面                                            │
│ 展示状态、接收输入、声明需要的能力                   │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│ 用例层                                              │
│ 登录后继续、提交表单、发起支付、配置分享、恢复页面   │
└─────────────┬──────────────────────┬────────────────┘
              ▼                      ▼
┌────────────────────────┐  ┌─────────────────────────┐
│ session + request       │  │ host capabilities       │
│ 会话单飞、超时、归一化  │  │ 微信、企业容器、小程序桥 │
└─────────────┬──────────┘  └─────────────┬───────────┘
              ▼                           ▼
┌─────────────────────────────────────────────────────┐
│ XMLHttpRequest / fetch / axios / JSSDK / DOM        │
└─────────────────────────────────────────────────────┘
~~~

页面只能依赖用例和能力接口。动态加载脚本、签名 URL、回调转 Promise、会话参数注入、错误归一等都不应散落在页面组件中。

## 登录态要设计成状态机

一个布尔值 isLogin 无法表达“正在恢复”和“恢复失败”。建议至少使用以下状态：

~~~text
unknown
  ├─ 本地无凭据 ──────────────> anonymous
  └─ 本地有凭据 ──────────────> restoring
                                      ├─ 成功 -> authenticated
                                      ├─ 已失效 -> anonymous
                                      └─ 网络失败 -> recoverable-error

anonymous
  └─ 发起 OAuth -> leaving-page -> callback -> restoring
~~~

authenticated 表示服务端已核对，不只是“本地有一个 cookie”。

### 并发请求只允许一个会话恢复

页面初次加载经常同时发出多个请求。如果它们都发现会话失效并各自跳登录，就会出现重复弹窗、重复跳转和历史栈污染。解决方法是 single flight：

~~~js
// session/coordinator.js
export function createSessionCoordinator(api, storage) {
  let current = null;
  let restoring = null;
  let expiryFlight = null;
  let revision = 0;

  function staleSessionError() {
    return Object.assign(new Error("SESSION_REVISION_CHANGED"), {
      kind: "canceled"
    });
  }

  async function ensure() {
    if (current) return current;
    if (restoring) return restoring;

    const startedAtRevision = revision;
    const flight = Promise.resolve()
      .then(() => api.readCurrentSession())
      .then(result => {
        // clear 或新登录发生后，旧恢复结果不能写回当前会话。
        if (revision !== startedAtRevision) throw staleSessionError();
        current = result.user;
        return current;
      })
      .finally(() => {
        if (restoring === flight) restoring = null;
      });

    restoring = flight;
    return flight;
  }

  function clear() {
    revision += 1;
    current = null;
    // 底层请求未必能取消，但它的结果会被 revision 检查拦截。
    restoring = null;
    storage.remove("session-hint");
  }

  function snapshot() {
    return {
      revision,
      credential: storage.get("session-hint") || ""
    };
  }

  function expireOnce(requestSnapshot) {
    // 这是旧会话发出的迟到 401；本代已处理，不再重复跳转。
    if (!requestSnapshot || requestSnapshot.revision !== revision) {
      return expiryFlight || Promise.resolve();
    }
    clear();

    const flight = Promise.resolve()
      .then(() => api.beginAuthentication())
      .finally(() => {
        if (expiryFlight === flight) expiryFlight = null;
      });
    expiryFlight = flight;
    return flight;
  }

  return { ensure, clear, snapshot, expireOnce };
}
~~~

revision 既阻止 clear 期间的旧恢复结果“复活”用户，也让错峰返回的一批 401 只处理一次。请求发出时保存 snapshot，失效时交给 expireOnce；一旦首个响应清理会话，其他旧 snapshot 就不再触发第二次跳转。如果服务端支持刷新令牌，同样只能有一个 refresh Promise；等待中的业务请求复用它，刷新成功后各自最多重放一次。

### 登录回跳必须保存“意图”，不是保存任意 URL

OAuth 会离开当前页面。回来时要恢复原目标，但不能直接信任 query 中的 returnUrl，否则可能形成开放重定向。

推荐保存一个短期、同源、结构化的导航意图：

~~~js
export function saveReturnIntent(router, store) {
  const nonce = randomText();
  const intent = {
    path: router.currentRoute.path,
    query: pickSafeQuery(router.currentRoute.query),
    createdAt: Date.now(),
    nonce
  };
  const key = "login-return:" + nonce;

  try {
    store.setItem(key, JSON.stringify(intent));
    return { kind: "browser-storage", nonce };
  } catch (error) {
    // 整页 OAuth 跳转会丢失 JavaScript 内存，不能在这里假装已保存。
    return { kind: "server-state-required", intent };
  }
}

export function consumeReturnIntent(store, returnedNonce) {
  if (!isValidNonce(returnedNonce)) return { path: "/" };
  const key = "login-return:" + returnedNonce;
  let intent = null;
  try {
    intent = JSON.parse(store.getItem(key));
    store.removeItem(key);
  } catch (error) {
    return { path: "/" };
  }

  if (
    !intent ||
    intent.nonce !== returnedNonce ||
    Date.now() - intent.createdAt > 10 * 60 * 1000
  ) {
    return { path: "/" };
  }
  if (!isInternalPath(intent.path)) return { path: "/" };
  return { path: intent.path, query: intent.query };
}
~~~

需要注意：

- 只保存路由 path、白名单 query 和必要 params；
- 不保存 hash 中的临时会话、签名、票据；
- 使用后立即删除；
- OAuth state 带回 nonce，消费时校验 nonce 与时间窗，防止旧意图反复生效；
- sessionStorage 不可用时，整页跳转会丢失内存；此时应让服务端保存短期、一次性的 opaque state 与安全路由映射，不能依赖内存回退；
- OAuth 回调页用 replace 进入目标，避免用户后退回到回调页；
- 从 URL 接收临时会话后，尽快用 history.replaceState 清理地址；
- 日志、埋点和分享链接都不得携带会话凭据。

### 登录、注册、补资料不是同一个状态

有些系统允许游客浏览，但某些动作需要完成注册、绑定手机或补充资料。不要用一个“未登录”错误涵盖所有情况。能力门禁可以更明确：

~~~js
const gates = {
  browse: ["guest", "member"],
  saveDraft: ["member"],
  submitSensitiveAction: ["verified-member"]
};

export function checkGate(identity, action) {
  return gates[action].indexOf(identity.level) >= 0;
}
~~~

这样页面可以准确告诉用户下一步需要登录、验证还是补资料，而不是所有失败都跳到同一页。

## Vue 生命周期与 WebView 生命周期要同时处理

在 keep-alive 下，created 和 mounted 通常只执行一次；从详情返回列表，执行的可能是 activated。支付页切到微信原生界面再返回，可能只收到 pageshow 或 visibilitychange。只依赖其中一个钩子一定会漏场景。

| 事件 | 适合做什么 | 不适合做什么 |
| --- | --- | --- |
| created | 初始化纯状态、建立页面对象 | 依赖 DOM 或假设每次返回都会执行 |
| mounted | 绑定 DOM 监听、首轮测量 | 每次恢复都重复绑定 |
| activated | keep-alive 页面恢复核对 | 无条件重建整个页面 |
| deactivated | 暂停轮询、解绑活跃期监听 | 永久销毁仍会复用的状态 |
| beforeDestroy | 最终释放资源 | 代替 deactivated |
| pageshow | 从浏览器缓存或外部页面返回 | 每次都重复提交业务动作 |
| visibilitychange | 前后台切换提示 | 单独作为支付成功依据 |

### 将恢复事件合并、去抖并核对版本

多个恢复事件可能在几十毫秒内一起触发。可以统一交给协调器：

~~~js
// lifecycle/resume.js
export function createResumeCoordinator(check, now, onError) {
  let timer = null;
  let lastCheckedAt = 0;
  let running = null;
  let disposed = false;
  const pendingReasons = new Set();

  function arm(delay) {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      drain().catch(error => {
        if (typeof onError !== "function") return;
        try {
          onError(error);
        } catch (reportError) {}
      });
    }, delay);
  }

  function schedule(reason) {
    if (disposed) return;
    pendingReasons.add(reason);
    if (!running) arm(80);
  }

  function drain() {
    if (disposed || pendingReasons.size === 0) return Promise.resolve();
    if (running) return running;

    const time = now();
    const wait = 500 - (time - lastCheckedAt);
    if (wait > 0) {
      arm(wait);
      return Promise.resolve();
    }

    const reasons = Array.from(pendingReasons);
    pendingReasons.clear();
    lastCheckedAt = time;
    const flight = Promise.resolve()
      .then(() => check({ reasons, at: time }))
      .finally(() => {
        if (running === flight) running = null;
        // 检查期间到达的新恢复事件不能丢，当前轮结束后再补跑。
        if (!disposed && pendingReasons.size > 0) arm(0);
      });
    running = flight;
    return flight;
  }

  function dispose() {
    disposed = true;
    clearTimeout(timer);
    pendingReasons.clear();
  }

  return { schedule, dispose };
}
~~~

在 Vue 2 页面中，mounted 绑定 pageshow 和 visibilitychange，activated 调用 schedule，deactivated 暂停页面轮询，beforeDestroy 移除永久监听。check 应核对服务端状态或版本号，而不是无条件重放提交动作。

### 页面刷新要有所有权

建议每个缓存页面维护：

- loadedForKey：当前数据对应的关键路由参数；
- sessionRevision：数据对应的会话版本；
- lastFetchedAt：上次成功时间；
- refreshPromise：正在执行的刷新；
- dirtyReason：为什么必须刷新。

当用户登录完成、切换身份或关键参数变化时，增加全局 sessionRevision。页面在 activated 比较版本，只在不一致时完整刷新。这比让每个页面猜测“是不是刚登录回来”更可靠。

### 从原生预览、地图或系统设置返回要单独标记

打开图片预览、地图、系统设置也会触发页面隐藏和恢复，但通常不应整页重载。调用原生能力前记录一次性标记，返回时消费：

~~~js
export function markExpectedNativeReturn(page, kind) {
  page.__nativeReturn = { kind, at: Date.now() };
}

export function takeExpectedNativeReturn(page) {
  const marker = page.__nativeReturn;
  page.__nativeReturn = null;
  if (!marker) return null;
  if (Date.now() - marker.at > 5 * 60 * 1000) return null;
  return marker.kind;
}
~~~

原生能力打开失败时必须回滚标记，否则下次真正恢复会被误判。

## 把微信和宿主能力封装成端口

页面不应直接负责创建 script、请求签名、调用 wx.config、等待 wx.ready 再处理 wx.error。把这些步骤封装后，业务代码只面对能力接口：

~~~ts
interface HostCapabilities {
  share(payload: SharePayload): Promise<void>
  pay(payload: PaymentPayload): Promise<"accepted" | "canceled">
  chooseImage(options: ImageOptions): Promise<SelectedImage[]>
  openLocation(point: GeoPoint): Promise<void>
  miniProgramNavigate(target: MiniProgramTarget): Promise<void>
}
~~~

不同运行时可以有不同实现：

- WechatCapabilities：使用 JSSDK；
- MiniProgramWebViewCapabilities：使用 wx.miniProgram；
- BrowserCapabilities：使用 Web Share API 或显示降级提示；
- UnsupportedCapabilities：返回结构化“不支持”，而不是抛出神秘异常。

### 脚本加载需要缓存成功，也允许失败后重试

~~~js
let sdkPromise = null;

export function loadScriptOnce(doc, src, timeoutMs) {
  const win = doc.defaultView || window;
  if (win.wx) return Promise.resolve(win.wx);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    let existing = doc.querySelector("[data-host-sdk]");
    // 已结束加载却没有暴露 SDK 的标签属于坏状态；load 事件不会重放。
    if (existing && existing.dataset.loadState !== "loading") {
      if (existing.parentNode) existing.parentNode.removeChild(existing);
      existing = null;
    }
    const script = existing || doc.createElement("script");
    let settled = false;
    let timer = null;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };

    const fail = error => {
      if (settled) return;
      if (script.parentNode) script.parentNode.removeChild(script);
      finish(reject, error);
    };

    timer = setTimeout(() => {
      fail(new Error("SDK_LOAD_TIMEOUT"));
    }, timeoutMs || 8000);

    script.onload = () => {
      script.dataset.loadState = "loaded";
      if (win.wx) finish(resolve, win.wx);
      else fail(new Error("SDK_GLOBAL_MISSING"));
    };
    script.onerror = () => fail(new Error("SDK_LOAD_FAILED"));

    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.hostSdk = "1";
      script.dataset.loadState = "loading";
      try {
        doc.head.appendChild(script);
      } catch (error) {
        fail(error);
      }
    }
  }).catch(error => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}
~~~

这里同时解决了三件事：

- 多个页面同时初始化时只插入一个脚本；
- load、error、timeout 只有第一个能结算 Promise；
- 首次失败不会永久缓存 rejected Promise，之后仍可重试。

### JSSDK 签名 URL 必须由前端显式提供

单页应用中，服务端不能只依赖 Referer 猜测当前页面 URL。浏览器或代理可能裁剪 Referer，hash 路由也不会发送给服务端。签名请求应显式发送去掉 hash 的当前完整地址：

~~~js
export function canonicalSdkUrl(locationObject) {
  return locationObject.href.split("#")[0];
}
~~~

还要考虑 iOS 与 Android WebView 对 SPA 导航后签名地址的差异。一个稳妥策略是：

1. 记录应用首次进入的非 hash URL；
2. 能力层按终端策略选择首次 URL 或当前 URL；
3. 每次真正变化时重新获取签名，而不是永久使用一个 ready 标志；
4. 将签名 URL 的 hash 值而非原文写入诊断日志，避免泄露查询参数。

### 初始化同样必须只结算一次

~~~js
let configQueue = Promise.resolve();
let activeConfigKey = "";
const configFlights = new Map();

function applySdkConfig(wxSdk, signature, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error("SDK_READY_TIMEOUT")),
      options.readyTimeout || 8000
    );

    try {
      // 先启动本轮配置，再等待这轮配置对应的 ready/error。
      wxSdk.config({
        debug: false,
        appId: signature.appId,
        timestamp: signature.timestamp,
        nonceStr: signature.nonce,
        signature: signature.value,
        jsApiList: options.apis
      });
      wxSdk.ready(() => finish(resolve, wxSdk));
      wxSdk.error(error => finish(reject, normalizeSdkError(error)));
    } catch (error) {
      finish(reject, error);
    }
  });
}

export function configureWechat(options) {
  const signUrl = canonicalSdkUrl(window.location);
  const configKey = [
    options.scope || "default",
    signUrl,
    options.apis.slice().sort().join(",")
  ].join("|");

  if (activeConfigKey === configKey && window.wx) {
    return Promise.resolve(window.wx);
  }
  if (configFlights.has(configKey)) {
    return configFlights.get(configKey);
  }

  // wx.config 修改的是页面级全局状态。不同 URL 必须串行，
  // 相同 URL 与 API 集合则复用同一个 flight。
  const task = configQueue
    .catch(() => {})
    .then(async () => {
      const wxSdk = await loadScriptOnce(
        document,
        options.sdkSource,
        options.scriptTimeout
      );
      if (activeConfigKey === configKey) return wxSdk;

      const signature = await options.fetchSignature(signUrl);
      await applySdkConfig(wxSdk, signature, options);
      activeConfigKey = configKey;
      return wxSdk;
    })
    .finally(() => {
      if (configFlights.get(configKey) === task) {
        configFlights.delete(configKey);
      }
    });

  configFlights.set(configKey, task);
  configQueue = task.catch(() => {});
  return task;
}
~~~

配置队列应属于当前 document 的能力服务，而不是某个 Vue 页面实例。这样路由离开不会销毁队列，也不会让两个页面的 wx.config、ready 和 error 串扰。若企业容器的某些能力还需要应用级配置，应拆成 baseReady 和 agentReady 两个 Promise，能力声明自己依赖哪一级。不要让只需要普通分享的页面也等待更重的组织能力初始化。

### 小程序 bridge 与 JSSDK 配置不是一回事

小程序 web-view 中的跳转、返回和消息能力，通常只需要脚本已经加载且 wx.miniProgram 存在；不要因为普通网页 JSSDK 签名失败，就把 miniProgram bridge 一并判定不可用。

可以分别暴露：

~~~js
export async function getMiniProgramBridge(loadSdk) {
  const sdk = await loadSdk();
  if (!sdk || !sdk.miniProgram) {
    throw new Error("MINI_PROGRAM_BRIDGE_UNAVAILABLE");
  }
  return sdk.miniProgram;
}
~~~

边界拆清后，支付、分享、定位和小程序导航互不拖累。

## 支付：客户端回调不是最终事实

支付横跨前端、服务端、支付平台与异步通知。可靠流程应以服务端订单状态为事实：

~~~text
用户点击支付
  -> 前端取得提交锁
  -> 服务端创建支付意图（携带幂等键）
  -> 前端调用宿主支付能力
       ├─ 明确取消 -> 展示“已取消”，允许再次发起
       ├─ 调用失败 -> 记录原因，允许安全重试
       └─ 返回成功 -> 仅表示宿主接受
  -> 前端查询服务端订单状态
       ├─ paid -> 成功页
       ├─ pending -> 有限轮询或稍后查看
       └─ failed/closed -> 对应结果页
  -> 服务端异步通知最终收敛
~~~

支付能力适配器只负责把多回调 API 归一化：

~~~js
export function invokePayment(wxSdk, payload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error("PAYMENT_RESULT_UNKNOWN")),
      payload.timeoutMs || 120000
    );

    try {
      wxSdk.chooseWXPay({
        timestamp: payload.timestamp,
        nonceStr: payload.nonce,
        package: payload.packageValue,
        signType: payload.signType,
        paySign: payload.signature,
        success: () => finish(resolve, "accepted"),
        cancel: () => finish(resolve, "canceled"),
        fail: error => finish(reject, normalizeSdkError(error))
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}
~~~

几个关键规则：

- 创建支付意图必须使用客户端生成的幂等键；
- 支付按钮锁的是一次完整任务，不是固定 1.5 秒；
- success 回调后仍查询服务端；
- visibilitychange 或 pageshow 只能触发“核对状态”，不能直接判成功；
- 轮询要有上限、退避和页面销毁清理；
- 结果页可以被刷新和再次进入，不依赖上一页内存；
- 日志不记录支付签名、完整订单号或用户敏感数据。

## 分享：每次页面语义变化都要重新配置

分享信息通常依赖当前详情对象或活动参数，不能只在应用启动时配置一次。建议将分享作为路由能力：

~~~js
export async function applyShare(capabilities, route, entity) {
  const payload = {
    title: entity.publicTitle,
    description: entity.publicSummary,
    link: buildPublicShareUrl(route, entity.publicId),
    imageUrl: entity.publicCover
  };
  await capabilities.share(payload);
}
~~~

buildPublicShareUrl 必须：

- 只使用公开稳定标识；
- 去掉会话、OAuth 票据、调试参数和内部来源参数；
- 对 query 正确编码；
- 有默认标题、图片和描述；
- 可在系统浏览器直接打开，或显示明确的宿主要求。

keep-alive 页面在 activated 或关键数据变化后重新应用分享配置，离开时无需假设宿主会自动清空上一页信息。

## 请求层：让失败可以被分类和恢复

移动弱网下，“请求失败”至少有七种：

| 类型 | 是否提示 | 是否重试 | 页面行为 |
| --- | --- | --- | --- |
| 用户取消 | 通常不提示 | 否 | 保持可操作 |
| 路由离开导致取消 | 不提示 | 否 | 丢弃旧结果 |
| 超时 | 轻提示 | 幂等查询可重试 | 展示重试入口 |
| 离线 | 明确提示 | 恢复在线后可重试 | 保留草稿 |
| HTTP 失败 | 视状态码 | 受控 | 记录 requestId |
| 业务失败 | 展示业务文案 | 通常否 | 保持上下文 |
| 会话失效 | 合并处理 | 恢复后最多重放一次 | 进入会话状态机 |

### 每条路径必须进入 finally

老式 XMLHttpRequest 封装很容易只处理 onreadystatechange，而遗漏 onerror、ontimeout、onabort 和 JSON 解析错误。即便继续使用 XHR，也应完整归一：

~~~js
export function xhrTransport(options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url, true);
    xhr.timeout = options.timeout || 15000;

    Object.keys(options.headers || {}).forEach(name => {
      xhr.setRequestHeader(name, options.headers[name]);
    });

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "null");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ status: xhr.status, data: body });
        } else {
          reject({ kind: "http", status: xhr.status, data: body });
        }
      } catch (error) {
        reject({ kind: "parse", cause: error });
      }
    };
    xhr.onerror = () => reject({ kind: "network" });
    xhr.ontimeout = () => reject({ kind: "timeout" });
    xhr.onabort = () => reject({ kind: "canceled" });
    xhr.send(options.body || null);
  });
}
~~~

调用层统一使用 finally 关闭自己拥有的 loading。不要让 transport 自己弹业务对话框，否则后台刷新、静默预加载也会打断用户。

### loading 使用引用计数

~~~js
export function createLoadingCounter(driver) {
  let count = 0;
  let close = null;

  return {
    begin() {
      count += 1;
      if (count === 1) close = driver.open();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        count = Math.max(0, count - 1);
        if (count === 0 && close) {
          close();
          close = null;
        }
      };
    }
  };
}
~~~

这样三个并发请求中最先完成的一个不会错误关闭整个页面的遮罩。

## 表单可靠性：锁任务，不是锁点击动画

移动端重复提交往往来自：

- 用户在弱网下连续点击；
- touchend 与 click 都绑定了提交；
- 页面恢复时又触发一次动作；
- 第一次 Promise 还没返回，按钮只做了短时间节流；
- 服务端超时，但其实已经成功落库。

前端应使用 keyed Promise lock，让相同页面实例上的同一任务复用正在进行的 Promise：

~~~js
export function createTaskLock() {
  const pending = new Map();

  return function run(key, task) {
    if (pending.has(key)) return pending.get(key);

    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });

    pending.set(key, promise);
    return promise;
  };
}

// Vue 2 页面中：每个组件实例各自创建锁，不能放在 SFC 模块顶层。
export default {
  created() {
    this.runLocked = createTaskLock();
  },
  methods: {
    submitDraft() {
      return this.runLocked("submit-draft", async () => {
        const payload = normalizeForm(this.form);
        const errors = validateForm(payload);
        if (errors.length) return this.showFieldErrors(errors);
        return this.api.save(payload, createIdempotencyKey());
      });
    }
  }
};
~~~

这个锁有四个重要性质：

- 第二次点击拿到同一个 Promise，不再执行 task；
- 同一页面的不同动作可使用不同 key；
- 不同页面实例不共享错误的全局锁；
- 同步抛错、异步失败和成功都会释放。

后端仍需幂等。前端锁只能减少重复意图，无法覆盖刷新、网络重发、多设备或恶意请求。

### 表单数据先归一化，再校验

不要在每个规则里重复 trim、日期转换和空值判断：

~~~js
export function normalizeForm(source) {
  return {
    displayName: String(source.displayName || "").trim(),
    phone: String(source.phone || "").replace(/\s+/g, ""),
    note: String(source.note || "").trim(),
    accepted: source.accepted === true
  };
}

export function validateForm(value) {
  const errors = [];
  if (!value.displayName) {
    errors.push({ field: "displayName", code: "required" });
  }
  if (value.phone && !/^\d{6,20}$/.test(value.phone)) {
    errors.push({ field: "phone", code: "format" });
  }
  if (!value.accepted) {
    errors.push({ field: "accepted", code: "agreement" });
  }
  return errors;
}
~~~

示例故意不绑定任何真实地区手机号规则。实际项目应让产品规则可配置，并由服务端再次校验。

### 服务端字段错误要回到字段

全局 toast 只适合无法定位的错误。若服务端返回字段级错误，应映射到表单项并滚动到第一个错误；如果字段已被用户修改，旧请求的错误不能覆盖新值。可以给每次提交记录 draftVersion，响应回来时只对同一版本应用错误。

### 软键盘与焦点是业务流程的一部分

移动 WebView 中，键盘会改变 visualViewport、高度或滚动位置。建议：

- 使用 visualViewport 可用时监听 resize，计算实际可见区；
- 固定底部按钮使用安全区和键盘高度共同修正；
- input blur 后只做轻量 scroll 修复，不无条件滚到文档底部；
- 弹窗关闭时恢复原焦点，但避免自动再次拉起键盘；
- 输入法 composition 期间不触发搜索和校验；
- 页面销毁或失活时移除 viewport、resize 和 scroll 监听。

## 兼容性：围绕能力做降级，不围绕机型打补丁

### URL 编码

手写 key=value& 会在空格、加号、中文、百分号、数组和嵌套对象上出错。统一使用 URLSearchParams 或经过测试的 serializer。签名、分享和 OAuth 回跳对“编码一次还是两次”尤其敏感，应为每层输入输出写清楚约定。

### Storage 不是永远可用

隐私模式、低存储空间和某些旧 WebView 可能让 localStorage 或 sessionStorage 抛异常。所有读写都包在适配器中：

~~~js
export function createSafeStorage(nativeStorage) {
  const memory = new Map();
  const fallbackKeys = new Set();
  const removed = Symbol("removed");

  function memoryValue(key) {
    const value = memory.get(key);
    return value === removed ? null : value;
  }

  return {
    get(key) {
      // 某 key 的原生写入失败后，不能再读出原生层的旧值。
      if (fallbackKeys.has(key)) return memoryValue(key);
      try {
        const value = nativeStorage.getItem(key);
        if (value === null) {
          memory.delete(key);
          return null;
        }
        memory.set(key, value);
        return value;
      } catch (error) {
        fallbackKeys.add(key);
        return memoryValue(key);
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        nativeStorage.setItem(key, value);
        fallbackKeys.delete(key);
      } catch (error) {
        // 当前页面仍可工作；持久化能力已降级。
        fallbackKeys.add(key);
      }
    },
    remove(key) {
      memory.set(key, removed);
      try {
        nativeStorage.removeItem(key);
        memory.delete(key);
        fallbackKeys.delete(key);
      } catch (error) {
        fallbackKeys.add(key);
      }
    }
  };
}
~~~

内存回退无法跨页面重载，所以只能用于体验降级，不能成为安全会话的唯一来源。

### Promise 实例方法要按最低运行时验证

本文示例多次使用 Promise.finally 表达“成功或失败都清理”。Babel 转译语法并不会自动补齐 Promise.prototype.finally 等实例方法；若仍支持较老 Android WebView，必须在真机上验证由哪一层提供 polyfill，并保证 polyfill 在业务 chunk 之前加载。若不引入 polyfill，就用 then 的成功、失败双分支调用同一个清理函数，不能省略失败侧。

### 日期解析

不要依赖不同 WebView 对非标准日期字符串的宽松解析。服务端返回 ISO 8601 或时间戳；前端明确时区。金额不要用浮点数直接累加，协议使用最小货币单位或十进制定点字符串。

### 安全区与字号

- 使用 env(safe-area-inset-bottom) 处理底部安全区；
- 不根据某几款机型分辨率判断“全面屏”；
- 容器应允许合理的系统字号，不要全局禁止缩放；
- 图片和画布功能要测试高 DPR 与大字号；
- 固定高度布局必须验证长文案和辅助字号。

### 资源加载

- 路由默认懒加载，首屏只保留外壳和必要页面；
- chunk 加载失败时区分“版本已更新”和“网络失败”；
- 新版本发布后，旧 HTML 引用的 chunk 应有短期保留策略；
- 图片使用合适尺寸、懒加载和失败占位；
- 动态 SDK 必须走 CSP 与来源白名单，地址由受控配置提供。

## 监控：记录状态转换，不记录隐私

只记录 error.message 很难还原移动端问题。建议为关键链路记录结构化事件：

~~~json
{
  "event": "host_capability_failed",
  "releaseId": "demo-release",
  "routePattern": "/records/:id",
  "host": "wechat-webview",
  "capability": "pay",
  "phase": "ready",
  "errorKind": "timeout",
  "requestId": "req_demo",
  "durationMs": 8120
}
~~~

值得观测的事件包括：

- session_restore_started / succeeded / failed；
- oauth_redirected / callback_consumed / callback_rejected；
- page_resumed 及 reason；
- sdk_script_loaded / sdk_ready / sdk_error；
- payment_invoked / canceled / status_confirmed；
- request_started / timeout / canceled / completed；
- submit_deduplicated；
- chunk_load_failed；
- storage_fallback_used。

隐私规则：

- route 使用模板，不记录真实参数；
- 用户标识使用不可逆、带环境隔离的散列或匿名会话标识；
- 不记录 token、cookie、OAuth code、支付签名、完整 URL；
- 请求体与响应体默认不上传；
- 错误上报 SDK 在用户同意和合规策略允许后初始化；
- 调试控制台只在非生产构建启用，且仍要过滤凭据。

### 指标要能回答用户是否完成任务

除了 JS 异常，还应关注：

- 登录恢复成功率与耗时分位数；
- JSSDK ready 成功率；
- 支付调用接受率与最终状态确认率；
- 表单提交成功率、重复提交拦截量；
- 页面恢复后数据核对失败率；
- 超时率、离线率、chunk 加载失败率；
- iOS 与 Android、不同宿主之间的差异。

告警要指向可执行的排查手册：影响版本、宿主、页面模式、失败阶段和降级是否生效。

## 测试策略

### 纯函数单元测试

优先测试不依赖 DOM 的部分：

- 回跳意图的白名单、过期和消费；
- 会话状态转换和 single flight；
- 错误归一、重试判断；
- URL 规范化、分享链接清洗；
- 表单归一与字段错误映射；
- sessionRevision 与缓存失效；
- 支付状态到结果页的映射。

### 能力适配器契约测试

构造假的 wx 对象，逐一验证：

- ready 后 resolve；
- error 先到时 reject；
- ready 和 error 都到也只结算一次；
- 脚本 onerror、timeout 后允许重试；
- 相同签名 URL 的并发配置只执行一次，不同 URL 的 config 严格串行；
- 上一轮遗留的 ready 不能让下一轮配置提前成功；
- 支付 success、cancel、fail 被正确区分；
- wx.miniProgram 可用时不被普通签名失败阻塞；
- 页面失活时轮询和监听被清理。

~~~js
function fakeWx() {
  const hooks = {};
  return {
    ready(fn) { hooks.ready = fn; },
    error(fn) { hooks.error = fn; },
    config() {},
    trigger(name, value) { hooks[name](value); }
  };
}
~~~

### 请求层测试

- XHR 的 load、error、timeout、abort 和解析失败都结算；
- 会话失效的十个并发请求只发起一次恢复；
- 恢复成功后每个请求最多重放一次；
- loading 引用计数不提前归零；
- 旧路由响应不会更新新页面；
- GET 重试有上限，POST 默认不重试；
- 后端已成功但客户端超时的写操作可通过幂等键核对。

### 页面集成测试

- keep-alive 首进、前进、后退和参数变化；
- OAuth 跳出与回调恢复；
- 支付后 pageshow 与 visibilitychange 连续触发；
- storage 不可用；
- SDK 加载慢、签名失败、ready 超时；
- 重复快速点击；
- 表单提交失败后可再次提交；
- 键盘弹出时底部按钮仍可触达；
- 从图片预览、地图、设置页返回不误刷新。

### 真机矩阵

模拟器无法代替真机。最小矩阵至少包括：

| 维度 | 覆盖 |
| --- | --- |
| 系统 | 当前支持的最低 iOS、主流 iOS、最低 Android、主流 Android |
| 宿主 | 微信、企业容器、小程序 web-view、系统浏览器 |
| 网络 | 正常、慢速、高延迟、断网后恢复 |
| 页面 | 冷启动、keep-alive 返回、系统回收后恢复 |
| 输入 | 普通键盘、中文输入法、大字号 |
| 发布 | 当前版本 HTML、旧 HTML 加载新旧 chunk |

支付和分享必须在官方允许的测试环境与测试账号中验证，不应通过修改生产参数绕过限制。

## 常见失败模式

| 失败模式 | 现象 | 根因 | 修复方向 |
| --- | --- | --- | --- |
| 本地有 cookie 就认为已登录 | 首个接口才发现失效 | 没有 restoring 状态 | 启动时核对，建立会话状态机 |
| 每个失败请求都跳 OAuth | 历史栈混乱、重复跳转 | 缺少 single flight | 合并恢复，只允许一个跳转 |
| 任意 returnUrl 原样跳转 | 可被利用做开放重定向 | 回跳意图未校验 | 仅接受同源结构化路由 |
| 只在 mounted 拉数据 | 返回页面仍是旧数据 | keep-alive 不重新 mounted | activated + revision 核对 |
| pageshow 就认为支付成功 | 展示成功但订单未支付 | 把生命周期当业务事实 | 返回后查服务端状态 |
| SDK Promise 永久失败 | 一次断网后整页都不可用 | 缓存 rejected Promise | 失败时清缓存，允许重试 |
| 依赖 Referer 做签名 | 部分终端签名失败 | Referer 被裁剪或 hash 缺失 | 前端显式传规范 URL |
| 所有宿主能力共用一个 ready | 小程序跳转被分享签名拖死 | 能力层级未拆分 | 按 base、agent、mini bridge 分层 |
| 固定时间禁用按钮 | 弱网下仍可重复提交 | 节流不等于任务锁 | keyed Promise lock + 服务端幂等 |
| XHR 只处理成功回调 | loading 永远不消失 | error/timeout/abort 未结算 | 完整 transport 状态 |
| 全局捕获任何错误都弹窗 | 后台刷新频繁打断用户 | transport 承担 UI | 错误分类，页面决定展示 |
| storage 读写不捕获异常 | 某些 WebView 白屏 | 假设存储永远可用 | 安全适配器与内存降级 |
| 生产启用调试控制台 | 凭据和用户数据可见 | 调试能力未按环境隔离 | 编译期剔除并过滤日志 |

## 开发与发布检查清单

### 登录与导航

- [ ] 会话是否包含 unknown、restoring、authenticated、anonymous 等明确状态？
- [ ] 并发恢复是否复用一个 Promise？
- [ ] 失效请求是否最多重放一次？
- [ ] 登录回跳是否只接受同源、白名单路由？
- [ ] OAuth code、调试会话等是否及时从地址栏移除？
- [ ] 回调页是否用 replace，避免后退再次消费？

### 生命周期

- [ ] created、mounted、activated、pageshow 各自职责是否明确？
- [ ] 多个恢复事件是否合并去抖？
- [ ] 页面是否用 sessionRevision 或关键参数判断缓存失效？
- [ ] deactivated 是否暂停轮询和活跃期监听？
- [ ] beforeDestroy 是否移除永久监听？
- [ ] 原生预览或设置返回是否使用一次性标记？

### 宿主能力

- [ ] 动态脚本是否 single flight，并有 onerror 与 timeout？
- [ ] JSSDK 是否显式使用规范化签名 URL？
- [ ] ready、error 和 timeout 是否至多结算一次？
- [ ] 同 URL 配置是否 single flight，不同 URL 配置是否串行？
- [ ] 不同层级能力是否分别初始化？
- [ ] 分享链接是否移除会话和内部参数？
- [ ] 支付回调后是否以服务端状态为准？

### 请求与表单

- [ ] 网络、超时、取消、解析、业务和鉴权失败是否分类？
- [ ] loading 是否有所有权或引用计数？
- [ ] 写操作是否有 keyed task lock 和幂等键？
- [ ] 所有失败分支是否释放提交态？
- [ ] 服务端字段错误是否展示在对应字段？
- [ ] 页面离开后旧响应是否会被忽略或取消？

### 兼容、监控与测试

- [ ] URL、日期、金额和 storage 是否有明确跨端约定？
- [ ] 安全区、系统字号、输入法和 visualViewport 是否验证？
- [ ] 日志是否排除凭据、完整 URL、请求体和响应体？
- [ ] 错误事件是否包含 releaseId、路由模板、阶段和 requestId？
- [ ] iOS、Android、微信、小程序 web-view 和浏览器是否完成真机冒烟？
- [ ] 慢网、断网恢复、旧 chunk 和 SDK 超时是否测试？

## 结语

微信内 H5 的可靠性，最终取决于团队是否把“回到页面”“SDK 回调成功”“本地存在会话”“按钮已经禁用”这些表象，与真正的业务事实区分开。

最稳的原则可以压缩成一句话：**所有跨页面、跨网络、跨宿主的动作都建模为可观察、可重入、可超时、可核对的状态机。** 做到这一点后，那些长期被称作“微信偶现”“iOS 偶现”“用户点太快”的问题，才会变成可以测试和治理的普通工程问题。
