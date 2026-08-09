---
title: jQuery：选择、遍历与事件
description: 面向维护场景梳理 jQuery 的核心操作，并知道何时应使用原生 DOM API。
---

# jQuery：选择、遍历与事件

jQuery 仍会出现在许多存量项目和后台插件中。维护这类代码时，关键是读懂它对 DOM 的封装，并避免把新的复杂业务继续建立在旧式全局脚本上。

## 选择元素

`$()` 接收 CSS 选择器并返回 jQuery 对象。它即使没有匹配项也会返回对象，只是 `length` 为 `0`。

```js
const $dialog = $('#confirm-dialog')
const $inputs = $('form[data-form="profile"] :input')

if ($dialog.length) {
  $dialog.addClass('is-open')
}
```

常用选择器：

| 目标 | 写法 |
| --- | --- |
| ID | `$('#profile')` |
| class | `$('.article-card')` |
| 属性 | `$('[data-action="save"]')` |
| 后代 | `$('.menu a')` |
| 直接子元素 | `$('.menu > li')` |

## 遍历当前集合

遍历方法返回新的 jQuery 对象，可以继续链式调用。不要把它们和原生数组方法混淆。

```js
const $currentItem = $('#current')

$currentItem
  .parent()
  .find('.menu__item')
  .removeClass('is-active')

$currentItem.addClass('is-active')
```

| 方法 | 含义 |
| --- | --- |
| `.find(selector)` | 查找后代元素 |
| `.closest(selector)` | 向上找到最近的匹配祖先 |
| `.parent()` / `.children()` | 查找直接父级 / 子级 |
| `.next()` / `.prev()` | 查找相邻兄弟元素 |
| `.filter(selector)` | 过滤当前集合 |

## 用事件委托支持动态内容

直接给列表项绑定事件时，后插入的项不会自动拥有监听器。把事件绑定到稳定的父元素，并在回调中检查触发源。

```js
$('#todo-list').on('click', '[data-action="remove"]', function () {
  $(this).closest('li').remove()
})
```

`this` 在普通函数中指向触发事件的元素；如果使用箭头函数，应改用事件对象的 `event.currentTarget`，不要误以为箭头函数会自动提供元素上下文。

## 更新内容时保持安全边界

`.text()` 对应安全的文本更新；`.html()` 会解析 HTML。接口返回、用户输入和 URL 参数不要直接交给 `.html()`。

```js
function showMessage(message) {
  $('#status').text(message)
}

function setSubmitting(submitting) {
  $('#save-button')
    .prop('disabled', submitting)
    .text(submitting ? '保存中…' : '保存')
}
```

## 维护时的选择

- 新项目优先使用框架的组件模型或原生 `querySelector` / `addEventListener`。
- 已依赖 jQuery 的页面可以在局部延续它，避免同一小块 DOM 同时被框架和 jQuery 修改。
- 改动前先确认插件版本、事件解绑方式和全局 `$` 是否被其他库占用。
- 迁移时从独立小组件开始，用行为测试保护后再替换，不要一次重写整页。
