---
title: ES6：作用域、模块与数据处理
description: 用几个最常见的 bug 讲清 const/let、解构默认值、数组方法和 ES Module，读完能少踩一大半语法坑。
---

# ES6：作用域、模块与数据处理

ES6（ES2015）之后的语法很多，但日常 bug 集中在四个地方：**变量在哪能用、数据缺字段怎么兜底、数组怎么转换、模块之间怎么共享**。这篇不罗列语法，每一节都回答三个问题：它怎么工作、最容易写错在哪、写错了会看到什么现象。

::: tip 读完这篇你会
- 说清 `const` / `let` / `var` 的区别，看懂“暂时性死区”报错
- 写出不会被 `null` 打穿的默认值
- 用 `map` / `filter` / `reduce` 写数据转换，并避开空数组崩溃、`sort` 乱序
- 知道 ES Module 导入的是“活的绑定”，不是一份拷贝
:::

## 1. 变量声明：先想清楚“它活在哪、能不能改”

### 原理：作用域就是变量的活动范围

把一对花括号 `{}` 想成一个房间。`let` 和 `const` 只在这个房间里有效（**块级作用域**）；`var` 不认花括号，只认函数这道大门（**函数作用域**）。

```js
if (true) {
  var a = 1
  let b = 2
}
console.log(a) // 1 —— var 穿过了 if 的花括号
console.log(b) // ReferenceError: b is not defined
```

| 声明方式 | 作用域 | 能否重新赋值 | 声明前访问 |
| --- | --- | --- | --- |
| `const` | 块级 | 否 | 报错 |
| `let` | 块级 | 是 | 报错 |
| `var` | 函数级 | 是 | 得到 `undefined` |

“声明前访问会报错”这段区域叫**暂时性死区**（TDZ）：变量已经存在，但在执行到声明那一行之前不许碰。它看起来严格，其实是在帮你：

```js
console.log(price) // undefined —— 不报错，bug 被悄悄藏起来
var price = 100

console.log(total) // ReferenceError: Cannot access 'total' before initialization
let total = 100
```

`var` 让错误的执行顺序“看起来能跑”，`let` / `const` 让它当场暴露。新代码里不需要再写 `var`。

### 坑：以为 `const` 声明的对象不能改

**现象**：用 `const` 声明了一份默认配置，某个页面改了它的属性，结果其他页面的行为也跟着变了。

**原因**：`const` 锁住的是“变量指向哪个对象”（绑定），不是对象内部的内容。

```js
const config = { theme: 'light' }
config.theme = 'dark' // 允许：改的是对象内部
config = {}           // TypeError: Assignment to constant variable.
```

**修复**：需要只读就冻结它，需要修改就先复制一份：

```js
const DEFAULTS = Object.freeze({ theme: 'light' }) // 只冻结第一层
const pageConfig = { ...DEFAULTS, theme: 'dark' }    // 改副本，不动原对象
```

**怎么避免再犯**：默认用 `const`；凡是“多处共享”的对象都按只读对待，修改一律先复制。

## 2. 解构与默认值：接口少字段时怎么兜底

### 原理：解构就是“按形状取值”

解构让你按对象的结构一次取出多个字段，并给缺失的字段一个默认值：

```js
function formatProfile({ name = '匿名用户', role = 'reader' } = {}) {
  return `${name} · ${role}`
}

formatProfile({ name: '小林' }) // '小林 · reader'
formatProfile()                // '匿名用户 · reader'，最后的 = {} 防止不传参时报错
```

### 坑：默认值挡不住 `null`

**现象**：接口某天返回 `{ name: null }`，页面上直接显示 “null”，或者后续 `name.trim()` 报 `Cannot read properties of null`。

**原因**：解构默认值**只在值严格等于 `undefined` 时生效**。`null` 表示“有这个字段，只是值为空”，不会触发默认值。

```js
const { name = '匿名用户' } = { name: null }
console.log(name) // null，而不是 '匿名用户'
```

**修复**：对可能为 `null` 的字段用空值合并运算符 `??`（左边是 `null` 或 `undefined` 时才取右边）：

```js
const name = res.name ?? '匿名用户'
```

别图省事写成 `||`。`||` 会把 `0`、`''`、`false` 都当成“没值”，库存为 0 时会被错误地替换成默认值：

| 写法 | `undefined` | `null` | `0` / `''` / `false` |
| --- | --- | --- | --- |
| 解构默认值 `= x` | 用默认值 | 保留 `null` | 保留原值 |
| `?? x` | 用默认值 | 用默认值 | 保留原值 |
| `\|\| x` | 用默认值 | 用默认值 | **被替换成 x** |

**怎么避免再犯**：外部数据（接口、本地存储、URL 参数）一律用 `??` 兜底；数字和布尔字段绝不用 `||`。

## 3. 数组方法：写“想要什么”，而不是“怎么循环”

### 原理：数组方法是一条流水线

`filter`、`map`、`reduce` 像流水线上的工位：每个工位只做一件事，不改动原料（原数组），把产出的新数组交给下一个工位。

```text
订单列表 ──filter(已支付)──► 已支付订单 ──map(取金额)──► [88, 56] ──reduce(求和)──► 144
```

```js
const orders = [
  { amount: 88, paid: true },
  { amount: 120, paid: false },
  { amount: 56, paid: true }
]

const paidTotal = orders
  .filter((order) => order.paid)
  .map((order) => order.amount)
  .reduce((sum, amount) => sum + amount, 0)

console.log(paidTotal) // 144
```

