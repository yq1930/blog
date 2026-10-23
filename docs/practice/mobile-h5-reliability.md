---
title: 移动 H5 不再“偶尔失灵”：会话、页面恢复与提交锁
description: 微信内 H5 偶尔连跳两次登录、返回后还是旧数据、点一次生成两条记录、失败后按钮一直“提交中”。这些都是多个异步操作同时运行却没人负责。用会话 single-flight、生命周期恢复和提交锁三个小改造解决，并附两个真实修复案例。
---

# 移动 H5 不再“偶尔失灵”：会话、页面恢复与提交锁

移动 H5 最难查的问题，往往带着“偶尔”两个字：

- 偶尔连续跳转两次登录页；
- 从微信授权页回来，页面上还是旧数据；
- 用户只点了一次，却生成了两条记录；
- 请求失败后，按钮一直显示“提交中”；
- 本地浏览器一切正常，一到微信 WebView 里就复现。

这些现象通常不是随机错误，而是**多个异步操作同时在运行，却没有人规定“谁负责、什么时候结束、能执行几次”**。

本文只做三个小改造：**会话 single-flight、生命周期恢复、提交锁**。

::: info 关于示例
本文来自两个长期运行的 Vue 2 移动 H5 项目的只读归纳。下文代码已简化脱敏，业务页面、路由、接口、域名、凭据、用户数据、品牌名称和内部常量均已替换。
:::

::: tip 读完这篇你会
- 首屏五个请求同时发现登录过期时，只恢复一次会话、只跳一次登录
- 页面被 `keep-alive` 缓存后，返回时仍能刷新需要刷新的数据
- 从微信授权、系统设置或其他页面返回后，重新核对状态
- 让连点、慢网和异常都不会造成重复执行或永久锁死
:::

## 1. 原理：门锁坏了，只需要一个人去找物业

想象五个人同时发现宿舍门锁坏了。如果每个人都分别去找物业、各自换一把锁，就会乱成一团。合理的做法是：**第一个人去找物业，其他人等他回来，拿到同一把新钥匙**。这就是 **single-flight**：同一时间只执行一个任务，后来者复用第一个任务的结果（同一个 Promise）。

还有一个细节：锁换了之后，**旧钥匙就作废了**。如果有人拿着旧钥匙回来说“锁坏了”，不需要再去找一次物业。代码里用一个版本号 `revision` 来表示“当前是第几把锁”。

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

研究的 H5 工程使用 Vue 2、Vue Router 和移动组件库，运行在普通浏览器、微信 WebView 或企业容器中。代码里已经有一些正确的方向：路由 `meta` 标记页面是否缓存、缓存页用 `activated` / `deactivated` 启停定时器、请求封装统一附加会话标识、公共的 `$withSubmitLock(key, task)` 复用同一个进行中的任务。同时也有典型的历史遗留：登录跳转分散在多个请求回调里；URL、Cookie 和路由参数都可能提供会话值；有的写操作只锁了按钮，没有锁住真正的异步任务；成功回调解锁了，网络失败的分支却忘了解锁。

所以治理不该从重写页面开始，而是先统一三条公共规则。

## 2. 改造一：会话恢复只运行一次

### 坑一：同时连跳两次登录

**现象**：登录过期后打开首页，页面同时发出五个请求，五个都收到“会话失效”，各自跳转登录，用户看到页面闪了好几次，有时还在登录页之间循环。

**修复**：不要让每个页面自己判断 Cookie、自己请求当前用户、自己跳转登录，把它们收进一个**会话协调器**：

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

失效处理和恢复任务分开：它只清除一次会话，并阻止迟到的旧响应再次跳转登录。

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

**为什么还需要 `revision`？** 假设一个旧请求稍晚才返回“会话失效”。第一个响应已经清理了会话并跳转，后来的旧响应发现版本号不同，就不会再跳转一次。

如果登录方式是整页 OAuth 授权，`goToLogin()` 要保存**同源**的回跳路径，然后使用 `location.replace()`；不要把任意外部 URL 当作回跳目标，否则会被利用做钓鱼跳转。

