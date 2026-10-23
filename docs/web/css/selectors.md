---
title: 现代 CSS 选择器
description: 用好 :is、:where、:has、:focus-visible 和属性选择器，同时避开 :is 抬高优先级、nth-child 数错、手机上 hover 粘住、去掉焦点框等常见坑。
---

# 现代 CSS 选择器

选择器决定“样式作用在谁身上”。这几年 CSS 新增了 `:is()`、`:where()`、`:has()` 等强大的选择器，很多过去必须靠 JS 才能实现的效果，现在一行 CSS 就能搞定。但选择器用不好，也会带来一串难查的问题：

- 用了 `:is()` 之后，某条样式怎么也覆盖不掉；
- `.item:nth-child(2)` 明明有第二个 `.item`，样式却没生效；
- 手机上点一下按钮，hover 效果一直“粘”在上面；
- 为了好看去掉了焦点框，键盘用户完全不知道自己在哪。

::: tip 读完这篇你会
- 用 `:is()`、`:where()`、`:has()` 写出更短、更好覆盖的选择器
- 理解浏览器从右往左匹配选择器的方式
- 避开优先级、计数、触屏 hover 和焦点样式的常见坑
:::

## 1. 原理：浏览器从右往左匹配

看到 `.nav .item a` 时，浏览器不是先找 `.nav` 再往里找，而是**先找所有 `a`**，再逐个往上检查：父级里有没有 `.item`？再往上有没有 `.nav`？

```text
.nav  .item  a
  ③     ②    ①   ← 匹配顺序：从最右边的“关键选择器”开始
```

所以最右边的部分（关键选择器）最影响匹配成本。`.nav *` 意味着先拿到页面上**所有**元素再逐个检查。不过在实际项目里，选择器性能问题远没有优先级问题常见。记住两条就够：嵌套不超过 3 层，关键选择器尽量是一个类名。

## 2. 几个好用的现代选择器

| 选择器 | 作用 | 典型用途 |
| --- | --- | --- |
| `:is(A, B)` | 匹配任意一个，优先级取参数中**最高**的 | 简化冗长的分组 |
| `:where(A, B)` | 同 `:is`，但优先级**永远为 0** | 写容易被覆盖的默认样式 |
| `:has(...)` | 选择“包含某种子元素”的元素 | 父元素根据内容改变样式 |
| `:not(A)` | 排除 | 除了最后一项都加分割线 |
| `[attr^="x"]` | 属性以 x 开头 | 外部链接、文件类型图标 |
| `:focus-visible` | 只在键盘聚焦时匹配 | 焦点样式 |

```css
/* :is 收敛重复的选择器 */
.article :is(h2, h3, h4) { scroll-margin-top: 4rem; }

/* :where 写默认样式，任何类名都能轻松覆盖 */
:where(.prose) a { color: var(--color-primary); }

/* :has 让父元素根据子元素变化：勾选了的选项卡片高亮 */
.option:has(input:checked) { border-color: var(--color-primary); }

/* 表单里有无效输入时，提交按钮变灰 */
form:has(:invalid) .submit { opacity: 0.6; }

/* 除最后一项外都加分割线 */
.list > li:not(:last-child) { border-bottom: 1px solid var(--color-border); }
```

`:has()` 是近年最有用的 CSS 能力之一：过去“父元素根据子元素状态变化”只能靠 JS 切换类名，现在纯 CSS 就能做。主流浏览器在 2023 年底都已支持。

## 3. 坑一：用了 `:is()`，样式覆盖不掉

**现象**：主题里写了一条导航链接的样式，页面里想覆盖它，写了 `.nav-link--active { color: red }`，怎么都不生效。

```css
:is(#site-nav, .side-nav) a { color: var(--color-text); }
```

**原因**：`:is()` 的优先级取参数里**最高**的那个。这里有一个 `#site-nav`，整条规则的优先级就变成了 (1, 0, 1)，任何只靠类名的规则都赢不了它。

**修复**：提供默认样式时用 `:where()`，它的优先级永远是 0：

```css
:where(#site-nav, .side-nav) a { color: var(--color-text); } /* 优先级 (0, 0, 1) */
.nav-link--active { color: var(--color-primary); }           /* 轻松覆盖 */
```

**怎么避免再犯**：写给别人用的“默认样式”（组件库、主题、reset），一律用 `:where()` 包起来；不要在样式里用 ID 选择器。

## 4. 坑二：`:nth-child(2)` 数错了

