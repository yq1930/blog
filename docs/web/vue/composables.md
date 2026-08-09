---
title: 组合式函数与逻辑复用
description: 从 mixin 的混乱里走出来，用 useXxx 把状态和行为封装成可复用、可测试的单元。
---

# 组合式函数与逻辑复用

Vue 2 的 mixin 解决了"复用逻辑"，但带来了三个老问题：命名冲突、来源不清、难追踪。组合式 API（Composition API）把复用单位从"一个混入对象"变成"一个函数"，逻辑来源、依赖关系、数据流全部显式化。组合式函数（composable）就是这套机制的标准用法。

## 为什么从 mixin 走到 composable

| 问题 | mixin | composable |
| --- | --- | --- |
| 命名冲突 | 多个 mixin 同名属性互相覆盖，难排查 | 变量在函数作用域里，互不干扰 |
| 来源不清 | 模板里用了个 `fetchUser`，不知道来自哪个 mixin | 显式 `const { fetchUser } = useUser()` |
| 数据流 | 隐式注入，子组件无法知道父组件塞了什么 | 函数参数明确，返回值结构化 |
| 类型推导 | 几乎做不到 | TypeScript 友好 |

新项目别再 mixin。老项目迁移时优先把高频复用的逻辑改写成 composable。

## 写一个 composable 的套路

三个部分：声明响应式状态、定义方法、返回需要在模板里用的内容。

```js
// useCounter.js
import { ref, computed } from 'vue'

export function useCounter(initial = 0) {
  const count = ref(initial)
  const double = computed(() => count.value * 2)

  function inc() {
    count.value++
  }
  function reset() {
    count.value = initial
  }

  return { count, double, inc, reset }
}
```

使用：

```vue
<script setup>
import { useCounter } from './useCounter'
const { count, double, inc } = useCounter(10)
</script>

<template>
  <button @click="inc">{{ count }} (x2 = {{ double }})</button>
</template>
```

返回的是响应式引用，模板里自动解包；在 JS 里要用 `.value` 访问。

## 命名约定：useXxx

以 `use` 开头是强约定，它同时告诉读者和工具："这是个 composable，要在 setup 上下文里调用"。它不只是命名风格，ESLint 和 Vue 官方工具也靠这个前缀做识别。

文件名和函数名保持一致：`useCounter.js` 导出 `useCounter`。

## 生命周期在 composable 里

`onMounted`、`onUnmounted` 这些钩子可以在 composable 内部注册，前提是**在 `setup` 同步执行期间调用它**。这正是"必须在 setup 顶部调用 composable"的根本原因——异步之后再调用，钩子就注册不上了。

```js
// useMousePosition.js
import { ref, onMounted, onUnmounted } from 'vue'

export function useMousePosition() {
  const x = ref(0)
  const y = ref(0)

  function update(e) {
    x.value = e.clientX
    y.value = e.clientY
  }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```

这样组件只管用，绑定和解绑由 composable 自己负责，不会泄漏。

> 如果你的 composable 需要在异步上下文里使用生命周期，把钩子注册拆到同步路径，或返回一个让调用方在合适时机调用的 `connect()` / `disconnect()`。

## 把"依赖"通过参数传进来

composable 里直接 `import` 具体的 store、API、服务会让它和具体实现绑死，复用和测试都困难。更好的做法是把外部依赖作为参数传入：

```js
export function useUserList(fetchUsers) {
  const users = ref([])
  async function load() {
    users.value = await fetchUsers()
  }
  return { users, load }
}

// 组件里
const { users, load } = useUserList(() => userApi.list())
```

测试时传入 mock 函数，composable 完全独立可测。

## 可复用性边界：什么时候该写成 composable

写成 composable 的判断标准：

- 同一段状态 + 行为要在**两个或更多组件**里复用。
- 逻辑足够独立，不依赖具体组件的 props 结构。
- 有清晰的输入输出，内部状态对调用方有意义。

不应该写成 composable 的情况：

- 只在一个组件用、且逻辑很简单——直接写在 `<script setup>` 里更清晰。
- 纯渲染相关的展示逻辑——用 `computed` 或子组件即可。
- 跨组件共享的可变全局状态——那是 Pinia 的职责，不是 composable。

## 常见错误：在 composable 里丢了响应式

从 composable 返回值时，解构会丢掉响应式吗？不会——只要返回的是 `ref` / `computed`，解构出的本身就是响应式引用。

但下面这种写法会丢响应式：

```js
// 反例：返回的是普通值，丢失了与源数据的连接
export function useBad() {
  const list = ref([1, 2, 3])
  return { first: list.value[0] } // first 是个数字，不再响应
}

// 正例：用 computed 保持连接
export function useGood() {
  const list = ref([1, 2, 3])
  const first = computed(() => list.value[0])
  return { list, first }
}
```

记住：**要响应式就返回 ref / computed，不要返回它们的 `.value`**。

## 检查表

- 命名以 `use` 开头，文件名和函数名一致。
- 在 `setup` 同步阶段调用，保证生命周期钩子能注册。
- 外部依赖通过参数传入，方便测试和替换。
- 返回值用 ref / computed 保持响应式，不要解出 `.value`。
- 只在确实需要跨组件复用时才抽取；单组件简单逻辑别过度抽象。
