---
title: Vue 2 多端共存工程治理：PC 后台与移动 H5
description: 从组件库边界、路由、请求层、权限、构建到渐进迁移，整理一套适合长期业务系统的 Vue 2 多端治理方法。
---

# Vue 2 多端共存工程治理：PC 后台与移动 H5

一套业务同时存在 PC 后台、普通移动 H5、微信内 H5，真正困难的通常不是“如何复用一个按钮”，而是如何让几个运行环境在长期迭代中仍遵守同一组规则。PC 端重表格、树、弹窗和批量操作；移动端重触摸、弱网、页面恢复和宿主能力。强行共享视觉组件，往往会得到大量条件分支；完全各写一套，又会让鉴权、错误码和接口语义逐渐分叉。

更稳妥的目标是：

- 共享领域契约、会话语义、错误分类和工程规则；
- 隔离 PC 与移动端的视觉组件、交互模型和宿主能力；
- 让旧的 Vue 2 与 Webpack 工程可以被持续维护，并有节奏地迁移；
- 把菜单、路由、权限和后端授权看成一条完整链路，而不是四份互不相干的配置。

本文来自多类长期运行项目的脱敏归纳。所有名称、路径、数据结构和示例代码均为重新设计的泛化示例，不对应任何真实系统。

## 先把“多端”拆成三层

很多多端项目一开始就讨论组件复用率，却没有先定义哪些东西应该相同。可以把系统拆成三层：

~~~text
┌─────────────────────────────────────────────────────────────┐
│ 领域与协议层                                                │
│ DTO、错误码、权限码、分页语义、日期与金额规则、幂等语义     │
└───────────────────────┬─────────────────────────────────────┘
                        │ 可跨端共享
┌───────────────────────▼─────────────────────────────────────┐
│ 应用编排层                                                  │
│ 会话恢复、请求策略、路由守卫、权限判断、埋点事件、用例服务   │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
┌──────────────▼──────────────┐ ┌──────────▼─────────────────┐
│ PC 展现层                   │ │ 移动 H5 展现层             │
│ 表格、树、抽屉、批处理      │ │ 列表、滑动、底部弹层、触摸 │
│ 键鼠与大屏信息密度          │ │ 安全区、软键盘、宿主桥接   │
└─────────────────────────────┘ └────────────────────────────┘
~~~

这个分法带来一个关键判断：**复用能力，不复用偶然相同的外观**。

例如“选择一组成员”是可共享的领域能力；PC 端可以使用树形穿梭框，移动端可以使用搜索列表与底部确认栏。两端共享的是输入输出契约：

~~~js
// 完全虚构的跨端契约
// 输入：当前选择、是否允许多选
// 输出：只包含稳定标识和显示文本
{
  selected: [{ id: "demo-1", label: "示例项" }],
  multiple: true
}
~~~

若共享层开始出现 isMobile、isPc、isInWechat 等分支，它通常已经放错了位置。

## 组件库边界：一端一个主库，例外必须有理由

长期项目中同时出现多个 UI 库并不罕见。问题不在于“依赖数量超过一”，而在于没有明确谁负责什么。

推荐建立这样的边界：

| 场景 | 主组件体系 | 可接受的补充 | 不应出现 |
| --- | --- | --- | --- |
| PC 后台 | PC 组件库 | 高级表格、富文本、图表等专用组件 | 为一个弹窗引入完整移动组件库 |
| 移动 H5 | 移动组件库 | 滚动、上传、预览等确有优势的能力 | 在手机页面直接复用 PC 表单布局 |
| 领域组件 | 自有薄封装 | 只依赖本端主组件库 | 同一组件内根据终端切换两套 UI 库 |
| 无界面逻辑 | 普通 JavaScript 模块 | 浏览器能力适配器 | 直接 import 任一 UI 组件 |

