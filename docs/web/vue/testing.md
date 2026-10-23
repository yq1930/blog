---
title: Vue 组件测试
description: 像用户一样测试组件：测“按下按钮后出没出咖啡”，不测“齿轮转了几圈”。并解决断言时 DOM 还没更新、找不到 router 和 Pinia、mock 了一切等于没测、测试之间互相污染、依赖时间导致时好时坏等问题。
---

# Vue 组件测试

很多团队试过写组件测试，后来又放弃了，原因通常是：

- 重构了一下组件内部，几十个测试全红了，功能其实一点没变；
- 测试全部通过，上线后还是出了 bug；
- 同一个测试，有时过有时不过；
- 一挂载组件就报 `injection "Symbol(router)" not found`。

这些问题大多源于**测错了东西**和**没有隔离好环境**。这篇讲清组件测试应该测什么、怎么写，以及怎么解决这些常见问题。

::: tip 读完这篇你会
- 区分组件的“契约”和“实现”，只为契约写测试
- 用 Vitest + Vue Test Utils 写出稳定的组件测试
- 处理异步更新、路由和 Pinia 依赖、时间和测试隔离
:::

## 1. 原理：测咖啡，不测齿轮

测试一台咖啡机时，你关心的是：放好豆子、按下按钮，能不能出咖啡，咖啡对不对。你不会去检查里面的齿轮转了几圈。哪天厂家把齿轮换成了皮带，只要咖啡一样，测试就不该失败。

组件也一样，它有对外的**契约**：

- **输入**：props、插槽、用户操作（点击、输入）；
- **输出**：渲染出的内容、发出的事件、调用的外部接口。

内部用了几个 `ref`、方法叫什么名字，都是“齿轮”。测试只盯契约，重构内部时测试就不会无故失败；而只要契约被破坏，测试一定会发现。

| 应该测 | 不该测 |
| --- | --- |
| 给定 props 时渲染出什么 | 组件内部某个 `ref` 的值 |
| 点击、输入后界面怎么变化、发出了什么事件 | 某个内部方法有没有被调用 |
| 加载中、空数据、出错时的显示 | Vue 的响应式是否正常（那是 Vue 的事） |
| 调用接口时传的参数 | 具体的 CSS 样式 |

## 2. 第一个测试

```bash
npm i -D vitest @vue/test-utils happy-dom
```

在 `vite.config.js` 的 `test` 配置里设置 `environment: 'happy-dom'`，让测试运行在模拟的浏览器环境中。

```js
// SubmitButton.spec.js
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SubmitButton from './SubmitButton.vue'

describe('SubmitButton', () => {
  it('显示传入的文案', () => {
    const wrapper = mount(SubmitButton, { props: { label: '保存' } })
    expect(wrapper.text()).toContain('保存')
  })

  it('点击时发出 submit 事件', async () => {
    const wrapper = mount(SubmitButton)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('禁用时点击不会发出事件', async () => {
    const wrapper = mount(SubmitButton, { props: { disabled: true } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
```

每个测试都是“给定输入 → 执行操作 → 检查输出”三步，名字用一句话描述行为。

## 3. 坑一：重构了内部实现，测试全红

**现象**：把组件里的 `handleSubmit` 改名为 `onSubmit`，功能没变，测试却挂了一片。

```js
expect(wrapper.vm.handleSubmit).toHaveBeenCalled() // ❌ 测的是“齿轮”
```

**修复**：从用户的角度描述行为：

```js
await wrapper.find('input').setValue('小林')
await wrapper.find('form').trigger('submit')
expect(wrapper.text()).toContain('已添加：小林') // ✅ 测的是“咖啡”
```

查找元素时，优先用用户看得到的东西（按钮文字、输入框的标签），其次用专门给测试用的 `data-testid`，尽量不用样式类名。如果喜欢“按角色、按标签查找”的写法，可以使用 `@testing-library/vue`，它提供 `getByRole('button', { name: '提交' })`、`getByLabelText('用户名')` 等查询方法，写出来的测试还能顺带检查可访问性。

## 4. 坑二：断言时 DOM 还没更新

**现象**：点击按钮后断言页面上出现了某段文字，测试失败；但在浏览器里手动操作完全正常。

**原因**：Vue 的 DOM 更新是**异步**的。修改数据后，Vue 会在下一个微任务里统一更新 DOM。如果没等更新完成就断言，看到的还是旧的 DOM。涉及接口请求时，还要等请求的 Promise 完成。

**修复**：

```js
import { flushPromises } from '@vue/test-utils'

it('搜索后显示结果', async () => {
  const wrapper = mount(SearchBox)
  await wrapper.find('input').setValue('vue') // await：等待 DOM 更新
  await wrapper.find('button').trigger('click')
  await flushPromises()                         // 等待所有进行中的 Promise（比如模拟的接口）完成
  expect(wrapper.text()).toContain('Vue.js')
})
```

