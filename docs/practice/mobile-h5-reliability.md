---
title: 移动 H5 不再“偶尔失灵”：会话、页面恢复与提交锁
description: 用三个小改造解决微信内 H5 和普通移动 H5 中的重复登录、返回后旧数据、重复提交与 loading 不结束。
---

# 移动 H5 不再“偶尔失灵”：会话、页面恢复与提交锁

移动 H5 最难查的问题，经常带着“偶尔”两个字：

- 偶尔连续跳两次登录；
- 从微信授权页回来，页面还是旧数据；
- 用户点了一次，却生成两条记录；
- 请求失败后，按钮一直显示“提交中”；
- 本地浏览器正常，微信 WebView 里却复现。

这些现象通常不是随机错误，而是多个异步操作同时运行，却没有规定“谁负责、何时结束、能执行几次”。

本文只做三个小改造：会话 single-flight、生命周期恢复、提交锁。

> 本文来自两个长期运行的 Vue 2 移动 H5 项目的只读归纳。下文代码已简化脱敏，业务页面、路由、接口、域名、凭据、用户数据、
> 品牌名称和内部常量均已替换。

## 读完能解决什么

你将能处理以下场景：

1. 首屏五个请求同时发现登录过期，只恢复一次会话；
2. 页面被 `keep-alive` 缓存，返回时仍能刷新该刷的数据；
3. 微信授权、系统设置或另一个页面返回后，能重新核对状态；
4. 连点、慢网和异常都不会让写操作重复执行或永久锁死。

## 项目现场：可靠性问题藏在正常代码里

研究中的 H5 工程都使用 Vue 2、Vue Router 和移动组件库，
并运行在普通浏览器、微信 WebView 或企业容器中。

代码里已经能看到一些正确方向：

- 路由 `meta` 标记页面是否缓存；
- 缓存页使用 `activated` / `deactivated` 启停定时器；
- 请求封装统一附加会话标识；
- 表单使用 `submitting` 阻止重复提交；
- 公共 `$withSubmitLock(key, task)` 复用同一个在途任务；
- 点击指令做短时间防抖。

同时也存在典型的历史过渡状态：

- 登录跳转分散在多个请求回调中；
- URL、Cookie 和路由参数都可能提供会话值；
- 页面同时依赖 `created`、`activated`、浏览器恢复事件；
- 有的写操作只锁按钮，没有锁真正的异步任务；
- 成功回调解锁了，网络失败分支却忘了解锁。

因此，可靠性治理不该从重写页面开始，而要先统一三条公共规则。

## 一张小流程图：每个异步动作只能有一个负责人

```text
进入或恢复页面
      │
      ▼
ensureSession()
      │ 已有恢复任务？── 是 ──> 复用同一个 Promise
      │ 否
      ▼
核对服务端会话 ── 失效 ──> expireOnce() ──> 只跳一次登录
      │ 有效
      ▼
refreshPage() ──> 用户提交 ──> withSubmitLock() ──> 成功或失败都解锁
```

single-flight 就是“同一时间只执行一个任务”，后来者复用第一个 Promise。

## 项目中可借鉴的简化代码片段

### 1. 会话恢复只运行一次

不要让每个页面自己判断 Cookie、自己请求当前用户、自己跳登录。
把它们放进一个会话协调器：

```js
// src/session/coordinator.js
// 代码已简化脱敏
let currentUser = null;
let restoreFlight = null;
let expireFlight = null;
let revision = 0;

export const sessionSnapshot = () => ({ revision });

export function ensureSession(api) {
  if (currentUser) return Promise.resolve(currentUser);
  if (!restoreFlight) {
    const startedRevision = revision;
    const task = Promise.resolve().then(() => api.getCurrentUser()).then(user => {
      if (startedRevision !== revision) throw new Error("SESSION_CHANGED");
      currentUser = user;
      return user;
    });
    const ownFlight = task.then(
      result => {
        if (restoreFlight === ownFlight) restoreFlight = null;
        return result;
      },
      error => {
        if (restoreFlight === ownFlight) restoreFlight = null;
        throw error;
      }
    );
    restoreFlight = ownFlight;
  }
  return restoreFlight;
}
```