以常见 Vue 2 技术栈举例：PC 可以把 Element UI 作为主库，仅在高级表格场景引入 vxe-table；移动端则在 Vant 与 cube-ui 中选定一个主库，另一个只保留少数有明确收益的存量能力。这里的重点不是库名，而是每个页面只有一个主交互体系，例外通过适配器进入，并有退出计划。

### 不要做“大而全”的二次组件库

二次封装的目标不是抹平所有组件库差异，而是稳定团队真正依赖的少量契约，例如：

- 反馈：toast、confirm、loading；
- 表单：字段错误展示、提交态；
- 数据态：loading、empty、error、ready；
- 文件：选择、上传、预览；
- 选择器：单选、多选、分页搜索。

一个薄适配器可以只暴露产品需要的语义：

~~~js
// ui/feedback.js，示例仅表达边界
export function createFeedback(driver) {
  return {
    info(message) {
      driver.toast({ message, tone: "info" });
    },
    async confirm(options) {
      return driver.confirm({
        title: options.title || "请确认",
        message: options.message,
        confirmText: options.confirmText || "确定"
      });
    },
    withLoading(task, text) {
      const close = driver.loading(text || "处理中");
      return Promise.resolve()
        .then(task)
        .finally(close);
    }
  };
}
~~~

PC 和 H5 分别注入自己的 driver。业务页面不需要知道底层来自哪个组件库，也不会因替换一个 toast 组件而全局搜索修改。

### 全局注册要有预算

Vue 2 项目很容易在 main.js 中不断 Vue.use、Vue.component 和 Vue.prototype 挂载。短期方便，长期会产生三个问题：

1. 首屏无条件加载越来越多代码和样式；
2. 任意页面都能访问大量隐式依赖，测试困难；
3. 名称冲突和升级影响无法定位。

可以制定简单预算：

- 入口只注册路由、状态、主题、错误边界和高频基础能力；
- 只在多数页面使用的轻量组件才全局注册；
- 富文本、图表、导出、视频、裁剪等按路由或组件懒加载；
- 新增 Vue.prototype 属性必须有类型说明、所有权和替换计划；
- 每季度输出一次入口依赖和首屏包体报告。

## 路由不是页面清单，而是应用状态机

PC 与 H5 的路由形态不同，但都需要一份明确的路由契约。

### 统一路由元数据的含义

不要让 meta 变成随手塞字段的杂物袋。先定义一份小而稳定的 schema：

~~~js
// router/route-meta.js
export const routeMeta = {
  title: "示例页面",
  auth: "required",            // required | optional | guest
  permissions: ["record.read"],
  shell: "workspace",          // 使用哪种页面外壳
  cache: "route",              // none | route | params
  depth: 2,                    // 只用于转场，不承担权限含义
  capabilities: ["camera"]     // 页面声明需要的宿主能力
};
~~~

规则应写进评审清单：

- title 只负责标题；
- auth 只描述登录要求；
- permissions 使用稳定权限码，不使用角色名称；
- cache 必须说明缓存键和失效条件；
- depth 只负责导航转场；
- shell 决定布局，不通过路径字符串猜测。

### PC：服务端菜单只能投影到本地注册表

后台系统常见“服务端返回菜单，前端动态生成路由”。这能支持组织和权限变化，但不能把服务端字符串直接当成任意模块路径。安全、可构建、可重构的做法是：

~~~text
服务端菜单项
   │ 仅包含 routeKey、父子关系、显示信息、权限码
   ▼
校验与规范化
   │ 未知 key 拒绝；重复路径拒绝；循环结构拒绝
   ▼
本地页面注册表
   │ routeKey -> 明确的异步 import
   ▼
权限过滤 -> 动态路由 -> 侧边菜单
~~~

~~~js
// router/page-registry.js
const pages = Object.freeze({
  "workspace.home": () => import("../pages/workspace/Home.vue"),
  "record.list": () => import("../pages/record/List.vue"),
  "record.detail": () => import("../pages/record/Detail.vue")
});

