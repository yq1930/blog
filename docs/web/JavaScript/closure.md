---
title: 闭包与作用域
description: 闭包就是函数随身带着“出生地”的变量。理解这一点，就能解释循环打印 3 3 3、回调读到旧值、页面越用越卡这三类 bug。
---

# 闭包与作用域

闭包不是一种特殊语法，几乎每个回调函数都是闭包。它好用的时候你感觉不到，出问题时却很迷惑：

- 循环里注册的三个回调，打印出来全是 `3`；
- 定时器里读到的永远是旧数据；
- 弹窗开关几次之后，页面越来越卡。

这三个现象背后是同一个原理：**函数会记住它被创建时周围的变量**。

::: tip 读完这篇你会
- 用“背包”模型理解闭包，说清它捕获的是变量而不是值
- 用闭包写出私有状态和防抖函数
- 定位并修复循环闭包、过期闭包和闭包导致的内存泄漏
:::

## 1. 原理：变量去哪找，写代码时就定了

JavaScript 查找变量的规则叫**词法作用域**：函数能看到哪些变量，取决于它**写在哪里**，而不是**在哪里被调用**。

```js
const name = '外层'

function show() {
  return name // 写在外层旁边，所以找到的是外层的 name
}

function run() {
  const name = 'run 内部'
  return show() // 在这里调用，但 show 看不到 run 里的 name
}

run() // '外层'
```

查找过程是一层层往外：先找函数自己，再找外层函数，一直到全局，找不到就抛 `ReferenceError`。

## 2. 闭包：函数背着一个“背包”

函数被创建的那一刻，会背上一个背包，里面装着它能访问的外层变量。之后不管这个函数被带到哪里执行，背包都跟着它。

```js
function makeCounter() {
  let count = 0 // 装进背包
  return {
    inc() {
      count += 1
      return count
    },
    get() {
      return count
    }
  }
}

const counter = makeCounter()
counter.inc() // 1
counter.inc() // 2
counter.get() // 2
// 外部没有任何办法直接改 count，它成了真正的私有变量
```

关键细节：**背包里装的是变量本身（引用），不是拍照留下的值**。`inc` 和 `get` 共享同一个 `count`，所以一个改了，另一个能看到。后面三个坑都和这一点有关。

### 实用技能：用闭包写防抖

搜索框每输入一个字都发请求太浪费。防抖（debounce）的意思是：连续触发时只执行最后一次。实现它正好用到闭包：`timer` 必须在多次调用之间保留下来。

```js
function debounce(fn, wait = 300) {
  let timer = null // 每次调用共享的背包变量

  return function (...args) {
    clearTimeout(timer) // 新输入来了，取消上一次的计划
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

const onInput = debounce((event) => {
  search(event.target.value)
}, 300)

input.addEventListener('input', onInput)
```

## 3. 坑一：循环里的回调全都打印最后一个值

**现象**：

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
// 打印 3 3 3，而不是 0 1 2
```

**原因**：`var` 没有块级作用域，整个循环只有**一个** `i`。三个回调背包里装的是同一个变量，等它们执行时，循环早已结束，`i` 已经是 `3`。

**修复**：把 `var` 换成 `let`。`let` 在每一轮循环都会创建一个新的 `i`，三个回调各自背着不同的变量。

```js
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0) // 0 1 2
}
```

**怎么避免再犯**：不再使用 `var`。在老代码里看到 `var` + 循环 + 回调（`setTimeout`、事件绑定、请求回调）的组合，就要警惕。

## 4. 坑二：过期闭包——回调读到的永远是旧值

**现象**：页面上的设置已经切换成深色主题，但点击按钮时打印的还是浅色。

```js
let settings = { theme: 'light' }

function bindButton(current) {
  button.addEventListener('click', () => {
    console.log(current.theme) // 读的是绑定那一刻传进来的对象
  })
}

