---
title: 原型与继承
description: 用“自己不会就问师傅”的方式理解原型链，看懂 new 和 class 背后发生了什么，并避开共享数组、this 丢失等常见坑。
---

# 原型与继承

很多人写了几年 `class`，却说不清原型链。平时没关系，一旦遇到下面这些 bug 就会卡住：

- `xxx is not a function`，可方法明明定义了；
- 新建了两个实例，往一个里面加数据，另一个也变了；
- 把类的方法当回调传出去，`this` 突然变成 `undefined`。

这三个问题都能用一句话解释：**JavaScript 的对象会沿着原型链去“借”属性**。这篇先讲清这条链，再逐个拆坑。

::: tip 读完这篇你会
- 画出一个对象的原型链，知道属性是怎么找到的
- 说出 `new` 做的四件事，看懂 `class` 背后的原型关系
- 修复“实例共享数据”和“方法丢失 this”两类高频 bug
:::

## 1. 原理：找不到属性，就沿着原型链往上问

把对象想成一个学徒：被问到一个问题（读取属性）时，先看自己会不会；不会就去问师傅（原型）；师傅也不会就再往上问，一直问到祖师爷。祖师爷之上是 `null`，问到这里还没有答案，结果就是 `undefined`。

```js
const animal = {
  move() {
    return 'moving'
  }
}

const cat = Object.create(animal) // 创建一个以 animal 为原型的新对象
cat.name = 'Mochi'

cat.name   // 'Mochi'：自己就有
cat.move() // 'moving'：自己没有，从 animal 借来
cat.fly    // undefined：一路问到 null 都没有
```

```text
cat ──[[Prototype]]──► animal ──[[Prototype]]──► Object.prototype ──► null
 name                   move()                    toString()、hasOwnProperty()…
```

这就是为什么任何普通对象都能调用 `toString()`：它是从链条顶端的 `Object.prototype` 借来的。

如果 `cat` 自己也定义了 `move`，就会**遮蔽**原型上的同名方法，查找在第一层就结束了。

调试时用这两个工具看清链条：

```js
Object.getPrototypeOf(cat) === animal // true，查看“师傅”是谁
Object.hasOwn(cat, 'move')            // false，move 不是自己的，是借来的
```

> `__proto__` 是历史遗留的访问方式，调试时看看可以，业务代码里用 `Object.getPrototypeOf` / `Object.create`。

## 2. `new` 到底做了什么

构造函数配合 `new` 时，JavaScript 帮你做了四件事：

1. 创建一个空对象；
2. 把这个对象的原型指向 `构造函数.prototype`；
3. 把这个对象当作 `this`，执行构造函数；
4. 如果构造函数没有返回别的对象，就返回这个新对象。

手写一遍，原理就清楚了：

```js
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype) // 第 1、2 步
  const result = Constructor.apply(obj, args)     // 第 3 步
  return result instanceof Object ? result : obj  // 第 4 步
}

function Member(name) {
  this.name = name // 每个实例自己的数据
}
Member.prototype.greet = function () {
  return `你好，${this.name}` // 所有实例共享的方法
}

const m = myNew(Member, '小林')
m.greet() // '你好，小林'
```

规律是：**数据放在 `this` 上（每个实例一份），方法放在 `prototype` 上（所有实例共用一份）**。方法共享能省内存，但数据一旦也放进原型，就会出事。

### 坑：把数组放在原型上，所有实例共享同一份

**现象**：给团队 A 加了一个成员，团队 B 的成员列表里也出现了这个人。

```js
function Team() {}
Team.prototype.members = [] // ❌ 数组放在原型上

const a = new Team()
const b = new Team()
a.members.push('小林')
b.members // ['小林'] —— b 根本没加过
```

**原因**：`a.members` 在 `a` 自己身上找不到，于是借到了原型上的那个数组；`push` 修改的是这个共享数组本身。`b` 借到的是同一个数组。

**修复**：可变数据在构造函数里初始化，每个实例各有一份。

```js
function Team() {
  this.members = [] // ✅ 每个实例自己的数组
}
```

**怎么避免再犯**：原型（以及 `class` 的方法区）只放函数和真正的常量。用 `class` 时，把数据写在 `constructor` 或类字段里，就天然不会犯这个错。

## 3. `class` 是更好写的原型，不是另一套机制

`class` 和 `extends` 把上面的原型关系写得更直观，但底层仍然是原型链：

