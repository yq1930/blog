---
title: 可访问性实战
description: 读屏软件只能读出元素“是什么、叫什么、现在怎样”。从无障碍树讲起，修复 div 冒充按钮、图标按钮没名字、占位符代替标签、弹窗焦点乱跑、提示不播报等问题。
---

# 可访问性实战

可访问性（简称 a11y）常被当成“锦上添花”，但它的问题其实非常具体：

- 用 `div` 做的按钮，按 Tab 键根本选不中，按回车也没反应；
- 读屏软件读到一个关闭按钮时，只会说“按钮”，用户不知道它是干什么的；
- 弹窗打开后，按 Tab 焦点跑到了弹窗背后的页面上；
- 表单提交失败的提示出现了，但视障用户完全不知道。

这些问题影响的不只是视障用户：习惯用键盘的开发者、手受伤暂时用不了鼠标的人、在强光下看手机的人，都会遇到。而且修好它们，往往只需要用对 HTML 标签。

::: tip 读完这篇你会
- 理解读屏软件是怎么“看”页面的
- 用语义化标签解决大部分可访问性问题
- 处理好键盘操作、焦点管理和动态提示
:::

## 1. 原理：读屏软件读的是“无障碍树”

浏览器在构建 DOM 的同时，还会构建一棵**无障碍树**，交给读屏软件等辅助技术使用。树上每个节点只关心三件事：

- **角色**（role）：它是什么？按钮、链接、输入框、标题……
- **名称**（name）：它叫什么？“提交”“关闭”“搜索”……
- **状态**（state）：它现在怎样？已选中、已展开、不可用……

可以把读屏软件想成一个**在电话里给你念网页的人**。他看不到颜色和布局，只能念出“按钮，提交”“复选框，记住我，未选中”。如果你的“按钮”是一个 `div`，他只能念出“提交”两个字，用户根本不知道这是可以点的东西。

```html
<!-- 无障碍树：文本“提交”（不知道能点） -->
<div class="btn" onclick="submit()">提交</div>

<!-- 无障碍树：按钮，名称“提交”（能聚焦、能用回车和空格触发） -->
<button type="button" onclick="submit()">提交</button>
```

在 Chrome DevTools 的 Elements 面板里，选中元素后打开右侧的 **Accessibility** 标签，就能看到它在无障碍树里的角色、名称和状态。

## 2. 用对标签，就解决了一半问题

| 场景 | 用这个 | 不要用 |
| --- | --- | --- |
| 触发一个操作 | `<button>` | `<div onclick>` |
| 跳转到另一个地址 | `<a href>` | `<span onclick="location.href=…">` |
| 页面区域 | `<header>` `<nav>` `<main>` `<footer>` | 全部 `<div>` |
| 标题 | `<h1>`～`<h6>`，按层级使用 | `<div class="title">` |
| 表单字段的说明 | `<label for>` | 只写 `placeholder` |

按钮和链接的区别不只是长相：**按钮做事，链接去某个地方**。用对了，浏览器自动提供键盘支持、读屏支持、右键“在新标签页打开”等行为。

## 3. 坑一：用 `div` 冒充按钮

**现象**：键盘用户反馈“无法提交表单”：Tab 键跳过了提交按钮，回车也没用。

**原因**：`div` 默认不可聚焦，也不会响应回车和空格，读屏软件也不认为它是按钮。

**修复**：换成 `<button>`，样式可以完全自定义：

```html
<button type="button" class="btn btn--primary">提交</button>
```

如果实在不能换（比如第三方组件生成的结构），需要手动补齐所有能力，你会发现代价不小：

```html
<div role="button" tabindex="0" class="btn">提交</div>
```

```js
btn.addEventListener('keydown', (event) => {
  // 原生按钮：回车和空格都能触发，这里得自己实现
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    btn.click()
  }
})
```

**怎么避免再犯**：代码评审时搜索 `div` 或 `span` 上的 `@click` / `onClick`，问一句：它为什么不是 `<button>`？

## 4. 坑二：图标按钮没有名字

**现象**：页面上的 `×` 关闭按钮、垃圾桶删除按钮，读屏软件只念“按钮”，或者念出“乘号”。

**原因**：按钮里只有图标，没有文字，它的“名称”是空的或没有意义。

**修复**：用 `aria-label` 给它起一个名字，图标本身对读屏软件隐藏：

```html
<button type="button" aria-label="关闭对话框">
  <svg aria-hidden="true" viewBox="0 0 24 24"><!-- 图标 --></svg>
</button>
```

## 5. 坑三：用 `placeholder` 代替标签

**现象**：输入框里写着灰色的“请输入手机号”，用户开始输入后，提示消失了，填到一半忘了这一栏是什么；部分读屏软件也不会把 placeholder 当作字段名称。

**修复**：每个输入框都要有一个关联的 `<label>`，`placeholder` 只用来给示例：

```html
<label for="phone">手机号</label>
<input id="phone" type="tel" autocomplete="tel" placeholder="例如 138 0000 0000" />
```

`for` 和 `id` 关联后，点击文字“手机号”也能聚焦到输入框，点击区域变大，手机上也更好点。

## 6. 键盘可用是一切的基础

很多人不用鼠标操作网页。一个基本要求是：**所有能用鼠标完成的事，都能只用键盘完成**。

