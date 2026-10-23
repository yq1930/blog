---
title: TypeScript 的类型边界
description: 类型只在编译时存在，运行时的数据不会自动变安全。讲清 any 与 unknown、类型断言、联合类型和运行时校验，避开“类型写对了线上还是崩”的坑。
---

# TypeScript 的类型边界

很多人刚用 TypeScript 时有个误解：“类型都写对了，就不会再有 `Cannot read properties of undefined` 了。”结果上线后接口少返回一个字段，页面照样白屏。

问题不在 TypeScript，而在于没搞清它管什么、不管什么。这篇先讲清这条边界，再看几种最常见的“类型骗了你”的 bug。

::: tip 读完这篇你会
- 知道类型在运行时并不存在，哪些数据必须在运行时检查
- 分清 `any`、`unknown`、`as`、`!` 各自的风险
- 用联合类型表达页面状态，让编译器帮你检查漏掉的分支
:::

## 1. 原理：类型在编译后会被擦掉

TypeScript 编译成 JavaScript 时，所有类型标注都会被删掉：

```ts
// 你写的 TypeScript
function greet(user: { name: string }): string {
  return `你好，${user.name}`
}
```

```js
// 浏览器真正运行的 JavaScript
function greet(user) {
  return `你好，${user.name}`
}
```

可以把类型想成施工图纸上的尺寸标注：施工时（写代码、编译时）它能帮你发现“门比门框大”这类错误；房子建好后（运行时）标注不在墙上，住户搬进来一台尺寸不对的冰箱（接口返回了意外的数据），图纸拦不住。

所以 TypeScript 检查的是**你的代码内部是否自洽**，不检查**外部世界给你的数据是否真的符合类型**。

| 数据来源 | TypeScript 能保证吗 | 该怎么做 |
| --- | --- | --- |
| 自己代码里创建的对象 | 能 | 正常写类型 |
| 模块之间传递的参数和返回值 | 能（只要上游可信） | 给公共函数写清参数和返回类型 |
| 接口响应、`localStorage`、URL 参数、`postMessage` | **不能** | 先当作 `unknown`，在入口处做运行时校验 |

## 2. `any` 和 `unknown`：关掉检查 vs 先检查再用

```ts
const a: any = JSON.parse(text)
a.user.name.trim() // 编译通过，运行时可能崩

const u: unknown = JSON.parse(text)
u.user // 编译报错：'u' is of type 'unknown'
```

- `any` 等于告诉编译器“别管我”，之后对它做什么都不检查，而且会像病毒一样传染：从 `any` 上读出来的属性也是 `any`。
- `unknown` 表示“我还不知道它是什么”，必须先判断类型才能使用，迫使你在入口处做检查。

外部数据一律先当作 `unknown`。

## 3. 坑一：用 `as` 把没验证的数据“声明”成正确类型

**现象**：类型定义里 `avatar` 是必填的，代码也没有任何报错，但线上部分用户打开个人页就白屏：`Cannot read properties of undefined (reading 'url')`。

```ts
type Member = {
  id: string
  name: string
  avatar: { url: string }
}

const member = (await res.json()) as Member // ❌ 只是“声明”，没有检查
render(member.avatar.url)                   // 老用户没有 avatar 字段，崩溃
```

**原因**：`as` 是类型断言，意思是“相信我，它就是这个类型”。编译器照做了，但运行时什么也没检查。老数据、接口改版、后端异常分支，都可能让真实数据和类型对不上。

**修复**：在数据进入系统的地方做一次运行时校验，校验通过后再当作 `Member` 使用。

```ts
function isMember(value: unknown): value is Member {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const avatar = v.avatar as Record<string, unknown> | undefined
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof avatar?.url === 'string'
  )
}

const data: unknown = await res.json()
if (!isMember(data)) {
  throw new Error('会员数据格式不正确') // 在入口处失败，比在深处崩溃好查得多
}
render(data.avatar.url) // 这里 data 已经被收窄为 Member
```

`value is Member` 叫**类型守卫**：函数返回 `true` 时，编译器就知道这个值是 `Member`。字段多的时候，手写守卫很累，可以用 zod 这类 schema 校验库，一份定义同时得到类型和校验函数。

**怎么避免再犯**：搜索代码里的 `as`，凡是作用在外部数据上的，都换成校验；`as` 只留给“编译器确实推断不出来、你有十足把握”的少数场景。

## 4. 坑二：`!` 非空断言把可能的 `undefined` 藏了起来

**现象**：列表页偶尔报错 `Cannot read properties of undefined (reading 'name')`，只在用户快速切换筛选条件时出现。

