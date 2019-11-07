# jQuery

### 1. 初识 jQuery

1.1 `$`被占用时

```javascript
$;
jQuery.noConflict();
$;
jQuery;
```

1.2 是否引用`$`

```javascript
$.fn.jquery;
```

---

### 2. 选择器

2.1 按 ID 查找

```javascript
// <div id="abc"></div>
// 返回的对象是jQuery对象
// 不会返回null / undefined
var div = $("#abc");
```

2.2 按 tag 查找

```javascript
var ps = $("p"); // 返回所有的p节点
ps.length; // 页面有多少个节点
```

2.3 按 class 查找

```javascript
// <div class="red"></div>
// <div class="blue red"></div>
var a = $(".red"); // 所有包含class='red'都将返回
```

2.4 按属性查找

- 属性值包含空格等特殊字符时，需要使用 `" "`

```javascript
// 按属性查找
var email = $("[name = email]");
```

```javascript
// 按属性中前缀/后缀查找

// name = 'icon-1', name = 'icon-2'
var iocns = $("[name ^= icon]"); // 所有name属性值以icon开头的DOM

// name = 'startwith', name = 'endwith'
var names = $("[name $= with]"); // 所有name属性值以with结尾的DOM
```

2.5 组合查找

- 简单选择器组合使用

```javascript
var emailInput = $("input[name = email]"); // 不会找出<div name="email"></div>
```

2.6 多项选择器

- 多个选择器用`,`组合起来一块选

```javascript
$("p,div"); // 把<p>和<div>都选择出来
$("p.red,p.green"); // 把<p class="red"></p>和<p class="green"></p>都选出来
```

---

### 3. 层级选择器

3.1 层级选择器(Descendant Selector)

`$(a b)`

- 层级之间可以用空格隔开

```html
<div class="testing">
  <ul class="lang">
    <li class="lang-javascript">JavaScript</li>
    <li class="lang-python">Python</li>
    <li class="lang-lua">Lua</li>
  </ul>
</div>
```

```javascript
$("ul.lang li.lang-javascript");
// or
$("div.testing li.lang-javascript");
```

3.2 子选择器(Child Selector)

`$(parent > child)`

3.3 过滤器(Filter)

```javascript
$("ul.lang li");
$("ul.lang li:first-child");
```

3.4 表单

- `:input`: `可以选择<input> / <textarea> / <select> / <button>`

- `:file`: `可以选择<input type="file"> 等于 input[type=file]`

- `:checkbox`: `等于input[type=checkbox]`

- `:radio`: `等于input[type=radio]`

- `:focus`: `选择当前输入焦点元素 $('input:focus')`

- `:checked`: `选择当前勾上单选框和复选框 $('input[type=radio]:checked')`

- `:enabled`: `可以选择正常输入<input> <select>等, 也就是没有灰掉的输入`
- `:disabled`: `和:enabled正好相反, 选择那些不能输入的`

---

### 4. 查找/过滤

4.1 查找

```html
<ul class="lang">
  <li class="js dy">JavaScript</li>
  <li class="dy">Python</li>
  <li id="swift">Swift</li>
  <li class="dy">Scheme</li>
  <li name="haskell">Haskell</li>
</ul>
```

- find(): 查找某一个节点的所有子节点

```javascript
var ul = $("ul.lang");
var dy = ul.find(".dy"); // 获得JavaScript, Python, Scheme
var swf = ul.find("#swf"); // 获得Swift
var hsk = ul.find("[name=haskell]"); // 获得Haskell
```

- parent(): 从当前节点开始向上查找

```javascript
var swf = $("#swift"); // 获得Swift
var parent = swf.parent(); // 获得Swift的上层节点<ul>
var a = swf.parent(".red"); // 获得Swift的上层节点<ul>，同时传入过滤条件。如果ul不符合条件，返回空jQuery对象
```

- next()/prev(): 同一层级节点