| 按键 | 预期行为 |
| --- | --- |
| Tab / Shift+Tab | 在可操作的元素之间前进、后退，顺序和视觉顺序一致 |
| Enter | 激活链接和按钮、提交表单 |
| Space | 激活按钮、勾选复选框 |
| Esc | 关闭弹窗、下拉菜单 |
| 方向键 | 在菜单、选项卡、单选组内部移动 |

焦点必须**看得见**。不要全局 `outline: none`，用 `:focus-visible` 设计一个清晰的焦点样式（详见 [现代 CSS 选择器](/web/css/selectors)）。

### 坑四：弹窗打开后，焦点跑到了背后的页面

**现象**：打开一个确认弹窗后按 Tab，焦点跳到了弹窗后面被遮住的链接上；按 Esc 也关不掉；关闭弹窗后焦点回到了页面最顶部，用户得重新找刚才的位置。

**原因**：弹窗只是视觉上盖住了页面，焦点并没有被管理起来。

**修复**：弹窗需要做到四件事——打开时把焦点移进去、焦点只在弹窗内循环、Esc 关闭、关闭后焦点回到打开它的按钮。原生 `<dialog>` 元素配合 `showModal()` 已经帮你做了大部分：

```html
<button type="button" id="open-btn">删除文章</button>

<dialog id="confirm-dialog" aria-labelledby="confirm-title">
  <h2 id="confirm-title">确定删除这篇文章吗？</h2>
  <form method="dialog">
    <button value="cancel">取消</button>
    <button value="confirm">删除</button>
  </form>
</dialog>
```

```js
const dialog = document.querySelector('#confirm-dialog')
document.querySelector('#open-btn').addEventListener('click', () => {
  dialog.showModal() // 背景页面变为不可交互，Esc 自动关闭
})
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'confirm') deleteArticle()
})
```

使用 `showModal()` 时，背后的页面不可交互，Esc 可以关闭，主流浏览器还会在关闭后把焦点还给打开它的元素。用组件库的弹窗时，也按这四件事逐条检查一遍。

## 7. 坑五：动态出现的提示，读屏用户不知道

**现象**：点击“保存”后，页面右上角弹出“保存成功”的提示，几秒后消失。视障用户完全不知道有没有保存成功。

**原因**：读屏软件读的是焦点所在的位置，页面其他地方新出现的内容默认不会被播报。

**修复**：把提示区域标记为“实时区域”，内容变化时读屏软件会主动播报：

```html
<!-- 页面加载时就存在，内容变化时播报 -->
<div class="toast-region" aria-live="polite"></div>
```

```js
document.querySelector('.toast-region').textContent = '文章已保存'
```

`polite` 表示等用户当前的朗读结束再播报，适合大多数提示；严重错误可以用 `role="alert"` 立即播报。注意这个区域要**一开始就在页面上**，只改它的内容；如果连区域本身都是动态插入的，很多读屏软件不会播报。

## 8. 颜色和文字

- 正文和背景的对比度至少 4.5:1，大号文字至少 3:1；
- 不要只靠颜色表达信息：“红色字段表示有错误”对色弱用户没有意义，要配上错误文字；
- 正文字号不小于 16px，行高 1.5 左右。

## 9. ARIA：该用才用

ARIA 属性用来补充原生 HTML 表达不了的语义。核心原则是：**能用原生标签就不用 ARIA，用错的 ARIA 比不用更糟**——它会给读屏软件传递错误信息。

| 属性 | 用途 |
| --- | --- |
| `aria-label` | 给没有可见文字的元素命名 |
| `aria-labelledby` / `aria-describedby` | 用页面上已有的文字做名称 / 补充说明 |
| `aria-expanded` | 下拉、折叠面板是否展开 |
| `aria-invalid` | 表单字段是否有错误 |
| `aria-live` | 内容变化时是否播报 |
| `aria-hidden="true"` | 对读屏软件隐藏（只用于装饰性内容，不要用在可聚焦的元素上） |

## 排查思路

1. **拔掉鼠标测一遍**：只用 Tab、Shift+Tab、回车、空格、Esc，走完注册、下单等主要流程。卡住的地方就是问题。
2. **看无障碍树**：DevTools → Elements → Accessibility，检查关键元素的角色和名称是否正确。
3. **跑自动检查**：Lighthouse 的 Accessibility 分类、axe DevTools 浏览器扩展，能自动找出缺失标签、对比度不足、图片缺少 `alt` 等问题。自动检查只能发现一部分问题，键盘测试不能省。
4. **亲自听一次**：Mac 上按 Cmd+F5 打开 VoiceOver，Windows 上可以用免费的 NVDA，闭上眼睛用几分钟，你会立刻发现很多问题。

## 检查清单

- [ ] 能点的元素是 `<button>` 或 `<a href>`，没有 `div` 冒充
- [ ] 图标按钮有 `aria-label`，装饰性图标有 `aria-hidden`
- [ ] 每个输入框都有关联的 `<label>`
- [ ] 所有功能只用键盘就能完成，焦点清晰可见
- [ ] 弹窗打开移入焦点、内部循环、Esc 关闭、关闭后焦点归还
- [ ] 动态提示放在 `aria-live` 区域里
- [ ] 对比度达标，信息不只靠颜色表达

## 延伸阅读

- [表单设计与校验](/web/frontend/form-design)：错误信息怎样让所有人都看得到
- [现代 CSS 选择器](/web/css/selectors)：`:focus-visible` 焦点样式
- [颜色与暗色模式](/web/css/color-and-dark-mode)：两种主题下的对比度
