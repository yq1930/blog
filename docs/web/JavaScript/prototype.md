---
title: 原型与继承
description: 从对象的原型链理解 class 语法，而不是把继承当成不可见的魔法。
---

# 原型与继承

JavaScript 的对象可以从另一个对象继承属性。这个“另一个对象”就是它的原型；查找属性时，运行时会沿着原型链向上查找，直到找到属性或抵达 `null`。

## 原型链如何工作

```js
const animal = {
  move() {
    return 'moving'
  }
}

const cat = Object.create(animal)
cat.name = 'Mochi'

console.log(cat.move()) // moving，来自 animal
console.log(Object.getPrototypeOf(cat) === animal) // true
```

当 `cat.move` 不存在时，JavaScript 才去 `animal` 上查找。若给 `cat` 自己定义 `move`，它会遮蔽原型上的同名方法。

> 调试时使用 `Object.getPrototypeOf(value)`。`__proto__` 是历史遗留访问器，不适合作为业务代码接口。

## 构造函数：共享方法放在 prototype 上

构造函数配合 `new` 会创建对象，并把对象的原型指向构造函数的 `prototype`。实例各自的数据放在 `this` 上，所有实例共享的行为放在 `prototype` 上。

```js
function Member(name) {
  this.name = name
}

Member.prototype.greet = function greet() {
  return `你好，${this.name}`
}

const member = new Member('南终')
console.log(member.greet())
```

不要在原型上放可变的数组或对象，否则所有实例会意外共享同一份数据。

```js
function Team() {
  this.members = [] // 每个实例各自拥有
}
```

## ES5 继承：构造函数与原型各做一件事

继承时，父构造函数负责初始化实例数据，子构造函数的原型负责复用父类型的方法。`Object.create` 可以避免执行一次父构造函数的副作用。

```js
function Employee(name, department) {
  Member.call(this, name)
  this.department = department
}

Employee.prototype = Object.create(Member.prototype)
Employee.prototype.constructor = Employee

Employee.prototype.introduce = function introduce() {
  return `${this.greet()}，来自${this.department}`
}
```

## `class` 是更清晰的语法，而不是另一套继承机制

`class` 和 `extends` 把同样的原型关系写得更直观。派生类的构造函数中必须先调用 `super()`，之后才能使用 `this`。

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
    super(name)
    this.permissions = permissions
  }

  can(permission) {
    return this.permissions.includes(permission)
  }
}
```

## 什么时候该用继承

继承表达的是稳定的“是一个（is-a）”关系。若只是把一段行为临时组合到对象中，优先考虑组合：把功能做成独立函数、服务或对象，按需注入。组合通常比多层继承更容易测试和演进。

- 用原型/`class` 表达一组同类对象的共享行为。
- 用组合表达可替换、可选的能力。
- 将状态放在实例上，将无状态的公共行为放在原型或模块中。