`trigger`、`setValue` 返回的 Promise 会等到 DOM 更新完成，一定要 `await`。

## 5. 坑三：挂载组件就报错，找不到 router 或 Pinia

**现象**：

```text
[Vue warn]: injection "Symbol(router)" not found.
[Vue warn]: Failed to resolve component: el-button
getActivePinia() was called but there was no active Pinia.
```

**原因**：组件在应用里运行时，`main.js` 已经安装好了路由、Pinia 和全局组件。测试里单独挂载组件时，这些都不存在。

**修复**：通过 `global` 选项提供组件需要的环境：

```js
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'

const router = createRouter({ history: createMemoryHistory(), routes })

const wrapper = mount(OrderPage, {
  global: {
    plugins: [router, createTestingPinia({ initialState: { user: { name: '小林' } } })],
    stubs: { ElDialog: true } // 用占位替换掉很重、与测试无关的组件
  }
})
```

`createTestingPinia` 会提供一个干净的测试用 Pinia，可以设置初始状态，store 的 action 默认被替换成可断言的模拟函数。没有开启 Vitest 的 `globals` 选项时，需要显式传入 `createSpy: vi.fn`。

## 6. 坑四：mock 了一切，测试只证明了 mock 是对的

**现象**：测试覆盖率很高，全部通过，但上线后接口字段改名，页面直接坏了。

**原因**：测试里把接口模块、子组件、store 全部 mock 掉了，测试实际上只是在验证“我写的 mock 和我的组件配合得很好”。

**修复**：**只 mock 系统的边界**——网络请求、时间、随机数、浏览器不支持的 API。其他部分（子组件、组合式函数、store 逻辑）尽量用真实的。

模拟网络请求时，可以用 MSW（Mock Service Worker）在网络层拦截请求，组件代码、请求层代码都按真实的方式运行，只有“服务器”是假的：

```js
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/api/orders', () => HttpResponse.json([{ id: 1, title: '测试订单' }]))
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

`mount` 和 `shallowMount` 的选择也是同理：默认用 `mount`，只有子组件会发请求、加载重型第三方库时，才用 `shallowMount` 或 `stubs` 把它隔离掉。

## 7. 坑五：测试时好时坏

**现象**：某个测试在本地总是通过，在 CI 上偶尔失败；或者跑单个文件通过，全部一起跑就失败。

**常见原因与修复**：

| 原因 | 修复 |
| --- | --- |
| 依赖真实时间（“3 天前”“倒计时”） | `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-01-01'))` 固定时间 |
| 依赖随机数 | 模拟 `Math.random` 或把随机数生成器作为参数传入 |
| 测试之间共享了状态（模块级变量、`localStorage`、store） | 在 `beforeEach` 里重置；每个测试创建新的 Pinia |
| 等待时间不够（用 `setTimeout` 等异步） | 改为 `flushPromises`，或用假定时器精确推进时间 |

```js
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T10:00:00+08:00'))
})

afterEach(() => {
  vi.useRealTimers()
})
```

## 8. 覆盖率不是目标

覆盖率能告诉你**哪些代码完全没被测到**，但不能告诉你测得好不好。只挂载组件、不写断言的测试也能让覆盖率上升。

合理的做法：关键业务流程（下单、支付、权限判断）的测试要充分，覆盖各种异常分支；纯展示的组件少测一些也无妨。比起覆盖率数字，更重要的是：**每修一个 bug，就补一个能复现它的测试**，同样的 bug 就不会再回来。

## 排查思路

1. **只跑一个测试**：`npx vitest -t "搜索后显示结果"`，缩小范围。
2. **看测试里的 DOM 到底长什么样**：`console.log(wrapper.html())`，很多“找不到元素”的问题一看就明白。
3. **可视化调试**：`npx vitest --ui` 打开图形界面，查看每个测试的执行过程和输出。
4. **怀疑测试之间互相影响**：单独运行这个测试文件；再打乱顺序运行（`--sequence.shuffle`），看失败是否和顺序有关。
5. **组件警告**：测试输出里的 `[Vue warn]` 不要忽略，它往往直接指出缺少的插件或错误的 props。

## 检查清单

- [ ] 测试只关注 props、用户操作、渲染结果和事件
- [ ] 每次交互后 `await`，涉及请求时 `flushPromises`
- [ ] 通过 `global.plugins` 提供 router、Pinia 等环境
- [ ] 只 mock 网络、时间、随机数等边界，其余尽量用真实实现
- [ ] 每个测试开始前重置共享状态
- [ ] 修复 bug 时补一个能复现它的测试

## 延伸阅读

- [测试分层与回归保护](/engineering/testing)：单元、集成、端到端测试怎么分工
- [组件设计与状态边界](/web/vue/component-design)：职责清晰的组件才好测
- [可访问性实战](/web/frontend/accessibility)：按角色和标签查找元素的好处
