---
title: 组件设计与状态边界
description: 通过清晰的输入、事件和职责边界，让 Vue 组件可组合、可测试，也不把业务流程藏进 UI 细节。
---

# 组件设计与状态边界

一个组件是否容易维护，取决于它能否被一句话说清：接收什么、展示什么、把什么事件交给谁。组件不应同时承担页面编排、接口请求、表单校验和视觉细节。

## 先按职责拆分，而不是按文件大小拆分

可复用组件负责稳定的交互与展示；页面组件负责组合业务流程；请求和状态规则放在独立模块或组合函数中。

```text
pages/MemberPage.vue        页面编排与路由参数
components/MemberCard.vue   展示成员信息、发出点击事件
composables/useMember.ts    加载、刷新与错误状态
api/member.ts               描述后端资源接口
```

这种拆法的价值在于变化被关在对应层：接口变更不必修改卡片，视觉改动也不会影响请求策略。

## `props` 向下，事件向上

子组件通过 props 接收数据，通过事件报告用户动作；不要直接修改 props，也不要让子组件悄悄依赖页面级全局状态。

```vue
<script setup>
defineProps({
  member: { type: Object, required: true },
  disabled: Boolean
})

const emit = defineEmits(['select'])
</script>

<template>
  <button :disabled="disabled" @click="emit('select', member.id)">
    {{ member.name }}
  </button>
</template>
```

事件名应描述发生的动作，如 `select`、`save`、`cancel`，而不是描述父组件准备怎么实现。

## 状态放在离使用者最近的共同祖先

只被一个组件使用的交互状态，留在组件内；多个兄弟组件需要协作的状态，上移到它们最近的共同父级；跨页面且有明确生命周期的状态，才考虑全局 store。

| 状态 | 推荐位置 |
| --- | --- |
| 输入框是否聚焦 | 当前组件 |
| 弹窗是否打开 | 控制弹窗的页面或父组件 |
| 当前登录用户 | 会话模块 / 全局状态 |
| 接口加载结果 | 对应页面或组合函数 |

## 为组件准备完整状态

除“正常数据”外，组件或页面必须能展示加载、空数据、失败、禁用和提交中状态。把这些状态写进接口，而不是让调用方猜测怎么拼。

```vue
<MemberList
  :items="members"
  :loading="loading"
  :error="error"
  @retry="loadMembers"
/>
```

稳定边界比抽象层数更重要。一个组件只要职责明确，即使暂时不复用，也已经为后续变化留下了空间。
