---
title: 路由与页面状态
description: 把 URL 当作可以刷新、分享的页面状态来设计。修复详情页换参数不刷新、导航守卫无限重定向、权限路由刷新后 404、返回列表丢失位置、点一次筛选要按很多次返回等 Vue Router 常见问题。
---

# 路由与页面状态

地址栏不只是用来跳转页面的，它是一个用户可以**刷新、复制、收藏、前进后退**的状态容器。路由设计得好，用户分享出去的链接打开就是他看到的样子；设计得不好，就会出现这些问题：

- 从用户 1 的详情页跳到用户 2，页面还显示用户 1；
- 登录拦截写完后，页面卡死，控制台一直在跳转；
- 后台系统里，刷新某个页面直接变成 404；
- 从列表进详情再返回，列表回到了第一页顶部。

::: tip 读完这篇你会
- 分清路径参数、查询参数和组件状态各自该放什么
- 修复组件复用、守卫死循环、动态路由刷新等高频问题
- 让“返回”和“刷新”都能回到用户期望的位置
:::

## 1. 原理：URL 决定渲染哪个组件，但不一定重新创建它

Vue Router 做的事情可以简化为：**根据当前 URL 找到匹配的路由记录，把对应的组件渲染到 `<router-view>` 里**。

```text
/users/1  ──匹配──► { path: '/users/:id', component: UserDetail }  ──► 渲染 UserDetail
/users/2  ──匹配──► 同一条路由记录、同一个组件                      ──► 复用已有的 UserDetail 实例
```

关键在第二行：从 `/users/1` 到 `/users/2`，匹配到的是**同一个组件**，Vue 会复用已经存在的组件实例，只更新 `route.params`，**不会重新创建组件**。这个优化是很多路由 bug 的根源。

## 2. 什么状态放在 URL 的哪个位置

| 状态 | 放在哪里 | 例子 |
| --- | --- | --- |
| 正在看的是哪个资源 | 路径参数 | `/members/42` |
| 筛选、排序、分页、当前标签页 | 查询参数 | `?status=active&page=2` |
| 输入框聚焦、下拉展开、未提交的草稿 | 组件内部 | — |

判断标准：用户刷新后希望它还在、或者分享给别人时希望对方看到同样的内容，就放进 URL。

### 参数都是字符串，要先转换和校验

URL 里的参数都是字符串，而且用户可以随意修改。读取时先转换类型、给默认值、限制范围：

```js
function parsePage(value) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

const page = computed(() => parsePage(route.query.page))
const status = computed(() =>
  ['active', 'archived'].includes(route.query.status) ? route.query.status : 'active'
)
```

否则 `?page=abc` 会让接口收到 `NaN`，`?page=99999` 会请求一个不存在的页。

## 3. 坑一：详情页换了参数，数据没刷新

**现象**：URL 从 `/user/1` 变成了 `/user/2`，页面上还是用户 1 的资料，刷新后才正常。最常出现在详情页里点击“相关用户”、或者“上一篇 / 下一篇”这类链接时。

```js
onMounted(() => {
  loadUser(route.params.id) // ❌ 只在第一次挂载时执行
})
```

**原因**：就是第 1 节说的组件复用。组件没有被重新创建，`onMounted` 不会再次触发。

**修复**：监听参数变化，参数变了就重新加载：

```js
watch(
  () => route.params.id,
  (id) => loadUser(id),
  { immediate: true } // 第一次也立即执行，代替 onMounted
)
```

或者给 `<router-view>` 加 `key`，让参数变化时强制重新创建组件：

```vue
<router-view :key="$route.fullPath" />
```

`key` 的方式简单，但会让整个组件销毁重建（包括其中的子组件状态），适合比较轻的详情页。

**怎么避免再犯**：凡是依赖路由参数加载数据的组件，都用 `watch` 参数的方式写，不用 `onMounted`。

## 4. 坑二：导航守卫无限重定向

**现象**：加了“未登录跳转到登录页”的守卫后，页面卡住，控制台出现大量重定向警告，或者浏览器提示页面无响应。

```js
router.beforeEach((to) => {
  if (!isLoggedIn()) return '/login' // ❌ 去登录页时，也会被重定向到登录页
})
```

**原因**：跳转到 `/login` 本身也是一次导航，也会经过 `beforeEach`。用户未登录，于是又被重定向到 `/login`……无限循环。

**修复**：明确哪些页面不需要登录：

```js
router.beforeEach((to) => {
  if (to.meta.public) return true // 登录页、注册页等在路由 meta 里标记为 public
  if (!isLoggedIn()) {
    return { path: '/login', query: { redirect: to.fullPath } } // 登录后跳回原页面
  }
})
```

## 5. 坑三：后台系统刷新某个页面，直接 404

**现象**：后台的菜单和路由是根据用户权限动态添加的。从首页点进“报表”页面一切正常，但在“报表”页面按 F5 刷新，显示 404。