export function resolvePage(routeKey) {
  const loader = pages[routeKey];
  if (!loader) {
    throw new Error("Unknown route key: " + routeKey);
  }
  return loader;
}
~~~

注册表是前后端之间的安全边界。服务端控制“用户能看见哪些已发布能力”，前端构建仍决定“发布包里究竟有什么代码”。

动态路由恢复的顺序也要固定：

~~~text
进入受保护页面
  -> 检查本地会话
  -> 会话存在但用户上下文为空
  -> 并发复用一次 getCurrentUser
  -> 拉取菜单与权限
  -> 校验并生成路由
  -> addRoutes
  -> replace 原目标地址
~~~

最后一步必须 replace，而不是再次 push，否则浏览器后退可能回到“尚未注入路由”的中间状态。

### H5：优先按页懒加载，明确缓存语义

页面很多时，静态 import 全部页面会放大首屏下载、解析和执行成本。H5 路由默认应使用异步 import，并按业务域拆分路由模块。需要特别说明：异步 import 只改变产物分块和运行时加载时机，Webpack 构建仍会解析这些模块，语法错误仍应在 CI 构建阶段直接失败。

keep-alive 不是性能开关，而是一种状态承诺。启用前要回答：

- 返回页面时保留滚动位置还是重新定位？
- 查询条件是恢复还是重置？
- 登录态、租户或关键参数变化后，缓存是否仍有效？
- 页面在 activated 时需要重新核对哪些数据？
- 监听器是在 deactivated 暂停，还是只在 beforeDestroy 清理？

如果路由以参数区分不同对象，单纯按组件 name 缓存会串状态。此时要么为 router-view 提供包含关键参数的 key，要么让页面在参数变化时显式重置。

### 不要吞掉所有重复导航错误

把 Router.prototype.push 的所有异常都 catch 后返回，会顺带吞掉真正的路由加载失败。应只忽略确定的重复导航，其余错误继续抛出并上报：

~~~js
export function safePush(router, target) {
  return router.push(target).catch(error => {
    if (error && error.name === "NavigationDuplicated") {
      return router.currentRoute;
    }
    throw error;
  });
}
~~~

上例以 router.push 返回 Promise 的 Vue Router 3.1 及以上版本为前提。锁定在早期 3.0.x 的项目中，push 可能返回 undefined，应使用它提供的完成/中止回调做兼容封装，或先完成路由库的小版本升级；不要在全局原型上直接追加 catch。无论采用哪种版本，原则都是先准确识别“同一路由重复导航”，其他 chunk 加载、守卫和组件异常必须继续上抛。

## 请求层：统一语义，允许协议暂时不同

多端系统最值得共享的是请求语义，而不是某个 axios 实例。

推荐把请求过程分成五层：

~~~text
页面用例
  -> API 模块（业务动作与参数）
  -> 协议适配（旧/新响应归一化）
  -> HTTP 客户端（超时、取消、重试、鉴权）
  -> 浏览器传输（axios / fetch / XMLHttpRequest）
~~~

页面不应拼接域名、会话参数、租户参数，也不应识别多个历史错误字段。

### 先定义归一化结果

~~~js
// transport/result.js
export function normalizeEnvelope(payload) {
  if (payload && payload.ok === true) {
    return { ok: true, data: payload.data, traceId: payload.traceId || "" };
  }

  return {
    ok: false,
    error: {
      kind: classifyCode(payload && payload.code),
      code: String((payload && payload.code) || "UNKNOWN"),
      message: (payload && payload.message) || "请求失败",
      retryable: Boolean(payload && payload.retryable)
    }
  };
}

function classifyCode(code) {
  if (code === "SESSION_EXPIRED") return "auth";
  if (code === "FORBIDDEN") return "permission";
  if (code === "VALIDATION_FAILED") return "validation";
  return "business";
}
~~~

旧接口可以各有 adapter，但 adapter 之后只能有一种结果。页面最终只处理：

- 成功；
- 可展示的业务失败；
- 字段校验失败；
- 会话失效；
- 权限不足；
- 网络、超时或取消。

