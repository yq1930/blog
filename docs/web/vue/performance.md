---
title: Vue 性能优化
description: 从“组件订阅了它读过的数据”这一原理出发，定位 Vue 应用的性能问题：输入框带着大表格一起卡、大数据深层响应式拖慢页面、ECharts 实例放进 ref 报错、keep-alive 缓存过多、组件卸载不清理等。
---

# Vue 性能优化

Vue 的响应式系统已经帮你做了大量优化，大部分页面不需要手动处理。真正出现性能问题时，通常是下面几种情况之一：

- 在搜索框里打字，每个字都要卡一下，因为下面还有一张一千行的表格；
- 接口返回了几万条数据，存进 `ref` 后页面明显变慢；
- 把 ECharts 实例存进 `ref`，图表的提示框一显示就报错；
- 应用开久了越来越卡，内存一直涨。

优化前先理解 Vue 是怎么决定“谁需要更新”的，才能对症下药。

::: tip 读完这篇你会
- 理解 Vue 响应式的“订阅”机制和组件级更新
- 用拆分组件、浅层响应式、虚拟滚动解决常见性能问题
- 用 Vue Devtools 和浏览器工具定位瓶颈
:::

## 1. 原理：组件订阅了它读过的数据

Vue 渲染一个组件时，会记录渲染过程中**读取了哪些响应式数据**，相当于组件“订阅”了这些数据。之后只要其中任何一个数据变化，Vue 就通知这个组件重新渲染。

```text
渲染 SearchPage 时读取了：keyword、rows（1000 行）
                     ↓ 订阅
keyword 变化（每输入一个字）→ SearchPage 整个重新渲染，包括 1000 行表格
```

两个关键结论：

1. **更新的单位是组件**。一个组件里任何被读取的数据变了，整个组件的模板都要重新执行一次。组件越大、模板越复杂，每次更新越贵。
2. **响应式有成本**。`ref` / `reactive` 会把对象深层地包装成代理，数据量很大时，包装和读取都会变慢。

后面的大部分优化，都是在减少“需要重新渲染的范围”或“需要追踪的数据量”。

## 2. 先测量，再优化

- **Vue Devtools** 的性能和时间线面板：看每个组件渲染了多少次、每次花了多长时间；
- **开发环境开启性能标记**：`app.config.performance = true`，组件的初始化、渲染、更新耗时会出现在浏览器 Performance 面板的 Timings 一栏里；
- **Chrome Performance 面板**：录制一次卡顿的操作，找到最长的任务。

没有测量就优化，很容易花大力气优化了一个本来就不慢的地方。

## 3. 坑一：输入框带着整张大表格一起卡

**现象**：搜索页上方是输入框，下方是 1000 行的表格。在输入框里打字时，每个字都要卡顿一下才显示出来。

**原因**：输入框绑定的 `keyword` 和表格写在同一个组件里。每输入一个字，`keyword` 变化，整个组件（包括 1000 行的表格）都重新渲染一遍。

**修复**：把表格拆成单独的子组件。子组件只在自己的 props 变化时才更新，输入关键字不会再牵连表格：

```vue
<!-- SearchPage.vue -->
<template>
  <input v-model="keyword" placeholder="输入关键字" />
  <!-- filteredRows 只在 debouncedKeyword 变化时才重新计算 -->
  <ResultTable :rows="filteredRows" />
</template>
```

再配合防抖，让表格在用户停止输入 300ms 后才更新：

```js
const keyword = ref('')
const debouncedKeyword = ref('')
watch(keyword, debounce((value) => (debouncedKeyword.value = value), 300))

const filteredRows = computed(() =>
  rows.value.filter((row) => row.name.includes(debouncedKeyword.value))
)
```

**怎么避免再犯**：频繁变化的小状态（输入、悬停、拖拽位置）和昂贵的大块渲染（长列表、图表）不要放在同一个组件里。

## 4. 坑二：几万条数据存进 `ref`，页面变慢

**现象**：把接口返回的三万条记录存进 `ref`，切换页面、排序都变得很慢。

**原因**：`ref` 和 `reactive` 是**深层响应式**的：访问数组中的每个对象、对象中的每个属性时，Vue 都会创建代理并追踪依赖。三万条记录、每条十几个字段，追踪的开销就很可观了。而这些数据其实只是展示，从来不会逐字段修改。

**修复**：只读或整体替换的大数据，用 `shallowRef`。它只追踪 `.value` 本身的替换，不深入内部：

```js
import { shallowRef } from 'vue'

const records = shallowRef([])
records.value = await api.fetchRecords() // ✅ 整体替换会触发更新

records.value.push(newRecord)            // ❌ 不会触发更新
records.value = [...records.value, newRecord] // ✅ 需要整体替换
```

| API | 适合 |
| --- | --- |
| `ref` / `reactive` | 普通业务数据，需要修改具体字段 |
| `shallowRef` / `shallowReactive` | 大数据、只整体替换的数据 |
| `markRaw` | 永远不需要响应式的对象 |

## 5. 坑三：ECharts、地图实例放进 `ref` 之后出错

**现象**：把 ECharts 实例存进 `ref`，图表能画出来，但鼠标一移上去就报错，类似 `Cannot read properties of undefined (reading 'type')`；地图 SDK 的实例存进 `reactive` 后，操作变得非常慢。

**原因**：这些第三方实例有自己复杂的内部结构和更新机制。Vue 把它们深层包装成代理后，库内部拿到的是代理对象而不是原始对象，一些依赖对象身份比较（`===`）的逻辑就会出错，而且每次访问内部属性都要经过代理，性能也会下降。

