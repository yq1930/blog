---
title: Vue 组件测试
description: 测用户能感知的行为，而不是组件内部的实现细节，否则测试会变成维护负担。
---

# Vue 组件测试

测试 Vue 组件最大的误区，是把它当单元测试来写——断言 `data` 里的某个值、检查某个内部方法被调用。这种测试和实现强绑定，重构一改就全红。正确的姿势是**测行为**：用户点这个按钮会发生什么、传入这些 props 会渲染出什么。

## 测什么，不测什么

| 测 | 不测 |
| --- | --- |
| 给定 props，渲染出什么内容 | 组件内部 `ref` / `reactive` 的具体值 |
| 用户交互后，UI 如何变化 / 发出什么事件 | 某个私有方法是否被调用 |
| 暴露给父组件的 `defineExpose` 接口 | Vue 自己的响应式是否工作 |
| 边界：空数据、加载中、错误态 | 第三方库的内部实现 |
| 事件回调传给父组件的参数 | CSS 样式细节（交给视觉走查） |

一句话：**测试组件的"契约"（输入输出），而不是"实现"（怎么做的）。** 这样实现重构时测试不需要改。

## @vue/test-utils 基础

```bash
npm i -D vitest @vue/test-utils @vitest/ui happy-dom
```

```js
// Button.spec.js
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import MyButton from './MyButton.vue'

describe('MyButton', () => {
  it('渲染默认文案', () => {
    const wrapper = mount(MyButton)
    expect(wrapper.text()).toContain('提交')
  })

  it('点击时触发 click 事件', async () => {
    const wrapper = mount(MyButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('disabled 时不触发 click', async () => {
    const wrapper = mount(MyButton, { props: { disabled: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
```

## mount vs shallowMount

| 选项 | 行为 | 用在 |
| --- | --- | --- |
| `mount` | 完整渲染子组件 | 集成测试，验证组件组合后的真实行为 |
| `shallowMount` | 用桩替换子组件 | 单元测试，隔离被测组件，避免子组件复杂度干扰 |

默认优先用 `mount`。只有当子组件会发网络请求、挂载第三方库、或本身很重时，才用 `shallowMount` 把它隔离掉。盲目 shallow 会让测试脱离真实渲染链路，测了等于没测。

> 不要为了"快"而全部 shallow。子组件渲染错误往往只有 `mount` 才能暴露。

## 测用户行为，不测实现

反例（绑定实现）：

```js
// 错：测了内部方法名，一改名就挂
expect(wrapper.vm.handleSubmit).toHaveBeenCalled()
```

正例（测行为）：

```js
// 对：用户提交后，列表里出现新项
await wrapper.find('input').setValue('南终')
await wrapper.find('button').setValue('submit') // 或 trigger
expect(wrapper.text()).toContain('南终')
```

查询元素时优先用对用户有意义的锚点：`role`、`label`、可见文案，而不是 CSS class 或内部 ref。这能让测试和实际可访问性同步：

```js
// 推荐
wrapper.findByRole('button', { name: '提交' })
wrapper.findByLabelText('用户名')

// 不推荐
wrapper.find('.submit-btn')
wrapper.find('[data-test="submit"]')
```

## mock 依赖：隔离外部世界

组件依赖 store、API、路由时，测试里用 mock 替换，避免真的发请求或依赖全局状态：

```js
import { mount } from '@vue/test-utils'

const fetchUser = vi.fn().mockResolvedValue({ id: 1, name: '南终' })

const wrapper = mount(UserCard, {
  props: { userId: 1 },
  global: {
    provide: {
      // 或 mockstores
    }
  }
})

// 或对模块整体 mock
vi.mock('@/api/user', () => ({
  getUser: vi.fn()
}))
```

> 只 mock 会带来"非确定性"或"重依赖"的部分。把所有东西都 mock 掉的测试只能验证你的 mock，证明不了组件能工作。

## 异步测试

Vue 的更新是异步的（nextTick）。触发交互后要 `await`，否则断言跑在 DOM 更新之前：

```js
it('搜索后显示结果', async () => {
  const wrapper = mount(Search)
  await wrapper.find('input').setValue('vue')
  await wrapper.find('button').trigger('click')
  // 等待接口 mock resolve + DOM 更新
  await flushPromises()
  expect(wrapper.text()).toContain('Vue.js')
})
```

`flushPromises`（来自 `@vue/test-utils`）让所有 pending 的 Promise 立即 resolve，是测异步行为的标配。

## 覆盖率误区

覆盖率数字高不代表测试好。常见陷阱：

- 写一堆只 `mount` 组件不断言的测试，覆盖率上去了，但什么都没验证。
- 为了覆盖率去测 getter、computed 这种纯函数——它们该通过使用它们的场景间接测到。
- 追求 100% 覆盖率反而让人写形式化测试。

合理目标：关键业务路径（提交、支付、权限）覆盖率接近 100%；展示型组件、纯样式组件覆盖率低一些无所谓。

## 检查表

- 测用户能感知的行为（渲染、交互、事件），而不是内部实现。
- 优先 `mount`，只在子组件会引入副作用时才 `shallowMount`。
- 用 role / label / 文案查询元素，少用 CSS 选择器。
- mock 只针对外部依赖（API、路由、复杂 store），别 mock 掉一切。
- 异步交互后 `await flushPromises()` 再断言；覆盖率服务于关键路径，不追求表面数字。
