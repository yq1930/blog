---
title: Pinia 状态管理
description: Pinia 的 store 本质上是“全应用共用一份的组合式函数”。讲清什么该放进 store，修复解构丢失响应式、在组件外使用报 getActivePinia 错误、退出登录数据残留、旧的持久化数据让新版本出错等问题。
---

# Pinia 状态管理

Pinia 是 Vue 官方推荐的状态管理库。它的 API 很简单，真正容易出问题的是这些地方：

- 从 store 里解构出 `userName`，修改 store 后页面不更新；
- 在 Axios 拦截器文件顶部调用 `useUserStore()`，应用启动就报错；
- 退出登录换了个账号，页面上还是上个人的信息；
- 发布新版本后，老用户一打开就白屏，清了缓存才好。

这篇先讲 store 的本质，再逐个解决这些问题。

::: tip 读完这篇你会
- 判断哪些状态应该放进 store
- 用 setup 写法定义 store，正确地在组件和普通模块中使用
- 处理好重置、持久化和多个 store 之间的协作
:::

## 1. 原理：store 是全应用共用一份的组合式函数

如果你写过组合式函数，Pinia 的 setup store 看起来几乎一模一样。区别只有一个：**组合式函数每调用一次就创建一份新状态；store 在整个应用里只创建一次，所有组件拿到的是同一份**。

可以把组件内部状态想成每个人自己的笔记本，store 则是公司的公告栏：所有人看的是同一块板子，谁改了，大家都能看到。

正因为是“公告栏”，放进去的东西要有节制：

| 状态 | 放在哪里 |
| --- | --- |
| 组件自己的输入值、展开状态 | 组件内部 `ref` |
| 父子组件之间传递的数据 | props + 事件 |
| 当前登录用户、权限、主题、购物车 | Pinia store |
| 列表、详情等服务端数据 | 组件 / 组合式函数，或 TanStack Query 这类缓存库 |

判断技巧：**如果把某段状态从 store 搬回组件里，功能完全不受影响，那它本来就不该在 store 里。**

## 2. 定义和使用 store

推荐 setup 写法，和 `<script setup>` 的风格一致：

```js
// stores/user.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  // state：用 ref 定义
  const profile = ref(null)
  const token = ref('')

  // getter：用 computed 定义，只做计算，不改数据
  const isLoggedIn = computed(() => Boolean(token.value))
  const displayName = computed(() => profile.value?.name ?? '游客')

  // action：普通函数，负责修改 state 和调用接口
  async function login(credentials) {
    const result = await authApi.login(credentials)
    token.value = result.token
    profile.value = result.profile
  }

  function $reset() {
    profile.value = null
    token.value = ''
  }

  return { profile, token, isLoggedIn, displayName, login, $reset }
})
```

修改 state 的逻辑尽量收进 action，而不是散落在各个组件里直接赋值。这样“谁在什么时候改了它”只需要看 action。

## 3. 坑一：解构之后，页面不更新了

**现象**：

```js
const user = useUserStore()
const { displayName } = user // ❌ 拿到的是此刻的一个字符串
```

登录成功后，页面上的名字还是“游客”。

**原因**：store 本身是一个响应式对象，直接解构会把属性的**当前值**取出来，和 store 的联系就断了。

**修复**：state 和 getter 用 `storeToRefs` 解构，它会把每个属性转成 ref；action 是普通函数，可以直接解构：

```js
import { storeToRefs } from 'pinia'

const user = useUserStore()
const { displayName, isLoggedIn } = storeToRefs(user) // ✅ 保持响应
const { login } = user                                  // action 直接解构即可
```

不解构、直接在模板里写 `user.displayName` 也完全没问题。

## 4. 坑二：在组件外面用 store，启动就报错

**现象**：应用启动时报错：

```text
[🍍]: "getActivePinia()" was called but there was no active Pinia.
Are you trying to use a store before calling "app.use(pinia)"?
```