**现象**：列表顶部有一个标题元素，`.item:nth-child(2)` 想选中第二个 `.item`，结果选中的是第一个。

```html
<ul>
  <li class="list-title">分组 A</li>
  <li class="item">第一项</li>  <!-- 被 .item:nth-child(2) 选中 -->
  <li class="item">第二项</li>
</ul>
```

**原因**：`:nth-child(2)` 数的是**所有兄弟元素**中的第 2 个，然后再检查它有没有 `.item` 类。它不是“`.item` 里的第 2 个”。`:nth-of-type` 也帮不上忙，它按**标签名**计数，这里大家都是 `li`。

**修复**：现代浏览器支持 `of S` 语法，表示“在匹配 S 的元素里计数”：

```css
li:nth-child(2 of .item) { font-weight: 600; } /* 真正的第二个 .item */
```

需要兼容旧浏览器时，更稳妥的办法是调整结构（把标题移出列表），或者直接给目标元素加类名。

## 5. 坑三：手机上 hover 效果“粘”住不走

**现象**：卡片的 hover 效果是上浮加阴影。在手机上点一下卡片，它就一直保持上浮状态，直到点击页面其他地方。

**原因**：触屏设备没有“鼠标悬停”，浏览器为了兼容，会在点击时触发 `:hover`，并且一直保持到下一次点击别处。

**修复**：只在真正支持悬停的设备上启用 hover 效果：

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
  }
}
```

点击反馈可以用 `:active`，它在手指按下时生效、抬起后消失。

## 6. 坑四：去掉了焦点框，键盘用户迷路了

**现象**：设计觉得点击按钮时出现的蓝色外框不好看，于是全局加了 `*:focus { outline: none }`。之后用键盘 Tab 键浏览页面的用户，完全看不出焦点停在哪里。

**原因**：焦点框是键盘用户的“鼠标指针”。直接去掉等于让他们闭着眼操作。

**修复**：用 `:focus-visible` 代替 `:focus`。浏览器会判断：鼠标点击时一般不显示，键盘操作时显示。

```css
/* 去掉旧的统一样式，只在需要时显示清晰的焦点框 */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

## 7. 身份用类名，状态用伪类

| 要表达的东西 | 推荐写法 |
| --- | --- |
| 这是什么组件 | 类名：`.button`、`.button--primary` |
| 交互状态 | 伪类：`:hover`、`:focus-visible`、`:active`、`:disabled` |
| 表单状态 | 伪类：`:checked`、`:invalid`、`:placeholder-shown` |
| 结构位置 | 伪类：`:first-child`、`:last-child`、`:nth-child()` |
| 包含关系 | `:has()` |

能用伪类表达的状态，就不要用 JS 切类名。例如禁用按钮，用原生的 `disabled` 属性加 `:disabled` 选择器，既省代码，屏幕阅读器也能正确识别。

另外，样式不要依赖 DOM 层级：

```css
.header > nav > ul > li > a { color: var(--color-text); } /* ❌ 多一层 div 就失效 */
.nav-link { color: var(--color-text); }                   /* ✅ */
```

## 排查思路

1. **想知道一个选择器到底选中了谁**：在控制台运行 `document.querySelectorAll('你的选择器')`，看返回的元素列表。
2. **想看优先级**：在 Styles 面板把鼠标悬停在选择器上，Chrome 会显示它的优先级数值。
3. **调试 hover、focus、active 样式**：在 Styles 面板点击 `:hov` 按钮，勾选对应状态，元素会被强制保持在这个状态，不用一直把鼠标放在上面。
4. **测试焦点样式**：拔掉鼠标，只用 Tab、Shift+Tab、回车、空格走一遍主要流程。

## 检查清单

- [ ] 给别人用的默认样式用 `:where()`，样式里没有 ID 选择器
- [ ] 选择器嵌套不超过 3 层，不依赖具体的 DOM 层级
- [ ] 使用 `:nth-child()` 时确认了计数对象
- [ ] hover 效果放在 `@media (hover: hover)` 里
- [ ] 没有全局 `outline: none`，焦点样式用 `:focus-visible`
- [ ] 能用伪类表达的状态不用 JS 切类名

## 延伸阅读

- [BEM 命名规范](/web/css/BEM规范)：优先级怎么计算
- [CSS 架构与组织](/web/css/architecture)：用 `@layer` 管理覆盖关系
- [可访问性实战](/web/frontend/accessibility)：键盘操作与焦点管理
