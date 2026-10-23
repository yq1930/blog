---
title: jQuery：选择、遍历与事件
description: 面向维护老项目，讲清 jQuery 对象的本质和事件机制，修复选择器没匹配却不报错、attr 与 prop 混用导致复选框状态错乱、事件重复绑定、箭头函数里的 this、和 Vue 抢同一块 DOM 等问题，并给出原生 API 对照。
---

# jQuery：选择、遍历与事件

jQuery 仍然大量存在于老项目、后台模板和各种插件里。维护这些代码时，最常见的问题不是“不会写”，而是这些看起来很诡异的现象：

- 代码执行了，页面却没有任何变化，也没有报错；
- 复选框被用户点过之后，代码读到的选中状态就不对了；
- 点一次按钮，提交了三次；
- 页面里同时用了 Vue 和 jQuery，jQuery 改过的内容突然消失了。

理解 jQuery 对象和事件的工作方式，这些问题都很好解释。

::: tip 读完这篇你会
- 理解 jQuery 对象是什么，为什么它“出错也不报错”
- 正确使用 `.prop()`、事件委托和事件命名空间
- 在老项目里安全地维护 jQuery 代码，并逐步替换成原生 API
:::

## 1. 原理：jQuery 对象是一组元素的“遥控器”

`$('.item')` 返回的不是 DOM 元素，而是一个**包装了一组元素的对象**（类似数组）。你对它调用的方法，会作用到组里的**每一个**元素上：

```js
$('.item').addClass('is-active') // 给所有 .item 都加上类名
```

可以把它想成一个能同时控制多台电视的遥控器。这带来一个很重要的特点：**如果一台电视都没连上（选择器没匹配到任何元素），你按什么按钮都不会报错，只是什么都不会发生。**

这既是 jQuery 方便的地方，也是很多“静默失败”bug 的来源。

## 2. 坑一：代码执行了，页面却没变化

**现象**：调用了 `$('#confirm-dialog').addClass('is-open')`，弹窗没有打开，控制台也没有任何报错。

**原因**：选择器写错了（比如 ID 拼错、元素还没渲染出来），jQuery 对象里一个元素都没有，`addClass` 对空集合什么都不做。

**修复**：关键操作前检查 `.length`：

```js
const $dialog = $('#confirm-dialog')
if (!$dialog.length) {
  console.warn('没有找到确认弹窗元素') // 让问题暴露出来
  return
}
$dialog.addClass('is-open')
```

脚本放在 `<head>` 里时，还要确保 DOM 已经准备好再执行：

```js
$(function () {
  // DOM 解析完成后再执行，等同于 DOMContentLoaded
})
```

## 3. 选择与遍历速查

| 写法 | 含义 |
| --- | --- |
| `$('#profile')` / `$('.card')` / `$('[data-action="save"]')` | 按 ID / 类名 / 属性选择 |
| `.find('.title')` | 在当前元素的后代中查找 |
| `.closest('li')` | 向上找到最近的匹配祖先 |
| `.parent()` / `.children()` | 直接父元素 / 直接子元素 |
| `.siblings()` / `.next()` / `.prev()` | 兄弟元素 |
| `.filter('.active')` | 从当前集合中筛选 |
| `.eq(0)` / `.get(0)` | 第一个元素的 jQuery 对象 / 原生 DOM 元素 |

遍历方法返回新的 jQuery 对象，可以链式调用：

```js
$('#current')
  .closest('.menu')
  .find('.menu__item')
  .removeClass('is-active')
```

## 4. 坑二：`.attr()` 读到的复选框状态不对

**现象**：页面加载时复选框是勾选的。用户把它取消勾选后，代码 `$('#agree').attr('checked')` 读到的仍然是 `"checked"`，于是没勾选协议的用户也通过了校验。

**原因**：HTML **属性**（attribute）和 DOM **属性**（property）是两回事：

- attribute 是写在 HTML 里的**初始值**，用户操作不会改变它；
- property 是元素**当前的状态**，用户勾选、取消时会实时变化。

`.attr()` 读写的是前者，`.prop()` 读写的是后者。

**修复**：表单的当前状态（`checked`、`selected`、`disabled`、`value`）一律用 `.prop()` 或 `.val()`：

```js
const agreed = $('#agree').prop('checked') // ✅ 当前是否勾选
$('#submit').prop('disabled', !agreed)
```

## 5. 坑三：点一次按钮，事件触发了好几次

**现象**：每次打开弹窗都执行一次初始化函数，打开三次后，点一下“确定”就提交了三次。

```js
function initDialog() {
  $('#confirm').on('click', submit) // ❌ 每次初始化都多绑一次
}
```

**原因**：`.on()` 每调用一次就追加一个监听器，不会自动去重。

**修复一**：使用事件命名空间，绑定前先解绑同一命名空间的旧监听：

```js
$('#confirm').off('click.dialog').on('click.dialog', submit)
```

**修复二**（更推荐）：用事件委托，只在页面初始化时绑定一次，之后不管内容怎么变都不需要重新绑定：

```js
$(document).on('click', '[data-action="confirm"]', function () {
  submit($(this).data('id'))
})
```