**原因**：刷新时，应用重新启动，第一次导航立刻开始匹配 `/reports`。而动态路由要等“获取用户权限”的请求回来后才 `addRoute`，此时还没添加，于是只能匹配到 404 页面。

**修复**：在守卫里先确保动态路由已经加载，加载完后**重新导航一次**：

```js
let routesReady = false

router.beforeEach(async (to) => {
  if (to.meta.public || routesReady) return true

  const menus = await fetchUserMenus()
  buildRoutes(menus).forEach((route) => router.addRoute(route))
  routesReady = true

  return to.fullPath // 路由表已更新，重新匹配一次当前地址
})
```

注意把 404 的兜底路由（`/:pathMatch(.*)*`）放在动态路由添加之后，或者确保它的优先级最低；退出登录时也要重置 `routesReady` 并移除动态路由，否则换账号后会残留上一个用户的菜单。

## 6. 坑四：从详情页返回，列表回到了第一页顶部

**现象**：用户在列表里翻到第 3 页、滚到中间，点进详情，再点返回，列表回到了第 1 页最顶部，得重新翻找。

**原因**：页码只存在组件内部变量里，返回时列表组件被重新创建，状态全部重置；浏览器也不知道该滚动到哪里。

**修复**：

1. **页码和筛选放进 URL 查询参数**，返回时自然恢复（见第 2 节）；
2. **恢复滚动位置**：

```js
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition // 浏览器前进后退时，回到之前的位置
    return { top: 0 }                       // 新打开的页面，从顶部开始
  }
})
```

3. 如果列表数据需要重新请求，请求完成前页面高度不够，滚动恢复会失效。这种情况可以用 `<keep-alive>` 缓存列表组件，或者在数据加载完成后再手动滚动。

## 7. 坑五：点了几次筛选，要按很多次“返回”

**现象**：在列表页切换了五次筛选条件，想回到上一个页面，结果要按五次返回键。

**原因**：每次切换筛选都用了 `router.push`，在浏览器历史里新增了一条记录。

**修复**：区分用户意图：

- 进入一个新页面（打开详情、进入下一步）：`router.push`；
- 在同一个页面里调整状态（筛选、排序、翻页、纠正非法参数）：`router.replace`，不新增历史记录。

```js
function setStatus(nextStatus) {
  router.replace({ query: { ...route.query, status: nextStatus, page: 1 } })
}
```

## 8. 坑六：快速切换页面，看到了上一个页面的数据

**现象**：快速从用户 1 切到用户 2，页面先显示用户 2，过了一会儿又变回用户 1 的资料。

**原因**：用户 1 的请求比用户 2 的晚返回，覆盖了正确的结果，这是竞态问题。

**修复**：参数变化时取消上一次的请求，或者只接受最新一次请求的结果。在 `watch` 的回调里可以注册清理函数：

```js
watch(
  () => route.params.id,
  async (id, _oldId, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort()) // 参数再次变化或组件卸载时，取消这次请求
    user.value = await getUser(id, { signal: controller.signal })
  },
  { immediate: true }
)
```

请求被取消时会抛出取消错误，记得在调用处识别并忽略它，不要提示给用户。

## 排查思路

1. **用 Vue Devtools 的路由面板**查看当前匹配到的路由、参数和查询参数。
2. **在守卫里打日志**：`router.beforeEach((to, from) => console.log(from.fullPath, '→', to.fullPath))`，重定向循环、意外跳转一眼就能看出来。
3. **路由“不存在”时**，在控制台执行 `router.getRoutes()`，看此刻路由表里到底有哪些路由。
4. **数据没刷新**：在组件里加 `onMounted(() => console.log('mounted'))`，切换参数时观察它有没有再次打印，确认是不是组件复用。
5. **刷新后 404**：区分是前端路由没匹配上（页面显示应用内的 404 组件），还是服务器没配置回退（浏览器显示服务器的 404 页面），后者见 [前端与 SEO](/web/frontend/seo) 中的服务器配置。

## 检查清单

- [ ] 资源身份用路径参数，筛选、分页、标签页用查询参数
- [ ] 路由参数在使用前做了类型转换和合法性校验
- [ ] 依赖路由参数的数据用 `watch` 加载，而不是只在 `onMounted` 里
- [ ] 登录守卫排除了公开页面
- [ ] 动态路由在首次导航前加载完成，退出登录时清理
- [ ] 配置了 `scrollBehavior`，返回时能恢复位置
- [ ] 页面内的状态调整用 `replace`，进入新页面用 `push`
- [ ] 参数变化时取消旧请求

## 延伸阅读

- [前端状态管理](/web/frontend/state-management)：URL 也是一种状态
- [异步流程与 Promise](/web/JavaScript/async)：竞态的原理
- [Vue 性能优化](/web/vue/performance)：`keep-alive` 的用法和代价