**修复**：第三方实例不需要响应式，用 `markRaw` 标记，或者存在 `shallowRef` 里：

```js
import { ref, shallowRef, markRaw, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const chartEl = ref(null)
const chart = shallowRef(null)

onMounted(() => {
  chart.value = markRaw(echarts.init(chartEl.value))
})

onBeforeUnmount(() => {
  chart.value?.dispose() // 释放图表占用的资源
})
```

## 6. 坑四：长列表一次全部渲染

**现象**：表格一次渲染两千行，打开要好几秒，滚动也不流畅。

**修复**：屏幕上同一时间只能看到二三十行，没必要把两千行都变成 DOM：

| 方案 | 适合 |
| --- | --- |
| 分页 | 后台表格，用户按页查找 |
| 虚拟滚动 | 必须在一个列表里连续滚动浏览，比如聊天记录、日志 |
| 滚动加载 | 信息流，总量不确定 |

虚拟滚动只渲染可视区域内的行，滚动时复用这些 DOM 节点、替换内容。可以使用 `vue-virtual-scroller`、`@tanstack/vue-virtual` 等成熟的库，组件库的表格一般也提供虚拟滚动模式。注意虚拟滚动通常要求每行高度固定或可预估。

## 7. 坑五：`v-if` 和 `v-show` 用反了

| | `v-if` | `v-show` |
| --- | --- | --- |
| 隐藏时 | 销毁组件，移除 DOM | 只是 `display: none` |
| 再次显示 | 重新创建组件 | 直接显示 |
| 适合 | 很少切换、或者初始不显示的重组件 | 频繁切换的内容 |

**现象**：标签页每次切换都要转圈重新加载，因为每个标签页用的是 `v-if`，每次切换都销毁重建；反过来，一个页面里有十个用 `v-show` 隐藏的复杂弹窗，打开页面时它们全部被创建，首屏变慢。

按切换频率选择即可。

## 8. 坑六：`keep-alive` 缓存了太多页面

**现象**：为了让返回时保留状态，给整个 `<router-view>` 包了 `<keep-alive>`。应用用久了内存越来越高；离开的页面里，定时器还在不停地发请求。

**原因**：被缓存的组件不会销毁，它的数据、DOM、定时器都留在内存里。不加限制，用户访问过的每个页面都会被缓存下来。

**修复**：

```vue
<router-view v-slot="{ Component }">
  <keep-alive :include="['OrderList', 'ProductList']" :max="5">
    <component :is="Component" />
  </keep-alive>
</router-view>
```

- 用 `include` 只缓存确实需要保留状态的页面（注意这里匹配的是组件的 `name`）；
- 用 `max` 限制缓存数量；
- 被缓存的页面在 `onDeactivated` 里暂停定时器和轮询，在 `onActivated` 里恢复。

## 9. 坑七：组件卸载后，定时器和监听器还在运行

**现象**：在几个页面之间来回切换后，页面越来越卡；Network 面板里，已经离开的页面的轮询请求还在发。

**原因**：组件里 `setInterval`、`window.addEventListener`、WebSocket 订阅等，组件销毁时没有清理，它们会一直运行，并通过闭包持有组件的数据，无法被垃圾回收。

**修复**：每一个“开启”都配一个“关闭”：

```js
let timer = null
onMounted(() => {
  timer = setInterval(refresh, 10_000)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('resize', onResize)
})
```

更好的做法是把“开启 + 清理”封装进组合式函数，使用方不可能忘记清理，见 [组合式函数与逻辑复用](/web/vue/composables)。

## 10. 其他实用手段

- **组件懒加载**：富文本编辑器、图表、地图等大组件用 `defineAsyncComponent(() => import('./HeavyEditor.vue'))`，用到时才加载；
- **`v-once`**：只渲染一次、之后不再更新的静态内容；
- **`v-memo`**：大列表中，指定只有某几个值变化时才重新渲染某一行，例如 `v-memo="[item.id, item.selected]"`。这两个指令都是针对已确认瓶颈的手段，不要默认到处加；
- **模板里不写复杂计算**：`v-for` 里调用一个昂贵的函数，每次渲染每一行都会重新计算一次，把它改成 `computed`。

## 排查思路

1. 用 Vue Devtools 观察：执行卡顿的操作时，哪些组件重新渲染了、渲染了多少次。如果看到和操作无关的大组件也在更新，就是更新范围太大。
2. 开启 `app.config.performance = true`，在 Performance 面板里查看具体组件的渲染耗时。
3. 内存持续增长：Memory 面板拍两次堆快照对比，搜索 `Detached` 查找已被移除但仍被引用的 DOM，顺着引用链找到没清理的定时器或监听器。
4. 第三方库报出奇怪的内部错误时，先检查它的实例是不是被放进了深层响应式里。

## 检查清单

- [ ] 优化前用工具测量过，确认了瓶颈
- [ ] 频繁变化的小状态和昂贵的大块渲染拆成了不同组件
- [ ] 只读或整体替换的大数据使用 `shallowRef`
- [ ] 第三方实例使用 `markRaw` 或 `shallowRef`，并在卸载时销毁
- [ ] 长列表使用分页或虚拟滚动
- [ ] `keep-alive` 设置了 `include` 和 `max`
- [ ] 定时器、监听器、订阅在组件卸载时全部清理

## 延伸阅读

- [性能与加载体验](/web/frontend/performance)：页面级的性能指标
- [闭包与作用域](/web/JavaScript/closure)：内存泄漏的原理和排查
- [组件设计与状态边界](/web/vue/component-design)：组件拆分的原则
