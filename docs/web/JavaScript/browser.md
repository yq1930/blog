---
title: 浏览器与 DOM 操作
description: 讲清 DOM 树、事件冒泡和委托，修复“元素是 null”“新加的按钮点不动”“点一次触发好几次”和 innerHTML 导致的 XSS 等高频问题。
---

# 浏览器与 DOM 操作

直接操作 DOM 的代码在 Vue、React 项目里少了，但它没有消失：埋点脚本、第三方 SDK、老项目、组件里的 `ref` 操作，都还在用。这类代码的 bug 往往很“玄学”：本地好好的，换个加载顺序就报 `null`；列表刷新后按钮突然点不动；点一次触发了三次请求。

这篇从 DOM 的工作原理讲起，把这些问题逐个说清楚。

::: tip 读完这篇你会
- 知道脚本执行时 DOM 可能还没准备好，以及怎么避免
- 用事件冒泡和事件委托处理动态列表
- 避开重复绑定事件、XSS、URL 参数拼接错误等坑
:::

## 1. 原理：DOM 是一棵树，JS 通过 API 改它

浏览器把 HTML 解析成一棵对象树，叫 **DOM**（文档对象模型）。JavaScript 不能直接改 HTML 文本，只能通过 API 读写这棵树；浏览器发现树变了，再重新绘制页面。

```text
document
└── html
    ├── head
    └── body
        ├── header
        └── ul#todo-list
            ├── li  ← 每个节点都是一个 JS 对象
            └── li
```

浏览器还提供了几个常用的全局对象：

| 对象 | 负责什么 | 常见用途 |
| --- | --- | --- |
| `window` | 浏览器窗口和全局环境 | 定时器、视口大小、事件监听 |
| `document` | 当前页面的 DOM 树 | 查询、创建、修改元素 |
| `location` | 当前地址 | 读取查询参数、跳转 |
| `navigator` | 浏览器能力和环境 | 功能检测、语言偏好 |

布局判断用 `window.innerWidth`（视口宽度），不要用 `screen.width`（设备屏幕宽度，不随窗口变化）。

## 2. 坑一：`querySelector` 返回了 `null`

**现象**：控制台报 `Cannot read properties of null (reading 'addEventListener')`，可是页面上明明有这个按钮。

```html
<head>
  <script src="./app.js"></script> <!-- 这时 body 还没被解析 -->
</head>
<body>
  <button id="save">保存</button>
</body>
```

**原因**：浏览器是从上往下解析 HTML 的，遇到普通 `<script>` 会**停下来先执行它**。脚本运行时，下面的按钮还没被解析出来，DOM 树里根本没有它。

**修复**：让脚本在 DOM 解析完之后再执行。最简单的是加 `defer`，或者使用 `type="module"`（模块脚本默认就是延迟执行的）：

```html
<script src="./app.js" defer></script>
```

**怎么避免再犯**：新项目统一用 `defer` 或模块脚本；如果脚本是动态插入、执行时机不确定，可以先判断 `document.readyState`，必要时等待 `DOMContentLoaded` 事件。

## 3. 用稳定的标记选择元素

`querySelector` 返回第一个匹配的元素，`querySelectorAll` 返回所有匹配的元素（一个静态列表，不会随 DOM 变化自动更新）。

选择器应该依赖**专门给 JS 用的标记**，而不是样式类名：

```html
<button type="button" class="btn btn-primary" data-action="save">保存</button>
```

```js
const saveButton = document.querySelector('[data-action="save"]')
saveButton?.addEventListener('click', saveDraft)
```

如果 JS 依赖 `.btn-primary`，设计调整按钮颜色、把类名改成 `.btn-main` 时，功能就悄悄坏了。`data-*` 属性明确告诉所有人：“这个属性有脚本在用，别乱改。”

> 可选链 `?.` 能让“元素不存在”时安全跳过，但不要用它掩盖真正的错误。关键元素缺失时，开发环境应该直接报错。

## 4. 更新内容：默认用 `textContent`

| API | 会不会把字符串当 HTML 解析 | 建议 |
| --- | --- | --- |
| `textContent` | 不会 | 展示文本的默认选择 |
| `innerHTML` | 会 | 只用于可信的、确实需要 HTML 的内容 |
| `classList` | — | 切换样式状态 |
| `setAttribute` / `dataset` | — | 更新属性和语义 |

### 坑二：用 `innerHTML` 展示用户内容，被注入脚本（XSS）

**现象**：某个用户把昵称改成了 `<img src=x onerror="alert(document.cookie)">`，所有能看到他昵称的人页面都弹出了窗口。如果攻击者把 `alert` 换成把 Cookie 发到自己服务器的代码，就能冒充这些用户。

```js
list.innerHTML += `<li>${user.name}</li>` // ❌ 用户内容被当作 HTML 执行
```

**原因**：`innerHTML` 会把字符串当成 HTML 解析，字符串里的标签和事件属性会被真实执行。浏览器分不清哪些尖括号是“要展示的文字”，哪些是“要执行的标签”。这种攻击叫 **XSS**（跨站脚本攻击）。

**修复**：用 DOM API 创建元素，文本用 `textContent` 填充：

