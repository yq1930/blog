---
title: 组合式函数与逻辑复用
description: 组合式函数就是在 setup 里调用的普通函数。讲清它为什么必须同步调用，修复 await 之后注册生命周期导致监听泄漏、状态被所有组件意外共享、传参后失去响应、返回 .value 丢失响应、异步请求竞态等问题。
---

# 组合式函数与逻辑复用

组合式函数（composable）是 Vue 3 复用逻辑的标准方式：把一组相关的状态和行为封装进一个 `useXxx` 函数，在多个组件里使用。它比 Vue 2 的 mixin 清晰得多，但也有自己的一套坑：

- 在组合式函数里 `await` 了一下之后再注册 `onUnmounted`，结果监听器永远没被移除；
- 两个组件用了同一个组合式函数，改了一个，另一个也跟着变；
- 把 `props.id` 传进组合式函数，父组件改了 id，里面却没反应。

理解组合式函数的工作原理，这些问题都能一眼看穿。

::: tip 读完这篇你会
- 说清组合式函数和 mixin 的区别，以及“必须同步调用”的原因
- 写出参数可以是普通值、ref 或 getter 的组合式函数
- 避开生命周期泄漏、意外共享状态、丢失响应、请求竞态等坑
:::

## 1. 为什么从 mixin 换成组合式函数

| 问题 | mixin | 组合式函数 |
| --- | --- | --- |
| 命名冲突 | 两个 mixin 有同名属性，后者悄悄覆盖前者 | 变量在函数作用域里，解构时可以改名 |
| 来源不清 | 模板里用了 `loading`，不知道来自哪个 mixin | `const { loading } = useUser()`，一眼可见 |
| 参数传递 | 无法传参，只能约定组件上有某个属性 | 普通函数参数 |
| 类型推导 | 很难 | 天然支持 TypeScript |

## 2. 原理：组合式函数就是普通函数

组合式函数没有任何魔法，它就是一个在 `setup` 里被调用的普通函数：

```js
// useCounter.js
import { ref, computed } from 'vue'

export function useCounter(initial = 0) {
  const count = ref(initial)           // 1. 声明状态
  const double = computed(() => count.value * 2)

  function inc() { count.value++ }     // 2. 定义行为
  function reset() { count.value = initial }

  return { count, double, inc, reset } // 3. 返回需要用的东西
}
```

```vue
<script setup>
import { useCounter } from './useCounter'
const { count, double, inc } = useCounter(10)
</script>

<template>
  <button type="button" @click="inc">{{ count }}（两倍：{{ double }}）</button>
</template>
```

那组合式函数里的 `onMounted`、`onUnmounted` 是怎么知道自己属于哪个组件的？

Vue 在执行组件的 `setup` 时，会把“当前组件实例”记在一个全局变量里；`setup` 同步执行完毕，这个变量就被清空。`onMounted` 被调用时，就去看这个变量，把钩子注册到当前组件上。

可以想成开会点名：只有在点名的那几分钟里喊“到”，才会被记为出席。`setup` 同步执行的这段时间就是点名时间，`await` 之后，点名已经结束了。

## 3. 坑一：`await` 之后注册生命周期，监听器永远不会被移除

**现象**：控制台出现警告 `onUnmounted is called when there is no active component instance to be associated with`；页面切换几次后，同一个事件处理函数被触发了好几次。

```js
export async function useLiveData() {
  const config = await fetchConfig() // ❌ 在注册钩子之前 await 了
  const handler = () => refresh(config)
  window.addEventListener('focus', handler)
  onUnmounted(() => window.removeEventListener('focus', handler)) // 此时已经不在“点名时间”
}
```

**原因**：`await` 之后的代码是在 `setup` 结束之后才执行的，当前组件实例已经被清空，`onUnmounted` 找不到组件，注册失败。于是组件卸载时没人移除监听器，每次进入页面都会多加一个。

**修复**：生命周期钩子、`watch` 等需要绑定组件的调用，全部放在第一个 `await` **之前**：

```js
export function useLiveData() {
  const config = ref(null)
  const handler = () => config.value && refresh(config.value)

  onMounted(() => window.addEventListener('focus', handler))
  onUnmounted(() => window.removeEventListener('focus', handler))

  fetchConfig().then((value) => {
    config.value = value // 异步部分只负责更新数据
  })

  return { config }
}
```

**怎么避免再犯**：组合式函数本身写成同步函数，返回响应式状态；异步结果通过更新 ref 体现，而不是让调用方 `await` 它。

## 4. 坑二：状态写在函数外面，所有组件意外共享

**现象**：两个页面都用了 `useFilter()`，在页面 A 选了“已完成”，打开页面 B，筛选条件也变成了“已完成”。

```js
const status = ref('all') // ❌ 写在函数外面：整个应用只有这一份

export function useFilter() {
  return { status }
}
```

**原因**：模块顶层的代码只在第一次被导入时执行一次。写在函数外面的 `ref` 只有一份，所有调用 `useFilter()` 的组件拿到的都是同一个对象。