### 一个可维护客户端应具备什么

~~~js
// transport/client.js，完全原创的示意实现
export function createClient(http, session, context) {
  function normalizeHttpFailure(response) {
    if (response.status === 401) {
      return {
        ok: false,
        error: { kind: "auth", code: "HTTP_401", retryable: false }
      };
    }
    if (response.status === 403) {
      return {
        ok: false,
        error: { kind: "permission", code: "HTTP_403", retryable: false }
      };
    }
    const result = normalizeEnvelope(response.data);
    if (!result.ok) return result;
    return {
      ok: false,
      error: {
        kind: "http",
        code: "HTTP_" + response.status,
        message: "服务暂时不可用",
        retryable: response.status >= 500
      }
    };
  }

  async function handleResult(result, requestSession) {
    if (!result.ok && result.error.kind === "auth") {
      try {
        // expireOnce 由 session 协调器实现：校验旧会话快照、合并并发恢复，
        // 并在完成或失败后释放 flight。
        await session.expireOnce(requestSession);
      } catch (error) {
        return {
          ok: false,
          error: {
            kind: "auth",
            code: "SESSION_RECOVERY_FAILED",
            message: "登录恢复失败",
            retryable: true
          }
        };
      }
    }
    return result;
  }

  async function request(config) {
    const headers = Object.assign({}, config.headers, {
      "X-Request-Id": makeRequestId(),
      "X-Client-Context": context.current()
    });

    const requestSession = session.snapshot();
    if (requestSession.credential) {
      headers.Authorization = "Bearer " + requestSession.credential;
    }

    let response;
    try {
      response = await http({
        method: config.method || "GET",
        url: config.url,
        data: config.data,
        params: config.params,
        headers,
        timeout: config.timeout || 15000,
        signal: config.signal
      });
    } catch (error) {
      if (isCanceled(error)) {
        return { ok: false, error: { kind: "canceled", retryable: false } };
      }
      // axios 默认把非 2xx 放入 catch，必须先处理服务端响应，
      // 不能把 401/403 误判成断网。
      if (error.response) {
        return handleResult(
          normalizeHttpFailure(error.response),
          requestSession
        );
      }
      return {
        ok: false,
        error: {
          kind: isTimeout(error) ? "timeout" : "network",
          message: isTimeout(error) ? "请求超时" : "网络不可用",
          retryable: true
        }
      };
    }

    return handleResult(
      normalizeEnvelope(response.data),
      requestSession
    );
  }

  return { request };
}
~~~

这里有几个容易忽略的细节：

- axios 默认拒绝非 2xx，catch 中要先检查 error.response，401/403 不能归为网络错误；
- session.expireOnce 应比较“发出请求时的会话快照”与当前代次，并按代次合并恢复；旧响应不得使新会话再次跳登录；
- 会话优先放在安全合适的请求头中；若历史协议只能放查询参数，也应集中在适配层并计划迁移；
- URL、query 和表单编码必须使用标准编码器，不要手写字符串拼接；
- 超时必须存在，且页面必须能从 loading 状态退出；
- GET 等幂请求可有限重试，创建、支付、提交等写操作不能盲目重试；
- 路由离开时取消只服务于旧页面的查询，避免旧响应覆盖新页面；
- 并发网络错误只显示一次全局提示，字段错误仍由表单局部展示；
- loading 使用引用计数或请求所有权，不能让先结束的请求关闭后发请求的遮罩。

### API 模块表达业务动作

~~~js
// api/records.js
export function createRecordApi(client) {
  return {
    list(query, signal) {
      return client.request({
        url: "/api/records",
        params: query,
        signal
      });
    },
    update(id, draft, idempotencyKey) {
      return client.request({
        method: "PUT",
        url: "/api/records/" + encodeURIComponent(id),
        data: draft,
        headers: { "Idempotency-Key": idempotencyKey }
      });
    }
  };
}
~~~