事件委托还解决了“动态添加的元素没有事件”的问题，原理见 [浏览器与 DOM 操作](/web/JavaScript/browser) 中的事件冒泡部分。

## 6. 坑四：箭头函数里的 `this` 不是元素

**现象**：

```js
$('#list').on('click', '.remove', () => {
  $(this).closest('li').remove() // ❌ 什么都没删
})
```

**原因**：箭头函数没有自己的 `this`，这里的 `this` 是外层代码的 `this`（模块顶层通常是 `undefined`），不是被点击的元素。

**修复**：用普通函数，或者从事件对象上取元素：

```js
$('#list').on('click', '.remove', (event) => {
  $(event.currentTarget).closest('li').remove() // currentTarget 是匹配到 .remove 的元素
})
```

## 7. 坑五：`.html()` 展示用户内容导致 XSS

`.html(str)` 会把字符串当作 HTML 解析，`.text(str)` 只当作文字。来自用户、接口、URL 的内容一律用 `.text()`：

```js
$('#nickname').text(user.nickname) // ✅ 安全
$('#nickname').html(user.nickname) // ❌ 昵称里的脚本会被执行
```

## 8. 坑六：和 Vue 同时操作同一块 DOM

**现象**：在 Vue 组件里用 jQuery 插件初始化了一个日期选择器，过一会儿它就消失了，或者事件失灵。

**原因**：Vue 根据数据重新渲染时，会按照自己记录的虚拟 DOM 更新真实 DOM。jQuery 在背后改过的内容，Vue 并不知道，下一次更新时可能被覆盖或删掉。

**修复**：给 jQuery 插件一块“独立领地”，让 Vue 不再管理它的内部，并且在组件销毁时清理插件：

```js
const el = ref(null)
let picker = null

onMounted(() => {
  picker = $(el.value).datepicker({ /* 配置 */ }) // 只在挂载后初始化一次
})

onBeforeUnmount(() => {
  picker?.datepicker('destroy') // 销毁插件，解绑事件，避免内存泄漏
})
```

模板里这个元素内部不要再放由 Vue 渲染的动态内容。

## 9. 坑七：页面里有多个 `$`

**现象**：引入某个第三方脚本后，`$` 突然不是 jQuery 了，或者 jQuery 插件报 `$(...).xxx is not a function`。

**原因**：其他库也占用了全局的 `$`；或者页面引入了两个版本的 jQuery，插件被挂到了其中一个上，代码却用的是另一个。

**修复**：在控制台执行 `$.fn.jquery` 和 `jQuery.fn.jquery` 查看各自的版本；只保留一份 jQuery；需要和其他库共存时，用立即执行函数把 `$` 限定为 jQuery：

```js
;(function ($) {
  // 这里的 $ 一定是 jQuery
  $('.card').addClass('is-ready')
})(jQuery)
```

## 10. 原生 API 对照

新代码不必再依赖 jQuery，现代浏览器的原生 API 已经足够好用：

| jQuery | 原生 |
| --- | --- |
| `$('.item')` | `document.querySelectorAll('.item')` |
| `$el.find('.x')` | `el.querySelector('.x')` |
| `$el.closest('li')` | `el.closest('li')` |
| `$el.addClass('a')` / `.toggleClass('a')` | `el.classList.add('a')` / `.toggle('a')` |
| `$el.text(s)` | `el.textContent = s` |
| `$el.prop('checked')` | `el.checked` |
| `$el.on('click', fn)` | `el.addEventListener('click', fn)` |
| `$.ajax(...)` | `fetch(...)` |

## 维护和迁移建议

- 已经使用 jQuery 的页面，局部修改时可以继续用它，保持风格一致；
- 同一块 DOM 只让一个“主人”管理：要么 jQuery，要么框架；
- 迁移从独立的小组件开始，先补上行为测试，再逐个替换，不要一次性重写整个页面；
- 改动前确认 jQuery 版本和插件版本，老版本的 jQuery 有已知的安全漏洞，能升级就升级。

## 排查思路

1. **没反应**：先在控制台执行同样的选择器，看 `.length` 是不是 0。
2. **事件重复触发**：选中元素，在 Elements 面板的 Event Listeners 里查看绑定数量。jQuery 绑定的事件也可以用 `$._data(元素, 'events')` 查看（这是内部 API，只用于调试）。
3. **状态读取不对**：确认用的是 `.prop()` 而不是 `.attr()`。
4. **插件方法不存在**：检查 jQuery 版本和插件的加载顺序，插件必须在 jQuery 之后加载。

## 检查清单

- [ ] 关键操作前检查选择结果的 `.length`
- [ ] 表单当前状态使用 `.prop()` / `.val()`
- [ ] 动态内容使用事件委托，重复初始化时使用命名空间解绑
- [ ] 需要元素时使用普通函数或 `event.currentTarget`
- [ ] 外部内容使用 `.text()`
- [ ] jQuery 插件在框架组件中有独立容器，并在卸载时销毁
- [ ] 页面中只有一份 jQuery

## 延伸阅读

- [浏览器与 DOM 操作](/web/JavaScript/browser)：原生 DOM 与事件委托
- [原型与继承](/web/JavaScript/prototype)：`this` 是怎么确定的
- [技术债务治理](/engineering/tech-debt)：老代码的渐进式替换