失效处理与恢复任务分开：它只清一次会话，并阻止迟到的旧响应再次跳登录。

```js
// 同一文件

export function expireOnce(snapshot, auth) {
  if (snapshot.revision !== revision) return expireFlight || Promise.resolve();
  if (expireFlight) return expireFlight;
  revision += 1;
  currentUser = null;
  restoreFlight = null;
  const task = Promise.resolve().then(() => auth.goToLogin());
  expireFlight = task.then(
    result => { expireFlight = null; return result; },
    error => { expireFlight = null; throw error; }
  );
  return expireFlight;
}
```

为什么还要 `revision`？

假设旧请求稍晚才返回“会话失效”。首个响应已经清理会话并跳转，
后面的旧响应看到版本不同，就不会再次跳转。

如果登录方式是整页 OAuth，`goToLogin()` 应保存同源的回跳路径，
然后使用 `location.replace()`；不要把任意外部 URL 当作回跳目标。

### 2. 页面恢复时重新核对事实

`created` 只保证组件创建时运行。
被 `keep-alive` 缓存的页面再次显示时，通常只触发 `activated`。
从微信授权页、系统选择器或浏览器后台回来，还可能触发 `pageshow`
或 `visibilitychange`。

可以让这些入口都调用同一个、可合并的 `resume()`：

```js
// 页面内工具，代码已简化脱敏
function resumePage(page) {
  if (page.refreshFlight) return page.refreshFlight;
  const task = Promise.resolve().then(() => page.loadRows());
  page.refreshFlight = task.then(
    rows => {
      page.rows = rows;
      page.error = "";
      page.refreshFlight = null;
    },
    error => {
      page.error = error.message;
      page.refreshFlight = null;
    }
  );
  return page.refreshFlight;
}
```

生命周期只负责绑定和解绑事件，真正刷新都交给同一个函数：

```js
export default {
  data: () => ({ rows: [], error: "" }),
  created() { this.refreshFlight = null; },
  mounted() {
    this.bindResumeEvents();
    this.resume();
  },
  activated() {
    this.bindResumeEvents();
    this.resume();
  },
  deactivated() { this.unbindResumeEvents(); },
  beforeDestroy() { this.unbindResumeEvents(); },
  methods: {
    bindResumeEvents() {
      window.addEventListener("pageshow", this.resume);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    },
    unbindResumeEvents() {
      window.removeEventListener("pageshow", this.resume);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    },
    onVisibilityChange() {
      if (document.visibilityState === "visible") this.resume();
    },
    resume() { return resumePage(this); }
  }
};
```

三个入口并不意味着请求三次，因为 `refreshFlight` 会合并它们。

页面恢复时也不一定全量刷新。可以只检查：

- 会话版本是否变化；
- 路由关键参数是否变化；
- 数据是否超过有效期；
- 从授权页返回后，目标权限是否真的获得；
- 跨天后，日期列表是否需要重建。

### 3. 提交锁要锁住任务，不只锁住点击

固定 1.5 秒的防重复点击只能改善交互，不能保证业务安全。
网络请求可能 5 秒才完成，键盘回车也可能绕过点击指令。

下面的锁按组件实例和业务键保存正在执行的 Promise：

```js
// src/plugins/submit-lock.js
// 代码已简化脱敏
const STORE = "__pendingSubmits__";

export default {
  install(Vue) {
    Vue.prototype.$withSubmitLock = function(key, task) {
      if (!this[STORE]) this[STORE] = Object.create(null);
      if (this[STORE][key]) return this[STORE][key];

      const running = Promise.resolve().then(task);
      this[STORE][key] = running.then(
        result => {
          delete this[STORE][key];
          return result;
        },
        error => {
          delete this[STORE][key];
          throw error;
        }
      );
      return this[STORE][key];
    };
  }
};
```

页面这样使用：

```vue
<!-- 代码已简化脱敏 -->
<button :disabled="submitting" @click="submit">保存</button>

<script>
export default {
  data: () => ({ submitting: false }),
  methods: {
    submit() {
      return this.$withSubmitLock("save-record", async () => {
        this.submitting = true;
        try {
          const input = this.validateAndBuildInput();
          await this.api.save(input);
          this.$toast("保存成功");
        } finally {
          this.submitting = false;
        }
      });
    }
  }
};
</script>
```