**怎么避免再犯**：请求拦截器不在每个响应里弹框和跳转，只构造 `kind: "session"` 的错误交给 `expireOnce()`。还有一个容易漏的细节：**失败时也要清空 flight**，否则失败的 Promise 被一直缓存，之后的重试只会不断拿到同一个失败。

### 坑二（近期案例）：授权回来后，仍然提示未登录

**现象**：用户扫码进入页面，完成公众号授权后回来，页面仍然提示未登录。

**原因**：2026-10-23 对近期已提交改动的复核发现，一个扫码入口把公众号 H5 和另一种宿主入口的会话来源混用了。授权返回后，Cookie 里已经有可用的会话，代码却又从 URL 回填了一个会话值，进入了不适用的身份转换路径。

**修复**：明确指定入口使用 Cookie 的规则，并统一清理空值和字符串形式的无效值（比如 `"null"`、`"undefined"`），再写入本地会话存储。

**经验**：**按入口的来源选择身份协议**，而不是看到任意一个 `sid` 就无条件覆盖当前的凭据。这些处理只是格式和来源的控制，并不能证明凭据真实有效，有效性仍由服务端判断。业务路由的来源规则也要和统一请求层一起维护，避免一个页面修好了、相邻的页面还用着旧规则。

## 3. 改造二：页面恢复时重新核对事实

### 坑三：从授权页返回，页面还是旧数据

**现象**：用户在列表页点击“去授权”，授权完成返回后，列表还是授权前的样子；或者切到后台半小时再回来，数据早已过期。

**原因**：`created` 只在组件创建时运行一次。被 `keep-alive` 缓存的页面再次显示时，通常只触发 `activated`。从微信授权页、系统选择器或浏览器后台回来，还可能只触发 `pageshow` 或 `visibilitychange`。只在 `created` 里加载数据，这些情况都不会刷新。

**修复**：让这些入口都调用**同一个、可以合并的** `resume()`：

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

生命周期只负责绑定和解绑事件，真正的刷新都交给同一个函数：

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

三个入口**并不会请求三次**，因为 `refreshFlight` 把它们合并成了一次。首次进入缓存页时 `mounted` 和 `activated` 可能连续触发，也被合并了。

页面恢复时也不一定要全量刷新，可以只检查：会话版本是否变了、路由的关键参数是否变了、数据是否超过了有效期、从授权页返回后权限是否真的拿到了、跨天后日期列表是否需要重建。

### 坑四：页面隐藏后，定时器还在跑

**现象**：离开了一个带轮询的页面，Network 面板里它的请求还在不停地发。

**原因**：被缓存的组件不会销毁，定时器自然也不会停。

**修复**：在 `deactivated` 里暂停，在 `activated` 里恢复，在 `beforeDestroy` 里最终清理。上面的代码对事件监听也是这样处理的。

### 坑五：直接相信支付或授权的回调

**现象**：支付页面回调显示“成功”，就直接显示“支付成功”，实际上订单状态还没更新，用户刷新后看到“待支付”。

**修复**：回调只说明**宿主的流程结束了**，不代表服务端的业务已经完成。页面恢复后，要去查询服务端的最终状态。

## 4. 改造三：提交锁要锁住任务，而不只是锁住点击

### 坑六：加了防抖，还是提交了两次

**现象**：按钮加了 1.5 秒的防重复点击，网络慢的时候还是产生了重复的记录。

**原因**：固定时长的防抖只能挡住一小段时间。网络请求可能 5 秒才完成，键盘回车也可能绕过点击指令，程序代码里的调用更是完全不受影响。

**修复**：按组件实例和业务键，保存**正在执行的 Promise**：

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

锁的 `key` 要表达**业务动作**，比如 `save-record`、`confirm-payment`；同一个页面的“保存草稿”和“正式提交”可以用不同的 key。**按钮禁用负责反馈，Promise 锁负责正确性。**

不要用一个全局的 `ajaxing = true` 表示所有请求，它无法区分“加载列表”和“提交表单”，一个慢请求会锁住整个页面。

前端锁不是幂等保证。创建订单、付款这类关键写操作，后端仍然要接收幂等键，保证同一个键只产生一次结果，见 [事务、幂等与补偿](/practice/transactional-business-workflow)。

