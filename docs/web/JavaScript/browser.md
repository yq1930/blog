---
title: 浏览器与 DOM 操作
description: 理解 window、document、地址栏和事件，让页面交互从“能跑”变成可维护。
---

# 浏览器与 DOM 操作

浏览器不仅执行 JavaScript，还提供了一组与页面、地址、设备和网络交互的 Web API。先区分职责，再写 DOM 代码，能避开许多偶发问题。

## 先分清四个常用对象

| 对象 | 负责什么 | 常见用途 |
| --- | --- | --- |
| `window` | 浏览器窗口与全局环境 | 定时器、视口大小、历史记录 |
| `document` | 当前页面的 DOM 树 | 查询、创建、更新元素 |
| `location` | 当前 URL | 读取查询参数、跳转页面 |
| `navigator` | 浏览器能力和环境信息 | 功能检测、语言偏好 |

屏幕尺寸不等于视口尺寸。做布局判断时，通常使用 `window.innerWidth`；`screen.width` 描述的是设备屏幕，不会随着浏览器窗口缩放而改变。

```js
const params = new URLSearchParams(window.location.search)
const keyword = params.get('q')

if (keyword) {
  document.title = `搜索：${keyword}`
}
```

## 查询元素：选择最稳定的标识

`querySelector` 返回第一个匹配元素，`querySelectorAll` 返回静态的节点列表。业务脚本优先依赖语义化 class 或 `data-*` 属性，而不是样式层级或动态生成的 ID。

```html
<button type="button" data-action="save">保存</button>
```

```js
const saveButton = document.querySelector('[data-action="save"]')

saveButton?.addEventListener('click', saveDraft)
```

可选链 `?.` 让“页面上不存在该元素”的情况安全退出，但不应该用它掩盖页面结构配置错误。关键元素缺失时，应在开发环境中明确报错。

## 更新内容：默认使用 `textContent`

| API | 是否解析 HTML | 使用建议 |
| --- | --- | --- |
| `textContent` | 否 | 展示普通文本的默认选择 |
| `innerHTML` | 是 | 仅在内容可信且确实需要 HTML 时使用 |
| `classList` | 不涉及 | 切换视觉状态 |
| `setAttribute` | 不涉及 | 更新语义和可访问性属性 |

不要将来自用户、接口或 URL 的内容直接赋给 `innerHTML`，这会带来 XSS 风险。

```js
function setSaveState(button, saving) {
  button.disabled = saving
  button.textContent = saving ? '保存中…' : '保存'
  button.setAttribute('aria-busy', String(saving))
}
```

## 创建元素比拼接字符串更安全

当列表项需要交互时，用 DOM API 创建元素，数据和结构会保持分离。

```js
function createTodoItem(todo) {
  const item = document.createElement('li')
  item.dataset.id = todo.id

  const label = document.createElement('span')
  label.textContent = todo.title

  item.append(label)
  return item
}
```

## 用事件委托处理动态列表

把监听器绑定在稳定的父元素上，通过 `event.target.closest()` 找到真正的操作按钮。后续新插入的子项无需重新绑定事件。

```js
document.querySelector('#todo-list')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  if (!button) return

  const item = button.closest('li')
  if (button.dataset.action === 'remove') {
    item?.remove()
  }
})
```

## 常见错误：`innerHTML` 渲染外部内容导致 XSS

把接口返回或用户输入的内容直接拼进 `innerHTML`，是前端最经典的安全漏洞：

```js
// 接口/用户输入直接进 innerHTML
list.innerHTML = `<li>${item.name}</li>`
```

**症状**：当 `item.name` 里含有 `<img src=x onerror="steal(document.cookie)">` 这类内容时，脚本会被执行——用户 Cookie 被偷、页面被注入恶意弹窗、或后台数据被静默篡改。更隐蔽的是，内容含 `<` 或 `&` 时，列表结构本身会被破坏（标签被错误解析）。

**为什么错**：`innerHTML` 会把字符串当作 HTML 解析，外部内容里的标签和事件属性会被真实执行。浏览器无法区分"你想展示的尖括号"和"你想执行的标签"。

**正确做法**：纯文本一律用 `textContent`，它只当文字、不当标签：

```js
const item = document.createElement('li')
item.textContent = item.name  // 永远安全
```

确需渲染富文本时，用专门的白名单净化库过滤后再赋值。原则：**任何来自外部的内容，默认都不配被信任为 HTML**。

## 一份页面交互检查表

- 用按钮触发动作、用链接导航；不要把 `div` 伪装成可点击控件。
- 文本更新用 `textContent`，外部内容进入 HTML 前必须净化。
- 异步操作期间同步更新 `disabled`、文案和 `aria-busy`，避免重复提交。
- 尺寸和能力判断以功能检测为主，不要根据 User-Agent 猜浏览器类型。