```javascript
var swf = $("#swift");
swf.next(); // 获得Scheme
swf.next("[name=haskell]"); // 空的jQuery对象，因为Swift的下一个元素Scheme不符合条件[name=haskell]

swf.prev(); // 获得Python
swf.prev(".dy"); // 获得Python
```

4.2 过滤

- filter(): 可以过滤掉不符合选择器条件的节点

```javascript
var langs = $("ul.lang li"); // 拿到JavaScript, Python, Swift, Scheme和Haskell
var a = langs.filter(".dy"); // 拿到JavaScript, Python, Scheme

// or
var langs = $("ul.lang li");
langs.filter(function() {
  return this.innerHTML.indexOf("S") === 0; // 返回S开头的节点
});
// 获得Swift, Scheme
```

- map(): 把一个 jQuery 对象包含若干 DOM 节点转化为其他对象

```javascript
var langs = $("ul.lang li"); // 获得JavaScript, Python, Swift, Scheme和Haskell
var arr = langs
  .map(function() {
    return this.innerHTML;
  })
  .get();
console.log(arr); // ['JavaScript', 'Python', 'Swift', 'Scheme', 'Haskell']
```

- 包含不止一个 DOM 节点, first() last() slice()可以返回一个新 jQuery 对象, 不需要 DOM 节点去掉

```javascript
var langs = $("ul.lang li"); // 获得JavaScript, Python, Swift, Scheme和Haskell
var js = langs.first(); // avaScript 相当于$('ul.lang li:first-child')
var haskell = langs.last(); //Haskell 相当于$('ul.lang li:last-child')
var sub = langs.slice(2, 4); //Swift, Scheme, 参数与数组的slice()方法一致
```

---

### 5. 操作 DOM

5.1 text() 和 html()

- text(): 获取节点文本
- html(): 获取节点原始 html 文本
- 在 text(): 无参数调用是获取文本, 有参数是设置文本

```html
<ul id="test-ul">
  <li class="js">JavaScript</li>
  <li name="book">Java &amp; JavaScript</li>
</ul>

<script type="text/javascript">
  $("#test-ul li[name=book]").text(); // 'Java & JavaScript'
  $("#test-ul li[name=book]").html(); // 'Java &amp; JavaScript'
</script>
```

5.2 css()

```javascript
div.css("color"); // 获取css属性
div.css("color", "#333"); // 设置css属性
div.css("color", ""); // 清除css属性

div.hasClass("highlight"); // 判断是否含有highlight这个class
div.addClass("highlight"); // 添加highlight这个class
div.removeClass("highlight"); // 删除highlight属性这个class
```

5.3 显示 和 隐藏 DOM

- `show() 和 hide()`

```javascript
// hide()方法是隐藏DOM节点，并不是删除节点
```

5.4 获取 DOM 信息

- `attr() 和 removeAttr()`

```javascript
// <div id="a" name="A"></div>
var div = $("#a");
div.attr("B"); // undefined
div.attr("name"); // A
div.attr("name", "B"); // name='B'
div.removeAtt("name"); //删除name属性
div.attr("name"); //undefined
```

- `prop()`

```javascript
// <input id="test-radio" type="radio" name="test" checked value="1">
var ra = $("#test-radio");
ra.attr("checked"); // checked
ra.prop("checked"); //true

ra.is(":checked"); // true
```

5.5 操作表单

- val()方法获取和设置对应的 value 属性

```html
<input id="test-input" name="email" value="" />
<select id="test-select" name="city">
  <option value="BJ" selected>Beijing</option>
  <option value="SH">Shanghai</option>
  <option value="SZ">Shenzhen</option>
</select>
<textarea id="test-textarea">Hello</textarea>

<script type="text/javascript">
  var input = $("#test-input"),
    select = $("#test-select"),
    textarea = $("#test-textarea");

  input.val(); // 'test'
  input.val("abc@example.com"); // 文本框的内容已变为abc@example.com

  select.val(); // 'BJ'
  select.val("SH"); // 选择框已变为Shanghai

  textarea.val(); // 'Hello'
  textarea.val("Hi"); // 文本区域已更新为'Hi'
</script>
```

---

### 6.修改 DOM 结构