### 坑七（近期案例）：失败了，页面却没有任何反应

**现象**：在发起支付的页面点击按钮，偶尔什么反应都没有：没有跳转，也没有提示。

**原因**：页面只处理了“业务成功且返回了下一步链接”这一种情况，其他响应都没有可见的结果。

**修复**：近期的修复区分了三条路径：业务失败、成功但缺少必要的字段、会话失效。会话失效继续由请求层统一处理；其他业务失败和不完整的响应由页面负责展示。这样既补上了“没有提示”的分支，也避免了一次失效同时出现跳转和重复弹框。

这里描述的是“进入下一步骤”的响应处理，不代表支付已经完成，也不能证明第三方交易的最终状态。拿不到下一步的链接时，不应该伪装成操作完成。

**怎么避免再犯**：**每一个响应都要有展示的负责人**。网络错误、业务错误、同步抛错、用户取消、组件销毁，都要走到一个结束的状态，不要只测试成功的回调。

滚动失效、图片迟到和定位阻塞属于另一组时序问题，见 [H5 的数据、图片与布局就绪](/practice/h5-layout-readiness)。

## 5. 按步骤落地

1. **画出会话来源**：会话可能来自 Cookie、URL 回调参数、内存里的用户对象，规定唯一的优先级。URL 中的短期参数用完后立即清理，避免被复制传播。
2. **建立会话协调器**：先只接入“读取当前用户”和“处理失效”两条路径。
3. **请求层只上报会话失效**，交给 `expireOnce()` 处理。
4. **给缓存页补充恢复规则**：逐页回答首次进入由谁加载、`activated` 是否刷新、从外部能力返回后检查什么、`deactivated` 要停哪些定时器、多个恢复事件怎样合并。
5. **关键写操作接入提交锁**：优先处理创建、支付、核销、审批、上传等不能重复的动作。
6. **补全失败分支**，确保每条路径都有结束状态和可见的反馈。

## 排查思路

1. **在真机上复现**：用 [移动端适配](/web/frontend/mobile) 中的方法连接 iOS / 安卓调试，或者在测试环境临时注入 vConsole。
2. **看请求时序**：Network 面板里，同一时间发出了几个会话相关的请求，返回顺序如何。
3. **看生命周期**：在 `mounted`、`activated`、`pageshow`、`visibilitychange` 里打日志，确认返回页面时到底触发了哪些。
4. **弱网复现**：把网速调慢，连续点击提交，数一数发出了几个写请求。

## 检查清单

**自动测试**

- [ ] 同时调用五次 `ensureSession()`，底层 API 只执行一次
- [ ] 恢复失败后再次调用，可以重新发起请求
- [ ] 三个旧响应同时报告失效，只调用一次 `goToLogin()`
- [ ] `mounted`、`activated`、`pageshow` 连续触发，只刷新一次
- [ ] 提交中再次点击，返回同一个 Promise，任务只执行一次
- [ ] 任务同步抛错、异步失败后，都能再次提交

**真机**

- [ ] 微信 WebView 内的登录、取消登录和登录回跳
- [ ] 切到后台 30 秒后返回
- [ ] 从相册、地图、授权或系统设置返回
- [ ] 弱网下连续点击提交，请求超时、断网恢复后再次提交
- [ ] 缓存页跨天或关键参数变化后刷新正确

**发布前**

- [ ] 会话只有一个统一的失效入口，回跳地址只允许站内路径
- [ ] 每个 loading 在成功和失败后都会结束
- [ ] 每个监听器和定时器都有对应的清理
- [ ] 关键写操作同时具备前端锁和后端幂等
- [ ] 错误日志不包含会话值、手机号等隐私数据

最后记住：**会话恢复只属于协调器，页面恢复只走一个 `resume()`，写操作的锁跟着 Promise 走。** 这样大部分“偶现”问题都能稳定地复现和测试。

## 延伸阅读

- [H5 数据与布局就绪](/practice/h5-layout-readiness)：另一组 H5 时序问题
- [异步流程与 Promise](/web/JavaScript/async)：single-flight 和竞态的原理
- [Axios 请求层](/web/vue/axios)：并发 401 只刷新一次 token
