---
title: 组件设计与状态边界
description: 用“props 向下、事件向上”的单向数据流设计 Vue 组件，并修复直接改 props、v-for 用下标当 key 导致输入框错位、复用组件里偷偷发请求、只考虑有数据的情况等常见问题。
---

# 组件设计与状态边界

一个组件好不好维护，看它能不能用一句话说清楚：**接收什么、展示什么、把什么事件交给谁**。说不清的组件，往往同时在做页面编排、接口请求、表单校验和样式细节，改哪里都提心吊胆。

这篇讲 Vue 组件的边界怎么划，以及几个高频 bug：

- 子组件改了父组件传进来的对象，父组件的数据被“悄悄”改了；
- 列表删除第一项后，下面输入框里的内容全部错了位；
- 一个卡片组件被放进列表里，页面瞬间发出了二十个请求。

::: tip 读完这篇你会
- 用单向数据流设计组件的输入和输出
- 用 `defineModel` 正确实现组件的双向绑定
- 避开改 props、错误的 key、复用组件里发请求等坑
:::

## 1. 原理：数据向下流，事件向上报

Vue 组件之间的数据是**单向流动**的：

```text
父组件
  │ props（数据向下传）       ▲ emit（事件向上报）
  ▼                          │
子组件 ───────────────────────┘
```

可以想成公司里的分工：上级（父组件）把任务资料（props）交给下属（子组件）；下属遇到情况就汇报（emit 事件），由上级决定怎么改资料。下属不能直接在上级的原件上涂改。

这样做的好处是：**数据只有一个地方能改**。出了问题，只要去父组件里找修改它的代码，而不是在一堆子组件里翻。

```vue
<!-- MemberItem.vue -->
<script setup>
defineProps({
  member: { type: Object, required: true },
  disabled: Boolean
})
const emit = defineEmits(['select'])
</script>

<template>
  <button type="button" :disabled="disabled" @click="emit('select', member.id)">
    {{ member.name }}
  </button>
</template>
```

事件名描述**发生了什么**（`select`、`save`、`cancel`），而不是父组件打算怎么处理（`updateListAndCloseDialog`）。

## 2. 坑一：子组件直接改了 props

**现象一**：控制台警告 `Attempting to mutate prop "value". Props are readonly.`

**现象二**（更危险）：没有任何警告，但父组件的数据被改了。比如编辑弹窗里修改了用户名，还没点保存，列表里的名字已经变了；点了取消，名字也回不去了。

```js
const props = defineProps({ user: Object })
props.user.name = '新名字' // ❌ 不会报警告，但直接改掉了父组件的对象
```

**原因**：Vue 只阻止你给 props 本身重新赋值（`props.user = ...`），但对象是按引用传递的，改它的属性就是在改父组件的那个对象。

**修复**：需要编辑时，复制一份作为本地草稿，保存时再通过事件交给父组件：

```js
const props = defineProps({ user: Object })
const emit = defineEmits(['save'])

const draft = ref({ ...props.user }) // 本地副本，随便改

function onSave() {
  emit('save', { ...draft.value }) // 由父组件决定是否、如何更新
}
```

### 双向绑定用 `defineModel`

输入框、开关这类组件，确实需要“子组件改值、父组件同步”。Vue 3.4 起可以用 `defineModel`，它在内部帮你完成“接收 prop + 触发 update 事件”：

```vue
<!-- QuantityInput.vue -->
<script setup>
const count = defineModel({ type: Number, default: 1 })
</script>

<template>
  <button type="button" @click="count--">-</button>
  <span>{{ count }}</span>
  <button type="button" @click="count++">+</button>
</template>
```

```vue
<!-- 父组件 -->
<QuantityInput v-model="quantity" />
```

给 `count` 赋值时，实际上是向父组件发出 `update:modelValue` 事件，数据依然只由父组件修改。

## 3. 坑二：用下标当 key，删除一项后内容错位

**现象**：一个可编辑列表，每行有一个输入框。删除第一行后，原来第二行输入的内容出现在了第一行，最后一行变成了空的。

```vue
<li v-for="(item, index) in items" :key="index"> <!-- ❌ -->
  {{ item.title }}
  <input placeholder="备注" />
</li>
```

**原因**：`key` 是 Vue 用来识别“这是哪一个元素”的身份证。删除第一项后，原来的第二项下标从 1 变成了 0。Vue 一看 key 为 0 的元素还在，就**复用**了原来第一行的 DOM 和组件状态（包括输入框里没绑定到数据的内容），只更新了文字。结果文字对了，输入框里的内容却错了位。

```text
删除前：key=0 苹果 [备注A]   key=1 香蕉 [备注B]   key=2 橙子 [备注C]
删除苹果后，按下标复用：
        key=0 香蕉 [备注A]   key=1 橙子 [备注B]   （key=2 被删除）
```