**修复**：每个组件需要独立状态，就把 `ref` 写在函数里面：

```js
export function useFilter() {
  const status = ref('all') // 每次调用都创建新的
  return { status }
}
```

如果你**就是想要**全局共享（比如当前登录用户），写在外面是可以的，但要清楚这样做的后果；需要共享的业务状态，更推荐用 Pinia，它有开发者工具支持，服务端渲染时也不会在不同用户的请求之间串数据。

## 5. 坑三：把 `props.id` 传进去，之后再也不更新

**现象**：`useUser(props.userId)` 在父组件切换用户后，仍然显示第一个用户的数据。

```js
const props = defineProps({ userId: String })
const { user } = useUser(props.userId) // ❌ 传进去的是此刻的一个字符串
```

**原因**：`props.userId` 在这里被读取成了一个普通字符串，组合式函数拿到的只是一个“快照”，和 props 之间的联系断了。

**修复**：调用方传入 getter 函数或 ref；组合式函数内部用 `toValue()`（Vue 3.3+）统一读取，并用 `watch` 跟踪变化：

```js
// useUser.js
import { ref, watch, toValue } from 'vue'

export function useUser(userId) {
  // userId 可以是普通值、ref 或 getter 函数
  const user = ref(null)

  watch(
    () => toValue(userId),
    async (id) => {
      user.value = id ? await api.getUser(id) : null
    },
    { immediate: true }
  )

  return { user }
}
```

```js
// 组件里：传入 getter，保持和 props 的联系
const { user } = useUser(() => props.userId)
```

## 6. 坑四：返回了 `.value`，响应式断了

```js
// ❌ 返回的是数字，不再响应
export function useFirst() {
  const list = ref([1, 2, 3])
  return { first: list.value[0] }
}

// ✅ 返回 computed，保持和源数据的联系
export function useFirst() {
  const list = ref([1, 2, 3])
  const first = computed(() => list.value[0])
  return { list, first }
}
```

规律：**要保持响应式，就返回 ref 或 computed 本身，不要返回它们的 `.value`**。从组合式函数返回的 ref 被解构后仍然是响应式的，这一点不用担心。

## 7. 坑五：参数变化太快，旧请求覆盖了新结果

**现象**：用上面的 `useUser`，快速切换用户 1、用户 2，最终页面显示的却是用户 1。

**原因**：用户 1 的请求比用户 2 的晚返回，覆盖了正确的结果。

**修复**：`watch` 回调的第三个参数可以注册清理函数，参数再次变化或组件卸载时执行：

```js
watch(
  () => toValue(userId),
  async (id, _oldId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true // 这次结果作废
    })
    const data = id ? await api.getUser(id) : null
    if (!cancelled) user.value = data
  },
  { immediate: true }
)
```

请求库支持取消时，在清理函数里直接调用 `controller.abort()` 更好，连网络请求都省了。

## 8. 把外部依赖当作参数传入

组合式函数里直接 `import` 具体的接口模块，测试时就很难替换。把依赖作为参数传进来，测试时传入假数据即可：

```js
export function useList(fetcher) {
  const items = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      items.value = await fetcher()
    } finally {
      loading.value = false
    }
  }

  return { items, loading, load }
}

// 组件里
const { items, load } = useList(() => api.listMembers({ status: 'active' }))
```

## 9. 什么时候该抽成组合式函数

适合抽取：

- 同一组“状态 + 行为”在两个以上的组件里出现；
- 逻辑可以独立存在，有清晰的输入和输出，比如分页、表单提交、窗口尺寸、倒计时。

不必抽取：

- 只有一个组件用、逻辑很简单：直接写在 `<script setup>` 里更好读；
- 跨很多页面共享、需要调试追踪的业务状态：用 Pinia。

## 排查思路

1. **看控制台警告**：`no active component instance` 说明钩子注册的时机不对，去找前面的 `await`。
2. **状态意外共享**：检查组合式函数文件里，`ref` / `reactive` 是不是写在了函数外面。
3. **数据不更新**：确认传进组合式函数的是 getter / ref，而不是读取出来的普通值。
4. **事件触发多次**：用 Elements 面板的 Event Listeners 看 `window` 上挂了几个同名监听器。
5. 在 Vue Devtools 里选中组件，查看组合式函数返回的状态是否符合预期。

## 检查清单

- [ ] 以 `use` 开头命名，文件名和函数名一致
- [ ] 生命周期钩子、`watch` 在第一个 `await` 之前注册
- [ ] 需要独立状态的 `ref` 写在函数内部
- [ ] 接收可能变化的参数时，支持 ref / getter，并用 `toValue` 读取
- [ ] 返回 ref / computed 本身，而不是 `.value`
- [ ] 异步请求在参数变化时作废或取消旧结果
- [ ] 外部依赖通过参数传入，方便测试

## 延伸阅读

- [闭包与作用域](/web/JavaScript/closure)：组合式函数里的状态为什么能“记住”
- [Pinia 状态管理](/web/vue/pinia)：需要全局共享时的选择
- [Vue 组件测试](/web/vue/testing)：如何测试组合式函数