| 方法 | 返回 | 什么时候用 |
| --- | --- | --- |
| `map` | 新数组（长度不变） | 每一项都要转换 |
| `filter` | 新数组（可能变短） | 只保留满足条件的项 |
| `find` | 单项或 `undefined` | 找第一个匹配项 |
| `some` / `every` | 布尔值 | 是否存在 / 是否全部满足 |
| `reduce` | 任意值 | 求和、分组、把数组变成对象 |

### 坑：`reduce` 不给初始值，空数组直接崩

**现象**：本地测试一切正常，线上某个“还没有订单”的用户打开页面直接白屏，控制台报 `TypeError: Reduce of empty array with no initial value`。

**原因**：不传初始值时，`reduce` 拿第一项当初始值；数组为空就没有第一项，只能报错。这种 bug 只在“数据为空”时出现，开发阶段很难碰到。

**修复**：永远传初始值。

```js
const bad = items.reduce((sum, n) => sum + n)     // ❌ 空数组时报错
const good = items.reduce((sum, n) => sum + n, 0) // ✅ 空数组时得到 0
```

### 坑：`sort` 默认按字符串排序，还会改原数组

**现象**：`[10, 9, 1].sort()` 得到 `[1, 10, 9]`；而且排完序后，另一个组件里显示的原始列表顺序也变了。

**原因**：`sort` 不传比较函数时，会把元素转成字符串逐字比较（`"10"` 排在 `"9"` 前面）；并且它**原地修改**数组，所有引用这个数组的地方都会受影响。

**修复**：数字排序传比较函数；排序前先复制。

```js
const sorted = [...scores].sort((a, b) => a - b) // 升序，不影响 scores
// 运行环境支持 ES2023 时，也可以用不修改原数组的 toSorted
const sorted2 = scores.toSorted((a, b) => a - b)
```

::: details 同类经典坑：`['1', '2', '3'].map(parseInt)` 为什么得到 `[1, NaN, NaN]`
`map` 会给回调传三个参数：元素、下标、数组。`parseInt` 的第二个参数恰好是进制，于是实际执行的是 `parseInt('1', 0)`、`parseInt('2', 1)`、`parseInt('3', 2)`：进制 1 不合法，二进制里也没有 `3`。修复方法是写清楚参数：`list.map((s) => Number(s))`。教训：**把现成函数直接传给数组方法前，先确认它的参数含义。**
:::

## 4. ES Module：导入的是“窗口”，不是“复印件”

### 原理：活的绑定

ES Module 的 `import` 拿到的不是导出值的拷贝，而是一扇能看到原变量的窗口（**live binding**）：导出方改了值，导入方马上能看到；但导入方不能透过窗口去改它。

```js
// counter.js
export let count = 0
export function increment() {
  count += 1
}

// main.js
import { count, increment } from './counter.js'

increment()
console.log(count) // 1 —— 看到的是最新值
count = 5          // TypeError: Assignment to constant variable.
```

### 坑：在别的文件里直接改导入的变量

**现象**：想在 `main.js` 里重置计数，写 `count = 0`，运行时报 `Assignment to constant variable`，可是 `counter.js` 里明明用的是 `let`。

**原因**：所有导入的绑定在导入方看来都是只读的，不管导出方用 `let` 还是 `const`。

**修复**：让“拥有数据的模块”提供修改函数，比如 `export function reset() { count = 0 }`。

**怎么避免再犯**：一个模块只导出它负责的能力（函数、常量），共享状态的修改入口只留一个。这样出了问题，只需要在一个地方打断点。

## 5. Proxy：给对象装一个“门卫”

`Proxy` 可以拦截对对象的读、写、删除等操作。Vue 3 的响应式就是用它实现的：你给数据赋值时，门卫顺手通知界面更新。

```js
function watch(target, onChange) {
  return new Proxy(target, {
    set(object, key, value, receiver) {
      const previous = Reflect.get(object, key, receiver)
      const ok = Reflect.set(object, key, value, receiver)
      if (previous !== value) onChange(key, value, previous)
      return ok
    }
  })
}

const raw = { count: 0 }
const state = watch(raw, (key, value) => console.log(`${key} → ${value}`))

state.count += 1 // 打印 count → 1
raw.count += 1   // 什么也不打印：绕过了门卫
```

最后一行就是一个真实的坑：**只有通过代理对象的操作才会被拦截**。在 Vue 3 里，如果你把 `reactive()` 之前的原始对象存起来再修改，界面不会更新。业务代码一般不需要自己写 `Proxy`，但理解这一点能帮你看懂框架的“更新失灵”问题。

## 排查思路：遇到“值不对”时先问三个问题

1. **它此刻在哪个作用域？** 在 DevTools 的 Sources 面板打断点，看右侧 Scope 区域，确认读到的是哪一层的同名变量。
2. **它是 `undefined` 还是 `null`？** 用 `console.log(value === null, value === undefined)` 区分；两者的兜底方式不同。
3. **有没有别人改了共享对象？** 开发环境把共享对象 `Object.freeze` 一下。ES Module 默认是严格模式，谁再给冻结对象赋值会直接抛出 `TypeError`，调用栈里就是“谁改的”。

## 检查清单

- [ ] 默认 `const`，确实需要重新赋值才用 `let`，不再写 `var`
- [ ] 外部数据兜底用 `??`，不指望解构默认值挡住 `null`
- [ ] 每个 `reduce` 都传了初始值
- [ ] 排序前先复制，数字排序传比较函数
- [ ] 不在导入方直接修改导入的变量，共享状态只留一个修改入口

## 延伸阅读

- [闭包与作用域](/web/JavaScript/closure)：块级作用域在循环和回调里的表现
- [异步流程与 Promise](/web/JavaScript/async)：数组方法遇到 `async` 时的坑
- [模块化演进](/web/JavaScript/modules)：从 IIFE 到 ES Module 的来龙去脉