页面看到的是 list、update，而不是 Content-Type、baseURL、会话和历史错误码。

## 权限：四层必须同时成立

前端隐藏按钮不是授权。完整权限链路至少包含四层：

| 层级 | 职责 | 失败时的行为 |
| --- | --- | --- |
| 身份认证 | 当前是谁、会话是否有效 | 进入登录恢复流程 |
| 页面授权 | 是否可进入某路由 | 跳转无权限页 |
| 操作授权 | 是否显示或启用某动作 | 隐藏或解释性禁用 |
| 服务端授权 | 是否允许读取或修改资源 | 返回稳定的 401/403 或业务权限错误 |

路由和按钮应使用权限码，不要使用“管理员”“普通用户”等易变化角色：

~~~js
export function canAccess(grants, required) {
  if (!required || required.length === 0) return true;
  const owned = new Set(grants || []);
  return required.every(code => owned.has(code));
}
~~~

如果某操作满足“任一权限即可”，应显式提供 anyOf，而不是暗中改变 every 的语义。

### 切换组织上下文是一场小型重新登录

PC 后台常允许切换组织、门店或工作空间。上下文一旦变化，下列状态都可能失效：

- 用户资料中的上下文信息；
- 菜单和动态路由；
- 已打开标签页；
- Vuex 中的领域缓存；
- 正在执行的请求；
- WebSocket 或 SSE 订阅；
- 本地筛选条件和草稿。

推荐顺序：

~~~text
锁定切换操作
  -> 取消旧上下文请求与订阅
  -> 服务端确认新上下文
  -> 清空上下文相关状态
  -> 重新拉取身份、权限与菜单
  -> 重建动态路由
  -> 跳到新上下文首页
  -> 解锁
~~~

不要只改一个 cookie 后刷新当前页。那会让旧权限、旧页面缓存和新请求混在同一进程里。

## 状态管理：Vuex 只保存跨页面事实

Vue 2 工程变大后，Vuex 很容易成为“任何地方不方便传参就塞进去”的仓库。判断一个状态是否进入 Vuex，可以问三个问题：

1. 是否有两个以上不相邻页面需要它？
2. 是否需要跨路由保留？
3. 是否有明确的创建、失效和清理时机？

三个问题都是否，就留在页面或领域组件内。

建议把全局状态分为：

- session：身份、权限和当前上下文；
- navigation：动态路由、菜单、标签页；
- preferences：主题、密度、语言等用户偏好；
- connectivity：网络、长连接状态；
- 极少数真正跨页的业务草稿。

列表数据、弹窗显隐、表单校验、当前页 loading 通常不属于全局状态。持久化也应谨慎：会话与偏好可以有明确策略，接口响应和临时对象不应无差别写入 localStorage。

## 构建治理：环境、产物和运行时必须解耦

老 Vue 2 项目常同时存在 development、test、preview、production 等构建命令。这本身没有问题，危险的是把环境差异散落在源码条件判断中。

### 环境配置只描述部署差异

推荐一份显式 schema，并在构建开始时校验：

~~~js
const schema = {
  APP_ENV: ["development", "test", "preview", "production"],
  API_BASE: "url",
  ASSET_BASE: "url",
  RELEASE_ID: "non-empty-string"
};

export function validateBuildEnv(env) {
  const missing = Object.keys(schema).filter(key => !env[key]);
  if (missing.length) {
    throw new Error("Missing build variables: " + missing.join(", "));
  }
}
~~~

源代码只读取经过校验的 config，不直接读取几十个 process.env 字段。密钥不属于前端环境变量；写进构建变量最终仍会进入浏览器产物。

### 每种产物都要可定位

发布产物至少包含：

- releaseId 或提交版本；
- 构建环境；
- 构建时间；
- 静态资源 content hash；
- 可选且受控的 source map 上传流程；
- 一份资产清单，便于回滚和排查缓存。

浏览器缓存建议：

