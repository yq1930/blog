---
title: Pinia 状态管理
description: 在真正需要全局状态时用 Pinia，而不是把所有数据都塞进 store。
---

# Pinia 状态管理

Pinia 是 Vue 官方推荐的状态管理库，是 Vuex 的继任者。但"该不该用 Pinia"比"怎么用 Pinia"更值得想清楚：很多项目把本该放在组件里的状态硬塞进 store，结果是数据流混乱、组件过度耦合。这一篇讲边界和正确用法。

## 先判断：真的需要 Pinia 吗

| 状态类型 | 放哪里 |
| --- | --- |
| 组件自己用的输入框值、临时展开状态 | 组件内部 `ref` / `reactive` |
| 父子之间传递的数据 | `props` + `emits` |
| 兄弟组件或跨层级共享、且会被多处修改 | Pinia store |
| 登录态、用户信息、全局配置 | Pinia store |
| 一次性请求的服务端数据 | 组件内 + 请求库（如 TanStack Query） |

判断标准：**状态是否需要被多个彼此无父子关系的组件读写**。是，就用 store；否，就留在组件里。

## 定义一个 store

Pinia 用 `defineStore` 创建 store。推荐用 setup 写法（组合式风格），它和 `<script setup>` 一致，类型推导也更好：

```js
// stores/user.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api/user'

export const useUserStore = defineStore('user', () => {
  const profile = ref(null)
  const token = ref('')

  const isLoggedIn = computed(() => !!token.value)
  const displayName = computed(() => profile.value?.name ?? '游客')

  async function login(credentials) {
    const { token: t, profile: p } = await userApi.login(credentials)
    token.value = t
    profile.value = p
  }

  function logout() {
    token.value = ''
    profile.value = null
  }

  return { profile, token, isLoggedIn, displayName, login, logout }
})
```

在组件里用：

```vue
<script setup>
import { useUserStore } from '@/stores/user'
const user = useUserStore()
// 注意：从 store 解构 state/getter 要用 storeToRefs 保持响应式
import { storeToRefs } from 'pinia'
const { isLoggedIn, displayName } = storeToRefs(user)
// action 可以直接解构
const { login } = user
</script>
```

> 解构 state 会丢响应式，必须用 `storeToRefs`。action 是普通函数，解构没问题。

## state / getter / action 各管一摊

| 概念 | 对应 | 职责 |
| --- | --- | --- |
| state | `ref` / `reactive` | 存储数据 |
| getter | `computed` | 派生值，带缓存 |
| action | 普通函数（可 async） | 修改 state、处理副作用、调接口 |

getter 不要有副作用，它只描述"从 state 派生出来的值"。修改 state 的工作放在 action 里，调用方调 action 即可，不需要知道内部结构。

## 持久化：别什么都持久化

需要刷新后保留的（token、用户偏好、主题），持久化到 `localStorage`；临时性的（列表筛选、加载状态）不要持久化。常见做法是在 action 里手动写，或用 `pinia-plugin-persistedstate`：

```js
defineStore('user', () => { /* ... */ }, {
  persist: {
    paths: ['token', 'theme'] // 只持久化这些字段
  }
})
```

> 整个 store 无脑持久化会让旧版本数据残留，导致升级后页面异常。给持久化数据加版本号，升级时清理。

## 多 store 协作

store 之间可以互相调用：

```js
// stores/cart.js
import { useUserStore } from './user'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  async function checkout() {
    const user = useUserStore()
    if (!user.isLoggedIn) throw new Error('请先登录')
    return orderApi.create({ items: items.value, token: user.token })
  }

  return { items, checkout }
})
```

> 避免循环依赖。两个 store 互相 import 通常是拆分粒度问题——把共享部分抽到第三个 store。

## 与组件状态的关系

store 不是"更高级的 ref"。组件自己用一次的数据放组件里，别为了"统一管理"全塞进 store。一个判断技巧：如果某段状态从 store 里拿出来，组件行为完全不变，那它本来就不该在 store 里。

## SSR 注意

Nuxt / SSR 场景下，store 是单例还是每请求一个，决定了是否会串数据。Pinia 在 SSR 下要求**每次请求创建新的 pinia 实例**，避免不同用户共享同一份 state。Nuxt 集成 Pinia 时它会自动处理，但如果你手动用 `pinia-plugin-*` 之类的插件，要确认插件本身支持 SSR，否则会在服务端泄漏到下一个请求。

## 检查表

- 先判断是否真需要跨组件共享，能放组件就放组件。
- setup 写法定义 store，state/getter/action 各司其职。
- 解构 state 用 `storeToRefs`，action 直接解构。
- 持久化只保留真正需要的字段，并加版本号便于升级清理。
- SSR 下每请求新建 pinia 实例，插件确认支持 SSR。
