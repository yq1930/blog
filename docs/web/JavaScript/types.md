---
title: TypeScript 的类型边界
description: 用类型描述可信数据、缩小未知输入，并让编译期约束服务于真实业务边界。
---

# TypeScript 的类型边界

TypeScript 不会让运行时数据自动变安全。它擅长描述已经可信的结构、约束模块之间的约定；来自接口、表单和存储的数据仍需要在运行时验证。

## 先让函数输入和输出清楚

类型最有价值的地方是公共边界。为参数、返回值和领域对象命名，调用方就不必翻实现猜测数据形状。

```ts
type Member = {
  id: string
  name: string
  role: 'reader' | 'editor'
}

function canEdit(member: Member): boolean {
  return member.role === 'editor'
}
```

避免为了省事把业务数据写成 `any`。一旦进入 `any`，后续属性访问和赋值都失去检查，类型系统无法再帮你发现拼写或结构错误。

## 用联合类型表达有限状态

页面状态通常不是一堆互不关联的布尔值，而是有限集合。可辨识联合能让每个状态携带自己需要的数据。

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

function renderState(state: LoadState<Member>) {
  if (state.status === 'success') return state.data.name
  if (state.status === 'error') return state.message
  return '请稍候'
}
```

相比 `loading`、`error`、`data` 同时存在的松散对象，这种写法能减少“不可能组合”，例如既加载成功又没有数据。

## `unknown` 比 `any` 更适合外部输入

接口响应先是未知数据。使用 `unknown` 后，必须经过判断才能访问属性，这迫使我们在边界处完成验证。

```ts
function isMember(value: unknown): value is Member {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && (record.role === 'reader' || record.role === 'editor')
}
```

复杂接口可以使用统一的解析层或 schema 工具；重点是验证只能发生一次，并在失败时给出足够的上下文。

## 类型设计的三个边界

| 边界 | 关注点 | 典型做法 |
| --- | --- | --- |
| 外部输入 | 数据是否可信 | `unknown`、运行时校验、错误转换 |
| 模块接口 | 调用双方如何协作 | 导出的 `type`、参数和返回值 |
| 领域模型 | 状态是否允许组合 | 联合类型、只读字段、品牌类型 |

类型不是数据模型的替代品。先定义真实业务概念，再让类型帮助它保持一致，代码会比“到处补断言”更稳定。
