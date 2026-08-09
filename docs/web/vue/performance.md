---
title: Vue 性能优化
description: 先量化再优化，把功夫花在真正影响用户感知的地方，而不是追逐每个微优化。
---

# Vue 性能优化

Vue 的响应式系统已经做了大量工作，多数应用不需要手动优化。性能问题的根源通常是两类：**渲染了不该渲染的东西**，和**让响应式追踪了不该追踪的东西**。先定位瓶颈，再对症下药。

## 先测量，再优化

不要凭感觉优化。用 Performance 面板看长任务、用 Vue DevTools 看组件更新次数、用 Lighthouse 看综合得分。优化的方向只有三种：

| 类型 | 表现 | 处理方向 |
| --- | --- | --- |
| 首屏慢 | 白屏时间长 | 减小包体积、懒加载、SSR/SSG |
| 交互卡 | 点击/滚动有延迟 | 减少同步计算、虚拟滚动 |
| 频繁重渲染 | DevTools 里组件持续闪动 | 收窄响应式依赖、用 `v-memo` |

## v-once 与 v-memo：告诉编译器"这块别更新"

`v-once` 让元素只渲染一次，之后不再参与更新。适合纯静态内容：

```vue
<header v-once>
  <h1>{{ title }}</h1>
  <p>版权信息，永不变化</p>
</header>
```

`v-memo` 更精细：只在依赖列表变化时才重新渲染，适合大列表里"通常不变、偶尔才改"的项：

```vue
<div v-for="item in list" :key="item.id" v-memo="[item.id, item.selected]">
  <!-- 只有 id 或 selected 变了才重渲染 -->
  <ExpensiveRow :item="item" />
</div>
```

> 这两个指令是优化手段，不是默认写法。给本来就快的组件套 `v-memo` 反而增加判断开销。

## 大列表：虚拟滚动是唯一答案

渲染 1000 条数据时，真正可见的只有 20 条左右。把剩下的也渲染出来纯属浪费。用虚拟滚动（`vue-virtual-scroller`、`@tanstack/vue-virtual`）只渲染可见区域：

```vue
<RecycleScroller
  :items="rows"
  :item-size="40"
  key-field="id"
  v-slot="{ item }"
>
  <Row :data="item" />
</RecycleScroller>
```

| 方案 | 适用 |
| --- | --- |
| 分页 | 数据总量大、用户按页浏览 |
| 虚拟滚动 | 一屏内滚动浏览长列表 |
| 无限滚动 + 懒加载 | 信息流类、不确定总量 |

## 懒加载组件

路由级懒加载用动态 `import`，组件级用 `defineAsyncComponent`。后者适合体积大、非首屏可见的组件（富文本编辑器、地图、图表库）：

```js
import { defineAsyncComponent } from 'vue'

const Editor = defineAsyncComponent(() => import('./HeavyEditor.vue'))
```

## shallowRef / shallowReactive：少追踪一点

`ref` 和 `reactive` 会递归把对象的所有嵌套属性都变成响应式。对**大对象、只整体替换不逐字段改**的数据，用浅响应式省掉递归开销：

```js
import { shallowRef } from 'vue'

// 一份大图表数据，只整体替换
const chartData = shallowRef([])
chartData.value = await fetchData() // 触发更新
// chartData.value.push(x) // 不会触发更新！需要整体替换
```

| API | 适用 |
| --- | --- |
| `ref` / `reactive` | 普通业务对象，需要细粒度更新 |
| `shallowRef` / `shallowReactive` | 大数据、整体替换、第三方实例（地图、ECharts） |
| `markRaw` | 永远不参与响应式（如把 class 实例放进 state） |

> 把 ECharts 实例、Three.js 对象这类本身有自己更新机制的实例放进 reactive 会出问题：响应式系统试图代理它，触发其 getter 产生意外行为。这类对象一律 `markRaw` 或 `shallowRef`。

## computed 的缓存不是免费的，但用对就省

`computed` 只在依赖变化时才重算，依赖稳定时返回缓存值。但要确保依赖真的稳定：

```js
// 反例：每次都返回新对象，computed 永远重算
const filtered = computed(() =>
  list.value.filter(x => x.active) // list 不变就缓存
)

// 反例：依赖了一个每次都变的函数结果
const bad = computed(() => heavyCalc(Math.random()))
```

同一个派生值在多处用，用 `computed`；只用一次且计算很轻，直接写表达式即可。

## 避免不必要的响应式

把不会变的大常量做成普通常量而不是 `ref`。模板里避免在 `v-for` 里写复杂表达式（每次渲染都重算），抽成 `computed`。事件回调里少做重活，必要时用 `lodash.throttle` / `debounce`。

## 打包优化

- 路由懒加载切分 chunk。
- 用 Vite 的 `build.rollupOptions.output.manualChunks` 把大依赖单独拆出来。
- 用 `vite-plugin-compression` 开 gzip/brotli。
- 图标库按需引入，别整包 import。

| 优化 | 收益 | 成本 |
| --- | --- | --- |
| 路由懒加载 | 首屏体积下降 | 配置一次 |
| 依赖按需引入 | 体积下降 | 需要确认库支持 |
| gzip/brotli | 传输体积下降 70%+ | 服务端配置 |
| 代码分割 | 按需加载 | 需规划 chunk 边界 |

## 检查表

- 先用 DevTools 和 Performance 定位，再决定优化哪里。
- 长列表用虚拟滚动，不要全量渲染。
- 大对象、第三方实例用 shallowRef / markRaw，别让响应式代理它。
- 重计算抽成 computed，确保依赖稳定。
- 路由和重组件懒加载，大依赖按需引入。
