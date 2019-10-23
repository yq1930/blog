### 一、var 、let 和 const

- var

  - var 声明的变量会被提升到作用域顶端 可以在变量声明前使用

- let const

  - 暂时性死区 不能在变量未声明的情况下使用 而且不能重复使用

  - 变量提升原因是为了解决函数间相互调用的情况

- 总结:
  - 1.  提升: 函数 > 变量 函数提升会把整个函数提升到作用域顶部, 变量提升只会把声明
        提交到作用域顶部
  - 2. var 可以在声明前使用 let/const 不可以在声明前使用,存在暂时性死区
  - 3. const 声明常量 不能再次赋值
  - 4. let const 作用范围是块级作用域，var 则是函数作用域
  - 5. let const 相同的变量名不能重复声明

### 二、原型继承 和 Class 继承

#### 组合继承

```javascript
function Parent(value) {
  this.val = value;
}

Parent.prototype.getValue = function() {
  console.log(this.val);
};

function Child(value) {
  Parent.call(this, value);
}

Child.prototype = new Parent();

const child = new Child(1);

child.getValue();
// child instanceof Parent;
console.log(child instanceof Parent);
```

#### 寄生组合继承

```javascript
function Parent(value) {
  this.val = value;
}

Parent.prototype.getValue = function() {
  console.log(this.val);
};

function Child(value) {
  Parent.call(this, value);
}

Child.prototype = Object.create(Parent.prototype, {
  constructor: {
    value: Child,
    enumerable: false,
    writable: true,
    configurable: true
  }
});

const child = new Child(1);

child.getValue();
// child instanceof Parent;
console.log(child instanceof Parent);
```

#### Class 继承

```javascript
class Parent {
  constructor(value) {
    this.val = value;
  }
  getValue() {
    console.log(this.val);
  }
}

class Child extends Parent {
  constructor(value) {
    super(value);
  }
}

let child = new Child(1);
child.getValue();
console.log(child instanceof Parent);
```

### 三、模块化

#### 1. AMD 和 CMD

- 写法

```javascript
// AMD
define(["./a", "./b"], function(a, b) {
  a.do();
  b.do();
});

// CMD
define(function(require, exports, module) {
  var a = require("./a");
  a.doSomething();
});
```

#### 2. CommonJS

- 写法

```javascript
// a.js
module.exports = {
  a: 1
};

exports.a = 1; //(或者这样写)

// b.js
var module = require("./a.js");
module.a;
```

#### 3. ES Module

- 写法

```javascript
// 引入模块
import a from "./a.js";
import { a } from "./a.js";

// 导出模块
export function a() {}

export default a(){}
```

### 四、Proxy

- 作用：用来自定义对象。在 Vue3.0 中将通过 Proxy 替换 Object.defineProperty
- 原因：Proxy 无需一层层递归为每个属性添加代理，一次即可完成，并且性能上更好，缺点：兼容性不好

```javascript
let onWatch = (obj, setBind, getLogger) => {
  let handler = {
    get(target, property, receiver) {
      getLogger(target, property);
      return Reflect.get(target, property, value);
    },
    set(target, property, value, receiver) {
      setBind(value, property);
      return Reflect.set(target, property, value);
    }
  };
  return new Proxy(obj, handler);
};

let obj = { a: 1 };

let p = onWatch(
  obj,
  (v, property) => {
    console.log(`监听属性${property}改变${v}`);
  },
  (target, property) => {
    console.log(`'${property}' = ${target[property]}`);
  }
);

p.a = 2;
p.a;
```

### 五、map、filter、reduce

#### map

- 作用：遍历原数组，生成新数组
- 3 个参数：当前索引元素 索引 原数组

```javascript
[1, 2, 3].map(v => v + 1);
```

#### filter

- 作用：遍历原数组，将返回 true 的元素放入新数组
- 3 个参数：当前索引元素 索引 原数组

```javascript
let arr = [1, 2, 3];
let newArr = arr.filter(item => item !== 3);
console.log(newArr); // => [1, 2]
```

#### reduce

- 作用：将数组中的元素通过回调函数最终转换为一个值
- 2 个参数：回调函数 初始值
- 回调函数：4 个参数 => 累计值 当前元素 当前索引 原数组

```javascript
let arr = [1, 2, 3];
let sum = arr.reduce((acc, current) => acc + current, 0);
console.log(sum);
```
