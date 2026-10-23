---
title: 表单设计与校验
description: 把表单当成一个小状态机来设计：何时校验、错误怎么说、提交怎么防重。顺带修复中文输入法拼音阶段就触发校验、iOS 聚焦自动放大、number 输入框吞数字、重复提交和填写内容丢失等问题。
---

# 表单设计与校验

表单是用户最容易放弃的地方。让人想关掉页面的往往是这些细节：

- 还没输完就满屏飘红；
- 用中文输入法打拼音时，搜索框就开始拿拼音字母去搜索；
- 在 iPhone 上一点输入框，整个页面就被放大了；
- 网络慢时连点两下提交，生成了两条一模一样的记录；
- 提交失败后，辛苦填的内容全被清空。

这篇先建立“表单是一个小状态机”的思路，再逐个解决这些问题。

::: tip 读完这篇你会
- 设计合理的校验时机和错误提示
- 处理中文输入法、移动端键盘、数字输入等容易踩坑的细节
- 让表单提交不重复、不丢数据
:::

## 1. 原理：表单是一个小状态机

每个字段都有几组独立的状态：

```text
是否被碰过：  未触碰（pristine） ──用户离开过一次──► 已触碰（touched）
值是否合法：  未知 ──► 校验中（异步，如查重名）──► 合法 / 不合法
```

整个表单也有自己的状态：

```text
填写中 ──点击提交──► 提交中 ──成功──► 已提交
                       │
                       └──失败──► 填写中（保留数据，显示原因）
```

把这些状态想清楚，很多问题就有了答案：**什么时候显示错误**取决于“是否被碰过”；**按钮能不能点**取决于“是否在提交中”；**失败后怎么办**是回到“填写中”并保留数据，而不是清空。

## 2. 校验时机：别太早，也别太晚

| 时机 | 问题 |
| --- | --- |
| 每输入一个字就校验 | 用户刚输入 `ab`，邮箱就报“格式错误”，体验很差 |
| 只在提交时校验 | 填完二十个字段才知道第三个就错了 |

推荐的组合是：**离开字段时第一次校验；出过错之后，改为输入时实时校验**（让用户及时看到错误被修好）；**提交时对全部字段再校验一次**，包括没碰过的必填项。

```js
const touched = {}
const errors = {}

function onBlur(field) {
  touched[field] = true
  errors[field] = validate(field, form[field])
}

function onInput(field) {
  // 只有已经提示过错误的字段，才在输入时实时更新
  if (errors[field]) errors[field] = validate(field, form[field])
}

function onSubmit() {
  for (const field of Object.keys(form)) {
    touched[field] = true
    errors[field] = validate(field, form[field])
  }
  const firstError = Object.keys(errors).find((f) => errors[f])
  if (firstError) {
    document.getElementById(firstError)?.focus() // 把用户带到第一个错误处
    return
  }
  submit()
}
```

## 3. 错误提示：说清哪里错、怎么改

| 不好的写法 | 好的写法 |
| --- | --- |
| 无效 | 邮箱格式不正确，应包含 @ |
| 必填 | 请填写手机号 |
| 错误 | 密码至少 8 位，需包含字母和数字 |
| 409 Conflict | 这个用户名已被注册，换一个试试 |

提示的位置固定在字段下方；同时用颜色和文字表达错误，并让读屏软件也能读到：

```html
<label for="email">邮箱</label>
<input id="email" type="email" aria-invalid="true" aria-describedby="email-error" />
<p id="email-error" class="field__error">邮箱格式不正确，应包含 @</p>
```

## 4. 先用好原生属性

| 属性 | 作用 |
| --- | --- |
| `type="email"` / `"tel"` / `"url"` | 手机上弹出对应的键盘，并有基础校验 |
| `inputmode="numeric"` / `"decimal"` | 只控制弹出的键盘类型，不限制输入内容 |
| `autocomplete="name"` / `"tel"` / `"one-time-code"` | 浏览器自动填充，`one-time-code` 能自动填入短信验证码 |
| `enterkeyhint="search"` / `"next"` / `"send"` | 改变手机键盘回车键上的文字 |
| `required`、`minlength`、`maxlength`、`pattern` | 基础校验 |

如果要完全自定义错误提示的样式，可以给 `<form>` 加 `novalidate` 关闭浏览器默认气泡，自己接管校验。

## 5. 坑一：中文输入法还在打拼音，就开始搜索了

**现象**：在搜索框里输入“上海”，打拼音 `shang` 的过程中，列表已经开始拿 `s`、`sh`、`sha` 去搜索；输入法里按回车选词时，表单被直接提交了。

**原因**：使用输入法时，拼音阶段的每次按键也会触发 `input` 和 `keydown` 事件。这段“正在组字”的过程叫**组合输入**（composition），浏览器会在开始和结束时分别触发 `compositionstart` 和 `compositionend`。

**修复**：在组合输入期间跳过处理：

```js
input.addEventListener('input', (event) => {
  if (event.isComposing) return // 还在打拼音，先不处理
  search(event.target.value)
})

input.addEventListener('compositionend', (event) => {
  search(event.target.value) // 选词结束，用最终的汉字搜索
})

input.addEventListener('keydown', (event) => {
  // 输入法选词时按的回车，不应该提交表单
  if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
    submitSearch()
  }
})
```

