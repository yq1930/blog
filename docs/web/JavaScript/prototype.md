## 原型继承用法

```javascript
function Student(props) {
  this.name = props.name || "大佬";
}

Student.prototype.say = function() {
  return "Hello" + this.name;
};

function PrimaryStudent(props) {
  Student.call(this, props);
  this.age = props.age || 18;
}

`// 不封装用法
// 1.创建F()空函数
var F = function() {};

// 2.F原型指向Student.prototype
F.prototype = Student.prototype;

// 3.PrimaryStudent原型指向一个新的new F()对象
PrimaryStudent.prototype = new F();

// 4.PrimaryStudent.prototype.constructor 修复成 PrimaryStudent
PrimaryStudent.prototype.constructor = PrimaryStudent;`;

// 封装上一段的函数 形成通用的 inherits
function inherits(Child, Parent) {
  var F = function() {};
  F.prototype = Parent.prototype;
  Child.prototype = new F();
  Child.prototype.constructor = Child;
}

inherits(PrimaryStudent, Student);

// 在PrimaryStudent上定义原型方法
PrimaryStudent.prototype.getAge = function() {
  return this.age;
};

// 创建小明
var xiaoming = new PrimaryStudent({
  name: "小明",
  age: 26
});

xiaoming.name; // 小明
xiaoming.age; // 26

xiaoming.__proto__ === PrimaryStudent.prototype; // true
xiaoming.__proto__.__proto__ === Student.prototype; // true

xiaoming instanceof PrimaryStudent; // true
xiaoming instanceof Student; // true

```

#### PS: &nbsp; [来源：廖雪峰 JavaScript 教程 原型继承](https://www.liaoxuefeng.com/wiki/1022910821149312/1023021997355072)
