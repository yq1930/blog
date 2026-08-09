---
title: 表单设计与校验
description: 把表单状态、校验时机和错误展示讲清楚，让用户少犯错、能纠正。
---

# 表单设计与校验

表单是用户和系统交换数据的地方，也是最容易让用户挫败的地方——填了半天被全部清空、点了提交才发现某个字段早错了、错误提示写着"无效"却不说哪里错。好的表单设计让用户少犯错、能及时纠正、知道下一步。本篇讲状态管理、校验时机、错误展示和可访问性，以及复杂表单如何分步。

## 先分清表单的几种状态

一个字段在不同时刻有不同状态，UI 要明确反映：

| 状态 | 视觉表现 | 何时出现 |
| --- | --- | --- |
| 默认 | 常规边框 | 未交互 |
| 聚焦 | 高亮边框 | 用户点击/Tab 进入 |
| 已填写 | 显示值 | 有内容 |
| 校验中 | loading 提示 | 异步校验（如查重） |
| 错误 | 红色边框 + 文字说明 | 校验失败 |
| 禁用 | 灰色、不可编辑 | 条件不满足 |

```html
<div class="field">
  <label for="email">邮箱</label>
  <input
    id="email"
    type="email"
    :class="{ 'field--error': errors.email }"
    :aria-invalid="!!errors.email"
    aria-describedby="email-error"
  />
  <span id="email-error" class="field__error" v-if="errors.email">
    {{ errors.email }}
  </span>
</div>
```

> 字段的错误状态要同时用颜色和文字表达，不能只靠红色边框——色盲用户看不出。用 `aria-invalid` 和 `aria-describedby` 让屏幕阅读器也能读出错误。

## 校验时机：别太早也别太晚

校验时机直接影响用户体验。太早（一输入就报错）让人烦躁，太晚（提交才报错）让人白填。

| 时机 | 优点 | 缺点 | 适用 |
| --- | --- | --- | --- |
| 实时（输入时） | 即时反馈 | 容易在用户还没输完就报错 | 简单格式（密码强度） |
| 失焦 | 用户完成一个字段再校验 | 用户可能跳过 | 大多数字段（推荐） |
| 提交 | 不打断输入 | 一次性暴露所有错误 | 最终确认 |

经验做法：**失焦时校验格式，提交时校验完整性**。这样用户填完一个字段得到反馈，最后提交时再检查是否漏填。

```js
function handleBlur(field) {
  // 失焦时校验已填写的字段
  if (form[field]) validateField(field)
}

function handleSubmit() {
  // 提交时校验全部（包括空值）
  const errors = validateAll(form)
  if (Object.keys(errors).length) {
    showErrors(errors)
    focusFirstError()
    return
  }
  submitForm()
}
```

```js
// 实时校验只在用户已经"出错过一次"后再启用，
// 避免用户还没输完就报红
function handleInput(field) {
  if (errors[field]) validateField(field) // 之前错过，现在实时纠正
}
```

## 错误展示：说人话

错误信息要告诉用户**哪里错了、怎么改**，而不是机器化的诊断。

| 差的写法 | 好的写法 |
| --- | --- |
| `无效` | `邮箱格式不正确，应包含 @` |
| `必填` | `请填写手机号` |
| `错误` | `密码至少 8 位，需包含字母和数字` |
| `409 Conflict` | `该用户名已被注册，换一个试试` |

错误信息的呈现位置也要一致——要么始终在字段下方，要么始终在字段右侧，别混用。多个错误时，在表单顶部汇总错误数量，并把焦点移到第一个错误字段。

## 受控 vs 非受控

在 React/Vue 这类框架里，表单字段有两种管理方式：

| 方式 | 含义 | 优点 | 适用 |
| --- | --- | --- | --- |
| 受控 | 表单值存在组件 state，每次输入都更新 state | 实时校验、派生字段、格式化 | 需要实时反应的字段 |
| 非受控 | 表单值留在 DOM，提交时再读取 | 性能好、代码少 | 简单表单、一次性提交 |

```jsx
// 受控：每次输入都触发 state 更新
function ControlledInput() {
  const [value, setValue] = useState('')
  return <input value={value} onChange={e => setValue(e.target.value)} />
}

// 非受控：用 ref 读值，提交时才取
function UncontrolledForm() {
  const inputRef = useRef()
  return <form onSubmit={() => console.log(inputRef.current.value)}>
    <input ref={inputRef} defaultValue="" />
  </form>
}
```

> 受控组件在大表单上可能引起性能问题（每次按键都重渲染整个表单）。字段很多时考虑用非受控 + 提交时校验，或用专门的表单库（如 React Hook Form、VeeValidate）做按字段订阅，只重渲染变化的字段。

## 善用原生属性

HTML5 提供了基础的校验和输入类型，优先用原生能力，省掉不必要的 JS：

| 属性 | 作用 |
| --- | --- |
| `type="email"` / `type="tel"` / `type="url"` | 触发对应键盘和基础校验 |
| `required` | 必填校验 |
| `pattern` | 正则校验 |
| `minlength` / `maxlength` | 长度限制 |
| `autocomplete` | 浏览器自动填充（姓名、地址、密码） |
| `inputmode` | 指定移动端键盘类型 |

```html
<input
  type="email"
  required
  autocomplete="email"
  pattern="[^@]+@[^@]+\.[^@]+"
/>
```

原生校验的好处是浏览器一致、无障碍支持好。复杂的业务校验（如"用户名是否重复"）再叠加 JS。如果完全自定义 UI 不想用原生提示，加 `novalidate` 关闭浏览器默认校验，自己接管。

## 复杂表单：分步和分组

字段超过 10 个或涉及多阶段（注册、填写资料、确认）时，一次性铺开会吓退用户。分步表单让每一步聚焦少量字段：

```text
步骤 1：账户信息（邮箱、密码）
步骤 2：个人资料（姓名、手机）
步骤 3：确认并提交
```

分步的关键点：

- 每步只校验当前步的字段，通过才进入下一步。
- 允许返回上一步修改，不要让用户重填。
- 显示进度（"第 2 步 / 共 3 步"），让用户知道还差多远。
- 草稿保存——长表单中途退出能恢复，避免白填。

## 务实的检查清单

- 每个字段是否有 label，且 label 通过 `for` 关联 input？
- 校验时机是否合理（失焦校验格式 + 提交校验完整性）？
- 错误信息是否说清"哪里错、怎么改"，且不只靠颜色？
- 错误状态是否用了 `aria-invalid` 和 `aria-describedby`？
- 是否优先用了原生属性（`type`、`required`、`autocomplete`）？
- 复杂表单是否分步，并显示进度、允许返回？
- 提交后是否给了明确反馈（成功提示或失败原因 + 重试）？

表单的本质是和用户对话。校验是帮助用户说对话，错误提示是温和地纠正，提交反馈是对话的回应。把每一个字段都当成一次小交互来认真对待，表单就不会成为用户流失的断点。