6.1 添加 DOM

- `append(): 把DOM添加到最后`
- `prepend(): 把DOM添加到最前`
- `after() / before(): 把新节点插入指定位置(同级节点)`

```html
<div id="test-div">
  <ul>
    <li><span>JavaScript</span></li>
    <li><span>Python</span></li>
    <li><span>Swift</span></li>
  </ul>
</div>

<script type="text/javascript">
  var ul = $("#test-div > ul");
  ul.append("<li><span>Java</span></li>");

  var ps = document.createElement("li");
  ps.innerHTML = "<sapn>Pascal</sapn>";

  ul.append(ps);
  ul.append($("#scheme"));

  ul.append(function(index, html) {
    return "<li><span>Language - " + index + "</span></li>";
  });
</script>
```

6.2 删除节点

- `remove(): 删除DOM节点`

### 7.事件

7.1 鼠标事件

- click: 鼠标单击时触发
- dblclick: 鼠标双击时触发
- mouseenter: 鼠标进入时触发
- mouseleave: 鼠标移出时触发
- mousemove: 鼠标在 DOM 内部移动时触发
- hover: 鼠标进入和退出时触发两个函数, 相当于 mouseenter + mouseleave

```javascript
```

7.2 键盘事件

- keydown: 键盘按下时触发
- keyup: 键盘松开时触发
- keypress: 按一次键后触发

```javascript
```

7.3 其他事件

- focus: 当 DOM 获得焦点时触发
- blur: 当 DOM 失去焦点时触发
- change: 当`<input> <select> <textarea>`的内容改变时触发
- submit: 当`<form>`提交时触发
- ready: 当页面被载入并 DOM 树完成初始化后触发(仅作用于 document 对象)

```javascript
// ready事件

// 第一种写法:
$(document).on("ready", function() {
  $("#testForm").on("submit", function() {
    alert("submit");
  });
});

// 第二种写法:
$(document).ready(function() {
  $("#testForm").submit(function() {
    alert("submit");
  });
});

// 第三种写法:
$(function() {
  // ...
});
```

7.4 事件参数

7.5 取消绑定

- `off('click',function)`:解除绑定

```javascript
function hello() {
  console.log("hello");
}

a.click(hello); // 绑定事件

// 解除绑定
setTimeout(function() {
  a.off("click", hello);
}, 10000);

// 无效写法
a.click(function() {
  console.log("hello");
});

a.off("click", function() {
  console.log("hello");
});
```

7.6 事件触发条件

7.7 浏览器安全限制

### 8. 动画

8.1 show() / hide() / toggle()

- 左上角逐渐展开/收缩
- `show(): 逐渐显示`
- `hide(): 逐渐隐藏`
- `toggle(): 根据当前状态决定show() / hide()`

```html
<!-- css -->
<!-- 
#test {
  width: 100px;
  height: 100px;
  background: red;
} -->

<div id="test"></div>
<button id="btn1">隐藏</button>
<button id="btn2">显示</button>
<button id="btn3">隐藏和显示</button>

<script type="text/javascript">
  var t = $("#test");
  var b1 = $("#btn1");
  var b2 = $("#btn2");
  var b3 = $("#btn3");

  b1.click(function() {
    t.hide(1000);
  });

  b2.click(function() {
    t.show(1000);
  });

  b3.click(function() {
    t.toggle(1000);
  });
</script>
```

8.2 sildeUp() / sildeDown() / sildeToggle()

- 垂直方向逐渐展开/收缩
- `sildeUp(): 垂直逐渐显示`
- `sildeDown(): 垂直逐渐隐藏`
- `sildeToggle(): 根据当前状态决定sildeUp() / sildeDown()`