~~~text
HTML：短缓存或 no-cache，确保能发现新版本
带 hash 的 JS/CSS/图片：长缓存 + immutable
接口响应：由业务语义决定，不能沿用静态资源策略
~~~

gzip 或 brotli 是否生效由服务器响应决定，仅在构建目录生成压缩文件并不等于线上会使用。

旧工程还要区分“语法转译”和“运行时补丁”：Babel 能把部分新语法转成旧语法，却不会天然补齐 Promise.prototype.finally、URLSearchParams、AbortController 等 Web API。所有示例能力都要对照最低浏览器矩阵确认；需要 polyfill 时统一在入口按需加载并计入包体，不需要时则用兼容写法，不能只看现代桌面浏览器构建成功。

### 给包体和入口设置硬预算

可在 CI 中记录：

- PC 与 H5 的首屏 JS、CSS 体积；
- 最大异步 chunk；
- 重复依赖；
- 路由同步 import 数量；
- 全局注册组件数量；
- 构建耗时与 Node 版本；
- source map 是否意外进入公开目录。

预算不一定一开始就很严格，但必须“只能通过评审提高”，不能每次悄悄上涨。

## Vue 2 迁移：先造边界，再换引擎

长期业务系统不适合把“升级 Vue、Webpack、UI 库、路由、状态管理”合成一次大爆炸迁移。更现实的是绞杀者路线：

~~~text
阶段 0：锁定运行基线
  Node 版本、包管理器、构建命令、关键页面冒烟测试

阶段 1：抽离边界
  请求适配、会话服务、权限函数、环境配置、反馈适配器

阶段 2：减少隐式依赖
  清理 Vue.prototype、拆入口、路由懒加载、模块化 Vuex

阶段 3：建立新旧共存面
  新页面使用更严格的目录与测试规则，旧页面保持可运行

阶段 4：按业务域迁移
  一次迁移一条完整用户路径，并保留可回滚产物

阶段 5：移除兼容层
  使用量归零后再删除旧协议、旧组件和旧构建脚本
~~~

最先抽的不是“通用 Button”，而是副作用边界。请求、路由、会话、存储和宿主 API 有了稳定接口后，页面框架升级才不会牵动整个系统。

### 为遗留代码建立适配层，而不是永久双轨

兼容层应记录三件事：

- owner：谁负责；
- consumers：还有哪些调用方；
- deleteWhen：满足什么条件删除。

没有退出条件的兼容层，就是新的遗留系统。

## 测试策略：优先覆盖跨端共同风险

不必先追求全量组件快照。多端系统最有价值的测试顺序是：

### 1. 纯函数单元测试

- 历史响应归一化；
- 权限码 anyOf/allOf；
- 菜单树到路由树的转换；
- URL 与表单编码；
- 缓存键和失效条件；
- 错误分类与是否可重试。

### 2. 请求层测试

用假的 transport 验证：

- 超时一定结算；
- 会话失效只触发一次登录跳转；
- 取消不会显示网络错误；
- 写请求不自动重试；
- 并发 loading 正确计数；
- 请求头不携带不属于当前上下文的数据。

### 3. 路由与权限集成测试

- 未登录访问受保护地址；
- 登录回跳原地址；
- 未知服务端 routeKey 被拒绝；
- 动态路由注入后使用 replace；
- 切换上下文后旧页面和旧权限消失；
- keep-alive 页面在关键参数变化时重置。

### 4. 关键路径端到端测试

PC 至少覆盖登录、菜单、搜索、编辑、导出或批处理；H5 至少覆盖登录恢复、列表到详情、表单提交、返回恢复、弱网与宿主能力失败。

建议的最小终端矩阵：

| 终端 | 视口或宿主 | 重点 |
| --- | --- | --- |
| PC | Chrome 当前版 | 表格、弹窗、权限、下载 |
| PC | 受支持的最低版本浏览器 | 语法与样式降级 |
| H5 | iOS 微信 WebView | 返回恢复、键盘、JSSDK |
| H5 | Android 微信 WebView | 历史栈、上传、权限 |
| H5 | 系统浏览器 | 非微信降级与提示 |

