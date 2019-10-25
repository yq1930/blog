## window 浏览器窗口

1. innerWidth:浏览器窗口内部宽度
2. innerHeight:浏览器窗口内部高度

3. outerWidth:浏览器整个窗口宽度
4. outerHeight:浏览器整个窗口高度

#### navigator 浏览器信息

1. navigator.appName: 浏览器名称
2. navigator.appVersion: 浏览器版本
3. navigator.language: 浏览器设置语言
4. navigator.platform: 操作系统类型
5. navigator.userAgent: 浏览器设定的 User-Agent 字符串

#### screen 屏幕信息

1. screen.width: 屏幕宽度 单位：像素
2. screen.height: 屏幕高度 单位：像素
3. screen.colorDepth: 返回颜色数位

#### location 当前页面 url 地址信息

1. location.assign() 加载一个新页面
2. location.reload() 加载当前页面

#### document 当前页面, 也就是整个 DOM 树的根节点

## 操作 DOM

#### DOM 操作

1. 更新
2. 遍历
3. 添加
4. 删除

##### 第一种获取方式

- ID 获取: document.getElementById()
- class 获取: document.getElementsByClassName()
- 标签获取: document.getElementsByTagName()

##### 第二种获取方式

- querySelector() => 获取指定节点
- querySelectorAll() => 获取全部节点

## 更新 DOM

1. innerHTML

```javascript
// <p id="p-id">...</p>
var p = document.querySelector("#p-id");
p.innerHTML = "xxx";
```

2. innerText(不返回隐藏元素的文本) / innerContent(返回所有文本, IE<9 不支持 textContent)

```javascript
// <p id="p-id">...</p>
var p = document.querySelector("#p-id");
p.innerText = "xxx";
```

3. css 操作

```javascript
// <p id="p-id">...</p>
var p = document.querySelector("#p-id");

// 在javascript中需要驼峰写法
p.style.color = "#xxxxx";
p.style.backgroundColor = "#xxxx";
```

#### 插入 DOM

- 1. appendChild 把一个子节点添加到父节点的最后一个子节点

```html
<p id="js">JavaScript</p>
<div id="list">
  <p id="java">Java</p>
  <p id="python">Python</p>
  <p id="scheme">Scheme</p>
</div>

<script>
  // 把<p id="js">JavaScript</p>添加到<div id="list">的最后一项：

  var js = document.getElementById("js"),
    list = document.getElementById("list");
  list.appendChild(js);
</script>
```

- 2. insertBefore 把子节点插入到指定的位置
- 用法: parentElement.insertBefore(newElement,referenceElement)

```html
<div id="list">
  <p id="java">Java</p>
  <p id="python">Python</p>
  <p id="scheme">Scheme</p>
</div>

<script>
  var list = document.getElementById("list"),
    ref = document.getElementById("python"),
    haskell = document.createElement("p");

  haskell.id = "haskell";
  haskell.innerText = "Haskell";
  list.insertBefore(haskell, ref);
</script>
```

#### PS:[来源：廖雪峰 JavaScript 教程 - 浏览器](https://www.liaoxuefeng.com/wiki/1022910821149312/1023022129105888)