```js
class MemberProfile {
  constructor(name) {
    this.name = name
  }
  greet() {
    return `你好，${this.name}`
  }
}

class AdminProfile extends MemberProfile {
  constructor(name, permissions) {
    super(name) // 必须先调用父类构造函数，才能使用 this
    this.permissions = permissions
  }
  can(permission) {
    return this.permissions.includes(permission)
  }
}

typeof MemberProfile // 'function'：class 本质上还是函数
Object.getPrototypeOf(AdminProfile.prototype) === MemberProfile.prototype // true
```

```text
admin ──► AdminProfile.prototype ──► MemberProfile.prototype ──► Object.prototype ──► null
          can()                       greet()
```

如果在 `super()` 之前访问 `this`，会得到 `ReferenceError: Must call super constructor in derived class before accessing 'this'`。原因是子类实例要由父类构造函数先“造出来”，子类才能往上面加东西。

### 坑：把类方法当回调传出去，`this` 变成 `undefined`

**现象**：

```js
class Cart {
  constructor() {
    this.items = []
  }
  add(item) {
    this.items.push(item)
  }
}

const cart = new Cart()
;['苹果', '香蕉'].forEach(cart.add)
// TypeError: Cannot read properties of undefined (reading 'items')
```

**原因**：`this` 不是在定义时决定的，而是在**调用时**由“谁调用了它”决定。`cart.add` 被当作普通函数交给 `forEach`，调用时前面没有 `cart.`，`this` 就丢了。`class` 内部默认是严格模式，丢失的 `this` 是 `undefined`，于是报错。

**修复**：在调用处用箭头函数包一层，调用时仍然是 `cart.add(...)`：

```js
;['苹果', '香蕉'].forEach((item) => cart.add(item))
```

如果这个方法经常被传出去，也可以让它天生绑定实例：用类字段加箭头函数定义（箭头函数没有自己的 `this`，会捕获创建它时的实例），或在构造函数里写 `this.add = this.add.bind(this)`。

```js
class Cart {
  items = []
  add = (item) => {
    this.items.push(item)
  }
}
```

**怎么避免再犯**：方法需要被传出去（事件监听、定时器、数组方法）时，默认用箭头函数包一层。DOM 事件里还要注意：普通函数作为监听器时，`this` 指向触发事件的元素，而不是你的实例。

## 4. 继承还是组合？

继承表达稳定的“**是一个**”关系：管理员**是一个**成员。如果只是想给对象加一种能力（能导出、能记录日志），优先用组合，也就是“**有一个**”：

```js
function createExporter(format) {
  return { export: (data) => `${format}:${JSON.stringify(data)}` }
}

class Report {
  constructor(exporter) {
    this.exporter = exporter // 有一个导出器，随时可以替换
  }
  save(data) {
    return this.exporter.export(data)
  }
}

new Report(createExporter('csv')).save({ id: 1 })
```

多层继承的问题是：子类依赖父类的内部细节，父类一改，所有子类都可能出问题；组合的部件可以单独测试、按需替换。经验上，继承超过两层就该停下来想想能不能改成组合。

## 排查思路

遇到 “`xxx is not a function`” 或 “属性是 `undefined`”：

1. **在控制台 `console.dir(obj)`**，展开 `[[Prototype]]` 一层层看，方法到底挂在哪一层、有没有被同名属性遮蔽。
2. **确认对象是不是你以为的那个类型**：`obj instanceof AdminProfile`；从接口拿到的普通对象不会自动带上类的方法，需要 `new` 一次或手动转换。
3. **报错信息里有 `undefined (reading ...)` 时，先怀疑 `this`**：在方法第一行打断点，看 `this` 是什么，再往回找它是怎么被调用的。
4. **数据“串了”时，先怀疑共享引用**：用 `Object.hasOwn(obj, 'key')` 看这个属性是不是实例自己的。

## 检查清单

- [ ] 实例数据写在构造函数或类字段里，原型上只放方法
- [ ] 子类构造函数里先 `super()`，再用 `this`
- [ ] 类方法被当作回调传出去时，用箭头函数包一层或提前绑定
- [ ] 遍历对象用 `Object.keys` / `Object.entries`，不用 `for...in` 意外遍历到原型上的属性
- [ ] 继承超过两层时，考虑改用组合

## 延伸阅读

- [闭包与作用域](/web/JavaScript/closure)：箭头函数为什么能“记住”外层的 `this`
- [ES6：作用域、模块与数据处理](/web/JavaScript/ES6)：`const` 对象为什么还能被改
- [TypeScript 的类型边界](/web/JavaScript/types)：用类型避免把普通对象当成类实例