```js
function createUserItem(user) {
  const li = document.createElement('li')
  li.dataset.id = user.id
  li.textContent = user.name // 永远只当作文字
  return li
}

list.append(createUserItem(user))
```

**怎么避免再犯**：来自用户、接口、URL 的内容，默认不配被当作 HTML。确实需要展示富文本时，先用 DOMPurify 这类白名单净化库过滤。Vue 的 `v-html`、React 的 `dangerouslySetInnerHTML` 是同样的风险点，代码评审时要重点看。

## 5. 事件冒泡与事件委托

### 原理：事件会一层层往上传

点击一个按钮时，`click` 事件先在按钮上触发，然后依次传给它的父元素、祖父元素，一直到 `document`。这叫**事件冒泡**。

可以把它想成小区的快递：与其每家每户都雇一个人守门签收，不如让物业前台统一签收，再根据门牌号分发。**事件委托**就是只在父元素上绑一个监听器，通过 `event.target` 判断真正被点击的是谁。

### 坑三：列表刷新后，新加的按钮点不动

**现象**：页面初始化时给每个“删除”按钮绑定了点击事件。之后通过“加载更多”追加的列表项，删除按钮完全没反应。

```js
// ❌ 只绑定了“此刻已经存在”的按钮
document.querySelectorAll('.remove-btn').forEach((btn) => {
  btn.addEventListener('click', onRemove)
})
```

**原因**：`querySelectorAll` 拿到的是执行那一刻的元素。后来新插入的按钮从没被绑定过。

**修复**：把监听器绑在稳定存在的父元素上，用 `closest` 找到真正被点击的按钮：

```js
document.querySelector('#todo-list')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  if (!button) return // 点在了别处

  const item = button.closest('li')
  if (button.dataset.action === 'remove') item?.remove()
})
```

用 `closest` 而不是直接判断 `event.target`，是因为按钮里可能有图标：点到图标时，`event.target` 是图标而不是按钮。

**怎么避免再犯**：列表、表格这类会动态增减的区域，统一用事件委托。监听器数量也从“每行一个”变成“整个列表一个”。

## 6. 坑四：点一次，触发了好几次

**现象**：每打开一次弹窗，“确定”按钮被点击后发的请求就多一个：第三次打开时，点一下发了三个请求。

```js
function openDialog(order) {
  dialog.hidden = false
  confirmBtn.addEventListener('click', () => submit(order)) // ❌ 每次打开都新增一个监听器
}
```

**原因**：`addEventListener` 只会对**同一个函数引用**去重。这里每次传入的都是新创建的箭头函数，所以每打开一次就往按钮上追加一个监听器，越绑越多。更糟的是，旧监听器里还记着旧的 `order`，可能提交错数据。

**修复**：监听器只在初始化时绑定一次，打开弹窗时只更新数据：

```js
let currentOrder = null
confirmBtn.addEventListener('click', () => submit(currentOrder)) // 只绑定一次

function openDialog(order) {
  currentOrder = order
  dialog.hidden = false
}
```

如果确实要在打开时绑定，就在关闭时移除，比如用 `AbortController` 的 `signal` 绑定、关闭时调用 `abort()`。

**怎么避免再犯**：把“绑定事件”写在只会执行一次的初始化代码里，不要写在“打开”“渲染”这类会反复执行的函数里。

## 7. 坑五：拼接 URL 参数，遇到特殊字符就出错

**现象**：搜索“A&B 公司”时，后端收到的关键词只有 “A”。

```js
location.href = `/search?q=${keyword}&page=1` // ❌ & 把参数截断了
```

**原因**：`&`、`=`、`#`、`?` 在 URL 里有特殊含义，直接拼进去会破坏参数结构。

**修复**：用 `URLSearchParams` 生成和解析参数，它会自动编码：

```js
const params = new URLSearchParams({ q: keyword, page: '1' })
location.href = `/search?${params}`

// 读取当前页面参数
const q = new URLSearchParams(location.search).get('q')
```

## 排查思路

- **元素是 `null`**：先在报错的那一行打断点，在 Elements 面板确认此刻 DOM 里有没有这个元素；没有就是执行时机问题，有就是选择器写错了。
- **点一次触发多次**：在 Elements 面板选中元素，查看右侧的 **Event Listeners** 标签，能看到绑了几个监听器、分别来自哪个文件哪一行。Chrome 控制台里也可以用 `getEventListeners(元素)` 查看。
- **元素被谁改了**：在 Elements 面板右键元素 → Break on → attribute modifications / subtree modifications，下次有代码改它时会自动断住，调用栈里就是“凶手”。

## 检查清单

- [ ] 脚本用 `defer` 或 `type="module"`，不在 DOM 就绪前查询元素
- [ ] JS 依赖 `data-*` 属性，不依赖样式类名
- [ ] 外部内容用 `textContent` 展示，富文本先净化
- [ ] 动态列表用事件委托
- [ ] 事件只在初始化时绑定一次，临时绑定有对应的移除
- [ ] URL 参数用 `URLSearchParams` 生成和解析

## 延伸阅读

- [闭包与作用域](/web/JavaScript/closure)：没移除的监听器为什么会造成内存泄漏
- [可访问性实战](/web/frontend/accessibility)：按钮和链接该怎么选
- [前端调试技巧](/web/frontend/debugging)：更多 DevTools 断点用法