```js
// api/http.js
import { useUserStore } from '@/stores/user'
const user = useUserStore() // ❌ 模块被导入时就执行了，此时 pinia 还没安装

http.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${user.token}`
  return config
})
```

**原因**：`useUserStore()` 需要知道当前使用的是哪个 pinia 实例。在组件里调用时没问题；在普通模块的顶层调用时，这行代码在文件被导入时就执行了，往往早于 `app.use(pinia)`。

**修复**：把调用放进**函数里面**，等真正用到时再获取 store：

```js
http.interceptors.request.use((config) => {
  const user = useUserStore() // ✅ 拦截器执行时，pinia 早已安装
  if (user.token) config.headers.Authorization = `Bearer ${user.token}`
  return config
})
```

路由守卫同理：在 `beforeEach` 的回调里调用，而不是在 router 文件的顶层。

## 5. 坑三：退出登录后，上一个用户的数据还在

**现象**：A 退出登录，B 在同一台设备上登录，个人中心短暂显示着 A 的头像和订单数量。

**原因**：store 在整个应用生命周期里一直存在，退出登录只清了 token，其他 store 里的数据原封不动。

**修复**：退出登录时，统一重置所有和用户相关的 store：

```js
async function logout() {
  await authApi.logout()
  useUserStore().$reset()
  useCartStore().$reset()
  useMessageStore().$reset()
  router.replace('/login')
}
```

选项式写法的 store（`state: () => ({...})`）自带 `$reset()`；setup 写法的 store 需要像上面那样自己实现一个。更省心的办法是退出后整页跳转到登录页，内存里的状态会全部清空。

## 6. 坑四：发布新版本后，老用户打开就白屏

**现象**：新版本把 `profile.name` 改成了 `profile.nickname`。部分老用户打开页面白屏，报 `Cannot read properties of undefined`；清除浏览器缓存后恢复正常。

**原因**：store 的数据被持久化到了 `localStorage`。新代码启动时读回了**旧结构**的数据，按新结构去访问就出错了。

**修复**：

- **只持久化真正需要的字段**，比如 token、主题，不要整个 store 都存；
- **给持久化数据加版本号**，读取时版本不对就丢弃或迁移：

```js
const STORAGE_KEY = 'app-settings'
const VERSION = 2

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.version === VERSION) return saved.data
  } catch {
    // 数据损坏，当作没有
  }
  return { theme: 'system' } // 版本不对或读取失败，使用默认值
}
```

使用 `pinia-plugin-persistedstate` 这类插件时，同样只选择需要的字段（新版本的配置项是 `pick`，旧版本叫 `paths`，以所用版本的文档为准）。

## 7. 坑五：两个 store 互相引用

**现象**：store A 在初始化时读取 store B 的数据，store B 初始化时又读取 store A，页面卡死或报错。

**原因**：两个 store 在创建过程中互相等待对方，形成循环。

**修复**：在 action 或 getter **内部**再去获取另一个 store，不要在 store 的初始化阶段就读取对方的状态：

```js
export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  async function checkout() {
    const user = useUserStore() // 用到时再获取
    if (!user.isLoggedIn) throw new Error('请先登录')
    return orderApi.create({ items: items.value })
  }

  return { items, checkout }
})
```

如果两个 store 总是需要对方，说明拆分的粒度有问题，可以把共享的部分抽到第三个 store。

## 8. 服务端渲染要注意什么

在服务器上，同一个 Node 进程会处理很多用户的请求。如果 store 是全局单例，A 用户请求时写进去的数据，B 用户的请求也会读到。Pinia 要求**每个请求创建一个新的 pinia 实例**。用 Nuxt 时框架会自动处理；自己搭建 SSR 或使用第三方 Pinia 插件时，要确认它们支持这一点。

## 排查思路

1. **Vue Devtools 的 Pinia 面板**：查看每个 store 的当前状态，时间线里能看到每一次 action 调用和状态变化。
2. **追踪是谁改了状态**：

```js
const user = useUserStore()
user.$subscribe((mutation, state) => {
  console.trace('user store 变化', mutation.type, state) // 打印调用栈
})
user.$onAction(({ name, args }) => {
  console.log('调用 action：', name, args)
})
```

3. **页面不更新**：先检查是否直接解构了 store。
4. **只有老用户出问题**：检查 `localStorage` 里持久化的数据结构是否和当前代码匹配。

## 检查清单

- [ ] 只有真正全局共享的客户端状态才放进 store
- [ ] 修改 state 的逻辑收进 action
- [ ] 解构 state 和 getter 时使用 `storeToRefs`
- [ ] 在普通模块里使用 store 时，在函数内部调用 `useXxxStore()`
- [ ] 退出登录时重置所有用户相关的 store
- [ ] 持久化只选必要字段，并带版本号
- [ ] 跨 store 调用放在 action / getter 内部

## 延伸阅读

- [前端状态管理](/web/frontend/state-management)：状态应该放在哪里
- [组合式函数与逻辑复用](/web/vue/composables)：store 和组合式函数的区别
- [SSR 与 Nuxt 入门](/web/vue/ssr)：服务端渲染下的状态隔离