锁的 `key` 要表达业务动作，例如 `save-record`、`confirm-payment`。
同一页面的“保存草稿”和“正式提交”可以使用不同 key。

前端锁不是幂等保证。创建订单、付款等关键写操作，
后端仍应接收幂等键并保证同一个键只产生一次结果。

## 按步骤落地

### 第一步：画出会话来源

列清楚会话可能来自哪里：Cookie、URL 回调参数、内存用户对象，
并规定唯一优先级。URL 中的短期参数消费后立即清理，避免被复制传播。

### 第二步：建立会话协调器

先只接入“读取当前用户”和“处理失效”两条路径。
用一个 Promise 合并并发恢复，用版本号屏蔽迟到响应。

### 第三步：请求层只上报会话失效

请求拦截器不要直接在每个响应里弹框和跳转。
它只构造 `kind: "session"` 的错误，再交给 `expireOnce()`。

### 第四步：给缓存页补恢复规则

逐页回答：

- 首次进入由谁加载；
- `activated` 是否刷新；
- 从外部能力返回后检查什么；
- `deactivated` 要停哪些定时器；
- 多个恢复事件怎样合并。

### 第五步：关键写操作接入提交锁

优先处理创建、支付、核销、审批、上传等不能重复的动作。
按钮禁用负责反馈，Promise 锁负责正确性。

### 第六步：补失败分支

网络错误、业务错误、同步抛错、用户取消、组件销毁都要走到结束态。
不要只测试成功回调。

## 常见坑

### 坑一：用全局布尔值表示所有请求

`ajaxing = true` 无法区分加载列表和提交表单。
应该按任务保存 Promise，至少按页面与业务 key 隔离。

### 坑二：失败后没有清空 flight

失败 Promise 如果一直缓存，后续重试只会不断得到同一个失败。
成功和失败两条分支都必须清空。

### 坑三：`activated` 与 `mounted` 各请求一次

首次进入缓存页可能连续触发两者。
它们应调用同一个 `resume()`，由 `refreshFlight` 合并。

### 坑四：页面隐藏后定时器继续运行

缓存组件不会销毁。要在 `deactivated` 暂停，
在 `activated` 恢复，并在 `beforeDestroy` 最终清理。

### 坑五：点击防抖等于防重复提交

定时防抖只挡住一小段时间，不能覆盖慢请求、回车提交或程序调用。
关键写操作必须锁 Promise，服务端必须做幂等。

### 坑六：直接相信支付或授权回调

回调只说明宿主流程结束，不代表服务端业务已完成。
页面恢复后应查询服务端最终状态。

## 测试与清单

### 自动测试建议

- [ ] 同时调用五次 `ensureSession()`，底层 API 只执行一次；
- [ ] 恢复失败后再次调用，可以重新发起请求；
- [ ] 三个旧响应同时报失效，只调用一次 `goToLogin()`；
- [ ] `mounted`、`activated`、`pageshow` 连续触发，只刷新一次；
- [ ] 提交中再次点击，返回同一个 Promise，任务只执行一次；
- [ ] 任务同步抛错、异步失败后都能再次提交；

### 真机检查

- [ ] 微信 WebView 内登录、取消登录和登录回跳；
- [ ] 切到后台 30 秒后返回；
- [ ] 从相册、地图、授权或系统设置返回；
- [ ] 弱网下连续点击提交；
- [ ] 请求超时、断网恢复后再次提交；
- [ ] 缓存页跨天或关键参数变化后刷新正确。

### 发布前清单

- [ ] 会话只有一个统一失效入口；
- [ ] 回跳地址只允许站内路径；
- [ ] 每个 loading 在成功和失败后都会结束；
- [ ] 每个监听器和定时器都有对应清理；
- [ ] 关键写操作同时具备前端锁和后端幂等；
- [ ] 错误日志不包含会话值、手机号等隐私数据。

最后记住：会话恢复只属于协调器，页面恢复只进入一个 `resume()`，写操作的锁跟随 Promise。这样大部分“偶现”问题都能稳定复现和测试。