```html
<!-- css -->
<!-- #test {
  height: 300px;
}

#cube {
  width: 100px;
  height: 50px;
  background: red;
  padding-top: 50px;
} -->

<button id="btn1">隐藏</button>
<button id="btn2">显示</button>
<button id="btn3">隐藏和显示</button>

<div id="test">
  <div id="cube"></div>
</div>

<script type="text/javascript">
  var t = $("#test");
  var b1 = $("#btn1");
  var b2 = $("#btn2");
  var b3 = $("#btn3");

  b1.click(function() {
    t.hide(1000);
  });

  b2.click(function() {
    t.show(1000);
  });

  b3.click(function() {
    t.toggle(1000);
  });
</script>
```

8.3 fadeLn() / fadeOut() / fadeToggle()

- 动画效果： 淡入淡出

```html
<!-- css -->
<!-- #test {
  height: 300px;
}

#cube {
  width: 100px;
  height: 50px;
  background: red;
  padding-top: 50px;
} -->

<button id="btn1">隐藏</button>
<button id="btn2">显示</button>
<button id="btn3">隐藏和显示</button>

<div id="test">
  <div id="cube"></div>
</div>

<script type="text/javascript">
  var t = $("#cube");
  var b1 = $("#btn1");
  var b2 = $("#btn2");
  var b3 = $("#btn3");

  b1.click(function() {
    t.fadeOut(1000);
  });

  b2.click(function() {
    t.fadeIn(1000);
  });

  b3.click(function() {
    t.fadeToggle(1000);
  });
</script>
```

8.4 自定义动画 / 串行动画

- animate()

  - 传入的参数就是 css 最后的状态;也可以传入一个回调函数

```javascript
var div = $("#test-animate");
div.animate(
  {
    opacity: 0.25,
    width: "256px",
    height: "256px"
  },
  3000
); // 在3秒钟内CSS过渡到设定值

// 传入函数
div.animate(
  {
    opacity: 0.25,
    width: "256px",
    height: "256px"
  },
  3000,
  function() {
    console.log("动画已结束");
    // 恢复至初始状态:
    $(this)
      .css("opacity", "1.0")
      .css("width", "128px")
      .css("height", "128px");
  }
);
```

- delay()
  - 实现暂停

```javascript
var div = $('#test-animates');
// 动画效果：slideDown - 暂停 - 放大 - 暂停 - 缩小
div.slideDown(2000)
   .delay(1000)
   .animate({
       width: '256px',
       height: '256px'
   }, 2000)
   .delay(1000)
   .animate({
       width: '128px',
       height: '128px'
   }, 2000);
}
```

- jQuery 不支持`background-color`,用`transtion`来实现动画效果
- jQuery 动画是逐渐改变 css 值,无 block 性质的 DOM 无法改变

### 9. AJAX

9.1 ajax 介绍

- async: 是否异步执行 ajax 请求, 默认:true
- method: 请求方法, 默认:GET
- contentType: 发送'POST'请求格式, 默认:application/x-www-form-urlencoded; charset=UTF-8
- data: 发送数据,
- headers: 发送额外 HTTP 头, 必须是 object
- dataType: 接收数据格式, 'html','xml','json','text',空情况下 Content-Type 猜测

```javascript
var jqxhr = $.ajax("/api/categories", {
  dataType: "json"
});
// 请求已经发送了
```

9.2 GET()

```javascript
var jqxhr = $.get("/path/to/resource", {
  name: "yequn",
  check: 1
});

// 第二个参数是object, jQuery自动把它变成query string，然后添加到url后面
```

9.3 POST()

```javascript
// 传入第二个参数默认被序列化 application/x-www-form-urlencoded

var jqxhr = $.post("/path/to/resource", {
  name: "Bob Lee",
  check: 1
});

// name=Bob%20Lee&check=1
```

9.4 getJSON()

```javascript
// getJSON()快速通过GET获取一个JSON对象
var jqxhr = $.getJSON("/path/to/resource", {
  name: "Bob Lee",
  check: 1
}).done(function(data) {
  // data已经被解析为JSON对象了
});

// 跨域请求数据
// 使用JSONP
ajax({
  jsonp: "callback"
});
```

### 10. jQuery 扩展

10.1 编写插件

```javascript
$.fn.highlight1 = function() {
  this.css("backgroundColor", "#fffceb").css("color", "#d85030");
};
```