**修复**：用数据自身稳定、唯一的 ID 作为 key：

```vue
<li v-for="item in items" :key="item.id">
```

**怎么避免再犯**：列表会增删、排序、过滤时，绝不用下标当 key。数据确实没有 ID 时，在拿到数据的那一刻给每一项生成一个（如 `crypto.randomUUID()`）。

## 4. 坑三：可复用组件里偷偷发请求

**现象**：做了一个“用户卡片”组件，组件内部根据 `userId` 请求用户详情。放进一个二十人的列表后，页面一打开就发出了二十个请求；在另一个页面想复用它展示“已经有的数据”，却没办法阻止它发请求。

**原因**：组件把“展示”和“获取数据”绑在了一起。

**修复**：把职责分开：

```text
pages/TeamPage.vue          页面：读取路由参数，组织整个流程
composables/useTeam.js      获取和管理数据：加载、刷新、错误状态
components/MemberCard.vue   只负责展示：接收 member，发出事件
api/team.js                 描述后端接口
```

展示组件只通过 props 接收数据，谁用它，谁负责准备数据。这样它在任何页面都能复用，测试时也只需要传入一个对象。

## 5. 坑四：组件只考虑了“有数据”的样子

**现象**：接口慢的时候页面一片空白；接口出错时，列表区域什么都没有，用户不知道发生了什么；数据为空时，表头孤零零地挂着。

**修复**：把加载、空数据、失败等状态纳入组件的设计，作为 props 或插槽明确提供：

```vue
<MemberList
  :items="members"
  :loading="loading"
  :error="error"
  @retry="loadMembers"
>
  <template #empty>还没有成员，点击右上角邀请</template>
</MemberList>
```

一个完整的列表组件，至少要能展示：加载中、正常、空数据、失败（可重试）四种状态。写组件时，把这四种状态都在页面上摆出来看一遍。

## 6. 坑五：props 一层层往下传

**现象**：一个主题配置要从页面传给孙子的孙子组件，中间四层组件都得声明这个 prop，但它们自己根本不用。改一次名字要改五个文件。

**修复**：

- 跨多层共享的“环境信息”（主题、当前用户、表单上下文），用 `provide` / `inject`；
- 多处读写的业务状态，用组合式函数或 Pinia；
- 也可以重新审视组件结构：用插槽让父组件直接渲染深层内容，中间组件就不需要转手。

`provide` / `inject` 会让依赖关系变得不那么显眼，适合“环境类”的数据，不要用它替代所有 props。

## 7. 状态放在哪里

| 状态 | 放在哪里 |
| --- | --- |
| 输入框是否聚焦、下拉是否展开 | 组件自己内部 |
| 弹窗是否打开 | 控制弹窗的父组件 |
| 几个兄弟组件要协作的数据 | 它们最近的共同父组件 |
| 页面的列表数据 | 页面或页面使用的组合式函数 |
| 当前登录用户、全局设置 | 全局 store |

原则是：**放在离使用者最近的、能覆盖所有使用者的那一层**。放得太高，任何改动都会影响一大片；放得太低，兄弟组件就拿不到。

## 排查思路

1. **装上 Vue Devtools**：在组件树里选中组件，可以看到它收到的 props、本地状态、触发的事件，是排查组件问题的第一工具。
2. **数据被莫名修改**：在父组件里用 `watch(() => data, ..., { deep: true })` 打断点，看调用栈是哪个组件改的。开发环境里也可以把传给子组件的对象用 `readonly()` 包一层，谁改谁报警告。
3. **列表显示错位**：先检查 `v-for` 的 `key`。
4. **请求数量异常**：Network 面板按接口筛选，看请求次数是否和组件实例数量一致。
5. **留意控制台警告**：Vue 在开发模式下会对修改 props、缺少 key、未声明的事件等给出警告，不要忽略它们。

## 检查清单

- [ ] 组件能用一句话说清输入、输出和职责
- [ ] 没有直接修改 props（包括对象 props 的属性）
- [ ] 双向绑定使用 `v-model` / `defineModel`
- [ ] `v-for` 使用稳定唯一的 ID 作为 key
- [ ] 可复用的展示组件不自己发请求
- [ ] 组件覆盖了加载、空数据、失败等状态
- [ ] 跨多层的环境数据用 `provide` / `inject`，业务状态用组合式函数或 store

## 延伸阅读

- [组合式函数与逻辑复用](/web/vue/composables)：把数据获取逻辑抽出来
- [前端状态管理](/web/frontend/state-management)：状态的主人是谁
- [Vue 组件测试](/web/vue/testing)：职责清晰的组件更容易测试
