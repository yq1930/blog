---
title: 前端状态管理
description: 先给状态分类，再决定它放哪，而不是一上来就引入全局 store。
---

# 前端状态管理

状态管理是前端复杂度的核心来源。很多人的第一反应是"装个 Redux/Pinia"，但实际上大多数状态问题不是 store 不够强，而是**状态放错了地方**。本篇讲状态分类、状态提升与下放、何时真正需要全局 store，以及派生状态和缓存的区别。想清楚这几件事，状态管理工具只是顺手的选择，而不是救命稻草。

## 先给状态分类

状态不是铁板一块。按来源和生命周期，前端状态大致分三类：

| 类型 | 来源 | 例子 | 适合放哪 |
| --- | --- | --- | --- |
| 服务端状态 | 后端 API | 用户列表、文章详情 | 缓存库（TanStack Query、SWR）或本地副本 |
| URL 状态 | 地址栏 | 当前页码、筛选条件、tab | URL（query/path） |
| 本地 UI 状态 | 用户交互 | 弹窗开关、输入临时值 | 组件内部 state |

```text
一个列表页的状态拆解：
- 用户列表（服务端状态）   → 从 API 拉，缓存
- 当前页码（URL 状态）     → ?page=2
- 选中行高亮（本地 UI）    → 组件 useState
- 筛选弹窗开关（本地 UI）  → 组件 useState
```

> 这三类状态的更新方式完全不同：服务端状态靠请求触发，URL 状态靠路由改变，本地状态靠事件。混在一个 store 里管理，会让更新逻辑纠缠不清。

## 服务端状态别用全局 store 装

最常见的反模式：把从 API 拿到的数据塞进 Redux/Pinia，再手动管理 loading/error/data 三个标志位、缓存、重试、失效。这是在重新发明轮子。

| 需求 | 手写 store | 专用库（TanStack Query / SWR） |
| --- | --- | --- |
| 缓存与失效 | 自己实现 | 内置 |
| loading/error 状态 | 自己维护 | 自动 |
| 重试与去重 | 自己实现 | 内置 |
| 乐观更新 | 自己实现 | 提供 API |

```js
// 用 TanStack Query：服务端状态交给它
const { data, isLoading, error } = useQuery({
  queryKey: ['articles', page],
  queryFn: () => fetchArticles(page),
})
```

全局 store 留给真正跨组件共享的**客户端状态**（如登录态、主题、购物车这类本地派生的业务状态），不要让它兼任 API 缓存。

## URL 状态：能进 URL 就进 URL

很多状态其实应该体现在 URL 上，这样刷新、分享、前进后退都能恢复：

| 状态 | 放 URL 的好处 |
| --- | --- |
| 分页 `?page=3` | 刷新停在第 3 页 |
| 筛选 `?status=active` | 分享链接打开就是筛选后结果 |
| 排序 `?sort=created` | 浏览器前进后退切换排序 |
| 当前 tab `?tab=settings` | 直接定位到某个标签 |

```js
// 把筛选条件和 URL 同步
const router = useRouter()
const status = computed(() => router.currentRoute.value.query.status || 'all')

function setStatus(value) {
  router.replace({ query: { ...route.query, status: value } })
}
```

判断标准：**这个状态用户是否希望刷新后还在？是否想分享给别人？** 是 → 放 URL。

## 状态提升与下放

状态该放在哪个组件？React 的经典原则：**找到需要这个状态的所有组件的共同父级，状态就放在那里**。

```text
父组件 A
├── 子组件 B（需要 state）
└── 子组件 C（需要 state）
→ state 放在 A，通过 props 下传
```

| 情况 | 放哪 |
| --- | --- |
| 只有一个组件用 | 用它的组件内部 |
| 几个相邻组件共用 | 最近公共父级 |
| 很多组件跨层级用 | context 或全局 store |

提升状态后，子组件通过 props 接收值和回调。如果 props 穿透超过两层（prop drilling），考虑用 Context 提供值，避免中间组件被迫传递不关心的 prop。

## 何时真正需要全局 store

不是每个项目都需要 Redux/Pinia。引入全局 store 的时机：

| 信号 | 说明 |
| --- | --- |
| 多个不相关组件频繁读写同一份状态 | props/context 已经传不动 |
| 状态更新逻辑复杂，需要集中处理 | action/reducer 模式更清晰 |
| 需要"时间旅行"调试 | store 的不可变更新支持回溯 |

如果只是父子传值、偶尔跨层，用组合式 API 的 `provide/inject` 或 React 的 `Context` 就够了。过早引入全局 store 会增加样板代码，简单状态变得啰嗦。

> 全局 store 不是"放所有状态的地方"。它只放真正需要全局共享的客户端状态，局部状态仍然留在组件内部。

## 状态归一化

避免在状态里存"能从其他状态算出来"的数据。冗余状态需要手动保持同步，一旦漏了就出现不一致：

```js
// 差：存了 items 和 itemCount，两个要同步
state = { items: [...], itemCount: 3 }

// 好：只存 items，count 是派生的
state = { items: [...] }
const itemCount = computed(() => state.items.length)
```

| 反模式 | 正确做法 |
| --- | --- |
| 同时存原始列表和过滤后列表 | 只存原始列表 + 过滤条件，过滤结果派生 |
| 同时存商品列表和总价 | 只存商品列表，总价派生 |
| 同时存用户对象和 userId | 只存 userId，用户对象按需查 |

## 派生状态 vs 缓存

派生状态是"每次从原始状态算出来"，缓存是"算一次存起来"。大多数派生状态计算成本很低，直接每次算（用 `computed` / `useMemo`）即可，不要为了"省一次计算"引入缓存失效的复杂度。

```js
// 派生：每次依赖变化自动重算
const filtered = computed(() =>
  items.value.filter(i => i.status === filter.value)
)

// 只有计算成本真的高（如大列表排序），才用 useMemo 缓存
const sorted = useMemo(() => heavySort(items), [items])
```

`useMemo` 不是免费的——它自己有依赖比对的成本。只在计算明显昂贵（处理上千项、复杂运算）时才用，否则普通变量赋值更简单。

## 务实的检查清单

- 是否区分了服务端状态、URL 状态、本地 UI 状态，分别用不同方案？
- 服务端数据是否用了专门的缓存库，而不是塞进全局 store？
- 能放 URL 的状态（分页、筛选、tab）是否真的放进了 URL？
- 状态是否放在了合适的层级（不过度提升也不过度下放）？
- 是否避免了冗余状态，能派生的就派生？
- 全局 store 是否只在真正需要时才引入？

状态管理的核心是"想清楚每个状态属于谁、生命周期是什么"。工具是最后的选择，前面的问题想对了，用什么库都顺手；想错了，再强的工具也救不回来。