```ts
const selected = list.find((item) => item.id === selectedId)
title.textContent = selected!.name // ❌ 告诉编译器“它一定存在”
```

**原因**：`find` 的返回类型是 `Item | undefined`，编译器本来会提醒你处理找不到的情况。`!` 把这个提醒关掉了。列表还没加载完、或者选中项刚被删除时，就会找不到。

**修复**：老老实实处理找不到的分支。

```ts
const selected = list.find((item) => item.id === selectedId)
if (!selected) {
  title.textContent = '请选择一项'
  return
}
title.textContent = selected.name // 这里 selected 一定存在
```

**怎么避免再犯**：把 `!` 当作代码异味，每一个都要能说出“为什么这里一定不为空”。在 `tsconfig.json` 里开启 `strict: true`，再加上 `noUncheckedIndexedAccess`，`arr[0]`、`obj[key]` 这类访问也会被当成“可能为 `undefined`”。

## 5. 坑三：类型说是数字，接口给的是字符串

**现象**：列表里明明有选中项，但高亮就是不生效；控制台没有任何报错。

```ts
type Item = { id: number; name: string }

// 接口实际返回 { "id": "42", "name": "..." }
const items = (await res.json()) as Item[]
items.filter((item) => item.id === 42) // 永远是空数组："42" !== 42
```

**原因**：后端（或某个中间层）把数字序列化成了字符串，而 `as` 又让编译器相信它是数字。`===` 不会做类型转换，比较结果永远是 `false`，程序不报错，只是“静悄悄地不对”。

**修复**：在入口处把数据**转换**成内部需要的形状，而不仅仅是校验：

```ts
function toItem(raw: { id: unknown; name: unknown }): Item {
  const id = Number(raw.id)
  if (!Number.isFinite(id)) throw new Error(`无效的 id：${String(raw.id)}`)
  return { id, name: String(raw.name ?? '') }
}
```

**怎么避免再犯**：每个接口只在一个地方（请求层或 API 模块）做“外部格式 → 内部类型”的转换，业务代码只接触转换后的数据。ID 这类字段最好和后端约定统一用字符串，避免大数精度和类型不一致两个问题。

## 6. 用联合类型表达状态，让编译器帮你查漏

页面加载状态常被写成几个独立的布尔值：`loading`、`error`、`data`。问题是它们能组合出“不可能的状态”，比如 `loading` 为 `true` 的同时 `error` 也有值，界面就会同时显示转圈和报错。

更好的写法是**可辨识联合**：用一个 `status` 字段区分状态，每种状态只携带自己需要的数据。

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

function render(state: LoadState<Member>): string {
  switch (state.status) {
    case 'idle':
      return ''
    case 'loading':
      return '加载中…'
    case 'success':
      return state.data.name // 只有 success 分支能访问 data
    case 'error':
      return state.message
    default: {
      const unreachable: never = state // 漏掉某个状态时，这里会编译报错
      return unreachable
    }
  }
}
```

最后的 `never` 是个实用技巧：以后有人新增一个 `'empty'` 状态，所有没处理它的 `switch` 都会在编译时报错，而不是在线上显示一片空白。

## 排查思路：类型没报错，运行时却崩了

1. **先看真实数据**：在 DevTools 的 Network 面板找到对应请求，看响应体里那个字段到底是什么类型、是不是缺失。
2. **在崩溃位置附近找“信任声明”**：`as`、`!`、`any`、`// @ts-ignore`，问题几乎都藏在这些地方。
3. **打印类型而不是只打印值**：`console.log(typeof value, value)`，`"42"` 和 `42` 在控制台里一眼看不出区别。
4. **检查编译配置**：确认 `tsconfig.json` 开启了 `strict`，否则很多 `undefined` 检查根本没有生效。

## 检查清单

- [ ] 接口响应、存储读取、URL 参数先当作 `unknown`，在入口处校验或转换
- [ ] 外部数据上没有 `as`，代码里的 `!` 都能说清理由
- [ ] 页面状态用 `status` 联合类型表示，`switch` 末尾用 `never` 兜底
- [ ] `tsconfig.json` 开启 `strict`，并考虑 `noUncheckedIndexedAccess`
- [ ] “外部格式 → 内部类型”的转换只写在一个地方

## 延伸阅读

- [错误处理与异常](/web/JavaScript/error-handling)：校验失败后，错误该在哪一层处理
- [Axios 请求层](/web/vue/axios)：在请求层统一做响应转换
- [API 契约与前后端联调](/engineering/api-contract)：从源头约定字段类型