bindButton(settings)
settings = { theme: 'dark' } // 换成了一个新对象
// 点击按钮：仍然打印 'light'
```

**原因**：监听器只在绑定时创建一次，它的背包里装的是参数 `current`，而 `current` 指向的是旧对象。外面的 `settings` 被重新赋值，指向了新对象，但没人通知监听器。

**修复**：让回调在**执行时**再去读最新的数据，而不是依赖创建时捕获的值。

```js
button.addEventListener('click', () => {
  console.log(settings.theme) // 每次点击时读取当前的 settings
})
```

::: details 框架里的同类问题
- **React**：`useEffect(() => { setInterval(() => setCount(count + 1), 1000) }, [])` 里的 `count` 永远是第一次渲染时的 `0`。改成函数式更新 `setCount((c) => c + 1)`，让 React 把最新值传进来。
- **Vue 3**：在 `setup` 里写 `const title = props.title`，拿到的是那一刻的值，之后父组件更新了它也不会变。需要保持响应时用 `computed(() => props.title)` 或 `toRef(props, 'title')`。

本质都一样：**只执行一次的代码里创建的闭包，捕获的是那一刻的数据**。
:::

**怎么避免再犯**：写回调前问自己一句——这个回调会被执行很多次，而它读的数据会变吗？会变，就在回调内部读取最新值，或者让框架把最新值传进来。

## 5. 坑三：闭包让大对象无法回收，页面越用越卡

**现象**：一个弹窗反复打开关闭十几次后，页面明显变卡，内存一直上涨；窗口缩放时，同一段布局代码被执行了十几遍。

```js
function openDialog() {
  const bigData = loadHugeTable() // 很大的数据
  window.addEventListener('resize', () => {
    layout(bigData)
  })
}
```

**原因**：每次打开弹窗都往 `window` 上加了一个新监听器，而关闭时从没移除。`window` 一直存在，监听器就一直存在，它背包里的 `bigData` 也就永远无法被垃圾回收。

**修复**：关闭时移除监听器。`AbortController` 可以一次性取消用同一个 `signal` 绑定的所有监听：

```js
function openDialog() {
  const bigData = loadHugeTable()
  const controller = new AbortController()

  window.addEventListener('resize', () => layout(bigData), {
    signal: controller.signal
  })

  return function closeDialog() {
    controller.abort() // 监听器被移除，bigData 可以被回收
  }
}
```

**怎么避免再犯**：给“长寿对象”（`window`、`document`、全局 store、定时器）挂回调时，同时写好对应的清理代码。在 Vue 里放进 `onUnmounted`，在 React 里放进 `useEffect` 的返回函数。

> 不是所有闭包都会泄漏。只有当闭包被一个活得很久的东西持有时，它背包里的变量才会迟迟释放。

## 排查思路

**读到旧值或错误的值时：**

1. 在回调里打断点，看 DevTools 右侧 Scope 面板的 **Closure** 一栏，它列出的就是这个函数背包里的变量和当前值。
2. 对照“这个回调是什么时候创建的”：如果它只在初始化时创建一次，基本就是过期闭包。

**怀疑内存泄漏时：**

1. 打开 DevTools 的 Memory 面板，拍一次堆快照（Heap snapshot）。
2. 重复执行可疑操作（如打开关闭弹窗）几次，再拍一次。
3. 对比两次快照，看哪类对象数量一直增长；搜索 `Detached` 可以找到已经从页面移除、却仍被引用的 DOM 节点。
4. 选中可疑对象，看下方 Retainers（引用链），通常能一路追到某个没有移除的监听器或定时器。

## 检查清单

- [ ] 循环变量用 `let`，老代码里的 `var` + 回调组合要重点检查
- [ ] 会被多次执行的回调，在执行时读取最新数据
- [ ] 绑定到 `window` / `document` / 定时器上的回调，都有对应的清理代码
- [ ] 需要私有状态时用闭包或模块封装，而不是挂在全局变量上
- [ ] 不为了“看起来高级”把简单逻辑包成多层闭包

## 延伸阅读

- [原型与继承](/web/JavaScript/prototype)：`this` 是怎么丢的，箭头函数为什么能解决
- [事件循环与执行模型](/web/JavaScript/event-loop)：为什么 `setTimeout` 回调总在循环结束后才执行
- [Vue 性能优化](/web/vue/performance)：组件卸载时的清理清单
