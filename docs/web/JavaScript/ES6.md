---
title: ES6：作用域、模块与数据处理
description: 用现代 JavaScript 最常见的语法，建立可预测的变量、模块和数组处理习惯。
---

# ES6：作用域、模块与数据处理

现代 JavaScript 的重点不是“记住更多语法”，而是让变量的生命周期、数据的流向和模块的边界都可预测。下面这几组规则覆盖了日常代码里最容易混淆的地方。

## 用 `const` 开始，用 `let` 表示会重新赋值

| 声明方式 | 作用域 | 是否可重新赋值 | 适合场景 |
| --- | --- | --- | --- |
| `const` | 块级作用域 | 否 | 默认选择；对象和数组本身仍可修改内容 |
| `let` | 块级作用域 | 是 | 计数器、循环索引、状态切换 |
| `var` | 函数作用域 | 是 | 维护历史代码时才会遇到 |

`let` 与 `const` 在声明前不可访问，这段范围称为**暂时性死区**。这能更早暴露拼写错误和错误的执行顺序。

```js
const project = { name: 'notes' }
project.name = 'field-notes' // 可以：修改对象属性

// project = {} // 不可以：不能给绑定重新赋值

if (true) {
  const scope = 'only here'
}

// console.log(scope) // ReferenceError
```

> `const` 保护的是变量绑定，不是对象的深度不可变性。需要不可变数据时，应主动复制或使用专门的数据策略。

## 函数声明和变量声明并不等价

函数声明会在所在作用域建立时可用；`var` 虽然会被提升，但它的值在赋值前是 `undefined`。不要依赖任何一种提升来组织代码，把声明放在首次使用之前会更清楚。

```js
greet('南终')

function greet(name) {
  return `你好，${name}`
}

// 不推荐：变量存在，但函数值尚未赋入
// sayHi('南终')
// const sayHi = (name) => `你好，${name}`
```

## 用解构和默认值减少防御代码

解构适合从明确形状的数据中拿出少量字段；当字段可能缺失时，要给默认值。

```js
function formatProfile({ name = '匿名用户', role = 'reader' } = {}) {
  return `${name} · ${role}`
}

const response = { data: { items: ['a', 'b'] } }
const { data: { items = [] } = {} } = response
```

嵌套解构很深时，可读性会下降。此时先保存中间对象，通常比一行“技巧性代码”更好维护。

> 解构默认值只在值为 `undefined` 时生效，`null` 不会触发。接口返回 `null` 时，`const { name = '匿名' } = res` 得到的是 `null` 而非 `'匿名'`，需要用 `??` 兜底。

## 数组方法：从“怎么循环”转向“想得到什么”

`map`、`filter` 和 `reduce` 不会修改原数组，适合把转换逻辑写成连续的数据管道。

```js
const orders = [
  { amount: 88, paid: true },
  { amount: 120, paid: false },
  { amount: 56, paid: true }
]

const paidTotal = orders
  .filter((order) => order.paid)
  .map((order) => order.amount)
  .reduce((total, amount) => total + amount, 0)

console.log(paidTotal) // 144
```

> **常见错误**：`reduce` 不传初始值时，空数组会直接报错 `Reduce of empty array with no initial value`。有数据时一切正常，列表一旦为空就崩溃——这种"偶发报错"很难第一时间定位到 `reduce`。始终传初始值（如上面的 `0`），能彻底避免。

```js
// 错误：空数组会抛错
const total = items.reduce((sum, n) => sum + n)

// 正确：始终传初始值
const total = items.reduce((sum, n) => sum + n, 0)
```

| 方法 | 返回值 | 适用问题 |
| --- | --- | --- |
| `map` | 新数组 | 每一项都要转换 |
| `filter` | 新数组 | 只保留满足条件的项 |
| `find` | 单项或 `undefined` | 找到第一个匹配项即可 |
| `some` / `every` | 布尔值 | 判断是否存在 / 是否全部满足 |
| `reduce` | 任意累积结果 | 求和、分组、构建对象 |

## ES Module：一个文件只暴露它负责的能力

优先使用具名导出表达稳定的公共能力；默认导出更适合一个文件只有一个主体的情况。导入路径要写完整，并避免通过循环依赖让模块初始化顺序变得难以理解。

```js
// money.js
export function formatMoney(cents) {
  return `¥${(cents / 100).toFixed(2)}`
}

// checkout.js
import { formatMoney } from './money.js'

console.log(formatMoney(1250))
```

## `Proxy`：为对象访问设置统一入口

`Proxy` 可以拦截对象操作。它适合校验、日志、响应式实现等底层场景；业务代码不应为了“炫技”给每个对象加代理。

```js
function watch(target, onChange) {
  return new Proxy(target, {
    set(object, key, value, receiver) {
      const previous = Reflect.get(object, key, receiver)
      const changed = previous !== value
      const result = Reflect.set(object, key, value, receiver)

      if (changed) onChange(key, value, previous)
      return result
    }
  })
}

const state = watch({ count: 0 }, (key, value) => {
  console.log(`${String(key)} changed to ${value}`)
})

state.count += 1
```

## 记住这份检查表

- 默认使用 `const`；只有确实要重新赋值时使用 `let`。
- 先明确输入和输出，再选择数组方法；不要为了函数式而嵌套过深。
- 模块导出的是边界，不是“方便从别处拿变量”的通道。
- 使用 `Proxy` 前先确认普通函数、对象封装或框架能力是否已经足够。