`keyCode === 229` 是为了兼容部分浏览器在组合输入时不报告 `isComposing` 的情况。不同浏览器在组字结束时触发 `compositionend` 和 `input` 的先后顺序不完全一致，可能导致 `search` 被连续调用两次，所以 `search` 本身最好加上防抖或“和上次关键词相同就跳过”的判断。Vue 的 `v-model` 在文本框上默认会等组合输入结束才更新值，但你自己写的 `@input`、`@keydown.enter` 处理函数不会，需要像上面这样判断。

**怎么避免再犯**：所有搜索框、聊天输入框、回车提交的表单，都用中文输入法实际测一遍。

## 6. 坑二：iPhone 上一点输入框，页面就被放大

**现象**：在 iOS Safari 里点击输入框，页面自动放大，输入完成后也不会缩回去，布局全乱了。

**原因**：iOS Safari 会在输入框字号**小于 16px** 时自动放大页面，方便用户看清输入的文字。

**修复**：输入框的字号设为至少 16px：

```css
input,
select,
textarea {
  font-size: 16px; /* 或 max(16px, 1rem) */
}
```

不要用 `user-scalable=no` 禁止缩放来“解决”它，那样会影响需要放大页面的用户。

## 7. 坑三：`type="number"` 吞掉了用户的输入

**现象**：

- 手机号、身份证号、卡号输入框用了 `type="number"`，开头的 0 不见了，很长的数字末尾变成了 0；
- 输入框里可以输入字母 `e`；
- 鼠标在输入框上滚动，数值被意外地加减了。

**原因**：`type="number"` 是给“可以加减的数量”设计的，比如购买件数。它会把内容当作数字处理：`e` 是科学计数法（`1e3` 是合法数字），开头的 0 没有意义，超过 JavaScript 安全整数范围的数字会丢失精度。

**修复**：手机号、验证码、证件号这类“由数字组成的文本”，用文本框加 `inputmode`：

```html
<input type="text" inputmode="numeric" autocomplete="tel" maxlength="11" />
```

只有真正的“数量”才用 `type="number"`。

## 8. 坑四：连点两下，提交了两次

**现象**：网络慢时，用户以为没点上，又点了一次，后台出现两条重复的订单。

**修复**：提交期间禁用按钮，并且同一时间只允许一个提交请求：

```js
let submitting = false

async function onSubmit() {
  if (submitting) return
  submitting = true
  submitButton.disabled = true
  submitButton.textContent = '提交中…'
  try {
    await api.createOrder(form)
    showSuccess()
  } catch (error) {
    showError('提交失败，请重试') // 数据保留在表单里，用户可以直接重试
  } finally {
    submitting = false
    submitButton.disabled = false
    submitButton.textContent = '提交'
  }
}
```

前端拦截只能防住“手快”，挡不住刷新重试、网络超时重发。真正可靠的去重要靠后端，比如前端生成一个请求 ID 一起提交，后端据此判断是否已经处理过，详见 [事务、幂等与补偿](/practice/transactional-business-workflow)。

## 9. 坑五：提交失败或误刷新，填的内容全没了

**现象**：用户填了一个很长的申请表，点提交时网络断了，页面一刷新，所有内容都没了。

**修复**：

- **提交失败不清空**：只在成功后才重置表单；
- **长表单自动保存草稿**：输入时防抖保存到 `localStorage`，重新打开时询问是否恢复；成功提交后删除草稿；
- **离开前提醒**：有未保存的修改时，监听 `beforeunload` 提醒用户。

```js
const saveDraft = debounce(() => {
  localStorage.setItem('apply-form-draft', JSON.stringify(form))
}, 500)
```

密码、身份证号、银行卡号等敏感字段**不要**存进草稿。`localStorage` 里的数据是明文的，同一设备上的其他人或恶意脚本都可能读到。

## 10. 前端校验只是体验，不是安全

前端校验的作用是**让用户少犯错、早发现**。任何人都可以绕过前端，直接调用接口提交任意数据。所有规则（必填、格式、长度、权限、金额范围）都必须在后端再校验一次。前后端的错误提示最好统一：后端返回字段级的错误，前端显示在对应字段下方。

## 11. 长表单：分步和分组

字段超过十个时，考虑拆成几步：

- 每一步只校验当前步的字段；
- 显示进度（“第 2 步，共 3 步”）；
- 可以返回上一步修改，已填内容不丢失；
- 最后一步给出汇总确认页。

## 排查思路

1. **重复提交**：打开 Network 面板，把网速调成 Slow 4G，快速连点提交按钮，数一数发出了几个请求。
2. **输入法问题**：用中文、日文输入法分别测试搜索框和回车提交。
3. **移动端问题**：在真机上测试（模拟器很难复现 iOS 自动放大和键盘遮挡），注意检查自动填充、验证码自动填入是否正常。
4. **校验不一致**：用接口调试工具直接调用接口，提交前端会拦截的数据，确认后端也会拒绝。

## 检查清单

- [ ] 离开字段时首次校验，出错后实时校验，提交时全量校验
- [ ] 错误提示说明“哪里错、怎么改”，并用 `aria-invalid`、`aria-describedby` 关联
- [ ] 搜索、回车提交等逻辑处理了输入法组合输入
- [ ] 输入框字号不小于 16px
- [ ] 手机号、证件号等不用 `type="number"`
- [ ] 提交期间防重复，后端也有幂等保护
- [ ] 失败不清空数据，长表单有草稿，敏感字段不存草稿
- [ ] 所有规则在后端都有校验

## 延伸阅读

- [可访问性实战](/web/frontend/accessibility)：标签、焦点和错误播报
- [移动端适配](/web/frontend/mobile)：键盘弹起遮挡输入框
- [正则表达式实战](/web/JavaScript/regex)：格式校验的正则怎么写