## 常见失败模式

| 失败模式 | 表面现象 | 根因 | 治理动作 |
| --- | --- | --- | --- |
| 页面同时混用多套 UI 库 | 样式覆盖、弹层层级混乱 | 没有主库和例外规则 | 一端一个主库，专用能力经适配器引入 |
| 所有组件全局注册 | 首屏越来越慢 | 入口承担了业务模块职责 | 入口预算，重组件按需加载 |
| 服务端返回任意组件路径 | 某菜单白屏或存在注入风险 | 缺少本地注册表边界 | 只接受稳定 routeKey |
| H5 路由全部同步 import | 首包过大、构建脆弱 | 把路由表当静态目录 | 路由模块化与懒加载 |
| catch 所有 push 错误 | 页面不跳但没有告警 | 真正的 chunk 错误被吞 | 只忽略重复导航 |
| 页面各自拼会话参数 | 登录行为不一致、URL 泄漏 | 请求层没有统一所有权 | 集中注入并制定迁移方案 |
| 并发请求各弹一个错误框 | 用户连续看到多个弹窗 | 全局错误无去重 | 按错误类型和时间窗口合并 |
| 动态菜单等同于安全授权 | 手改请求即可越权 | 前端可见性被误当安全边界 | 服务端逐资源授权 |
| 切换上下文只改 cookie | 数据与权限串上下文 | 缓存、路由和订阅未重置 | 按“小型重新登录”处理 |
| keep-alive 只设 true/false | 返回看到旧对象数据 | 没有缓存键和失效规则 | 明确 cache 策略与 activated 行为 |
| 一次升级全部基础设施 | 回归范围失控 | 没有先建立兼容边界 | 分阶段、按业务域迁移 |

## 评审检查清单

### 新增页面

- [ ] 页面属于 PC 还是 H5，是否只使用该端主组件体系？
- [ ] 路由 meta 是否符合统一 schema？
- [ ] 是否默认异步加载，若同步加载是否有首屏理由？
- [ ] keep-alive 的缓存键、刷新和清理规则是否明确？
- [ ] API 是否通过领域模块调用，而非页面拼 URL？
- [ ] 权限使用稳定权限码，服务端是否同步校验？
- [ ] loading、empty、error、ready 四种数据态是否完整？
- [ ] 提交操作是否有幂等或防重复机制？

### 修改请求或鉴权

- [ ] 所有成功、失败、超时、取消路径是否都会结算？
- [ ] 401、403、业务失败和字段校验是否被区分？
- [ ] 并发会话失效是否只触发一次恢复流程？
- [ ] 是否意外把令牌或敏感上下文放入 URL？
- [ ] 重试是否仅用于安全场景，并有次数与退避上限？
- [ ] 切换上下文时是否取消旧请求和订阅？

### 发布前

- [ ] 环境配置通过 schema 校验，产物不含密钥？
- [ ] releaseId、source map 和资产清单策略正确？
- [ ] HTML 与 hash 资源缓存头符合预期？
- [ ] PC、iOS 微信、Android 微信完成关键路径冒烟？
- [ ] 首屏包、最大 chunk 和重复依赖未突破预算？
- [ ] 新兼容层有 owner、调用方清单和删除条件？

## 最后的判断标准

多端治理做得好，不是所有页面看起来都由同一套组件拼出来，而是每个端都能用适合自己的交互方式，同时对以下问题给出一致答案：

- 当前用户是谁？
- 当前上下文是什么？
- 这个页面和动作是否允许？
- 一个请求成功、失败、超时或取消分别意味着什么？
- 页面离开再回来时，哪些状态应保留，哪些必须核对？
- 一个版本出了问题，怎样定位、回滚和逐步迁移？

当这些契约稳定之后，Vue 2、组件库和构建工具才真正从“系统结构”退回为“可替换的实现细节”。
