---
title: Gulp 4：维护旧项目
description: 面向维护老项目，用“水管和滤网”理解 Gulp 的文件流，并整理最常见的报错：任务未完成异步信号、primordials is not defined、node-sass 装不上、Sass 报错让监听退出、输出目录被当成输入导致无限构建。
---

# Gulp 4：维护旧项目

Gulp 是一个“把读取文件 → 转换 → 写出文件串成任务”的工具，在很多老项目里还在使用。新项目一般用 Vite 或框架自带的脚手架就够了，但接手老项目时，你大概率会遇到这些报错：

- `Did you forget to signal async completion?`
- `ReferenceError: primordials is not defined`
- `node-sass` 安装失败，一屏的编译错误；
- 改了一个 Sass 文件写错了一个括号，`watch` 直接退出了。

这篇先讲清 Gulp 的工作方式，再逐个解决这些问题。

::: tip 读完这篇你会
- 理解 Gulp 的文件流和任务编排
- 定位并修复老项目中最常见的 Gulp 报错
- 判断什么时候值得把 Gulp 迁移到现代构建工具
:::

## 1. 原理：水管和滤网

Gulp 的核心是**流**（stream）。可以把它想成一根水管：

```text
src('src/styles/**/*.scss')    打开水龙头：把匹配的文件读进水管
  .pipe(sass())                第一道滤网：Sass 编译成 CSS
  .pipe(autoprefixer())        第二道滤网：加浏览器前缀
  .pipe(dest('dist/css'))      出水口：写到输出目录
```

文件在水管里流动，每经过一个插件（`.pipe(...)`）就被处理一次，最后由 `dest` 写到磁盘。任务就是一根完整的水管：

```js
const { src, dest, series, parallel, watch } = require('gulp')
const sass = require('gulp-sass')(require('sass'))

function styles() {
  return src('src/styles/**/*.scss', { sourcemaps: true })
    .pipe(sass().on('error', sass.logError))
    .pipe(dest('dist/css', { sourcemaps: '.' }))
}

function watchFiles() {
  watch('src/styles/**/*.scss', styles)
}

exports.styles = styles
exports.dev = series(styles, watchFiles)
```

## 2. 串行和并行

| API | 含义 | 适用 |
| --- | --- | --- |
| `series(a, b)` | `a` 完成后再执行 `b` | 先清空输出目录，再构建 |
| `parallel(a, b)` | 同时执行 | 样式、脚本、图片互不依赖 |
| `watch(glob, task)` | 文件变化时执行任务 | 本地开发 |

```js
exports.build = series(clean, parallel(styles, scripts, copyAssets))
```

有先后依赖的任务（比如先清空 `dist`、再往 `dist` 里写文件）必须用 `series`，放进 `parallel` 会出现“刚生成的文件被删掉”的随机问题。

## 3. 坑一：`Did you forget to signal async completion?`

**现象**：

```text
The following tasks did not complete: styles
Did you forget to signal async completion?
```

或者没有报错，但任务“瞬间完成”，后面依赖它的任务读不到文件。

**原因**：Gulp 需要知道一个任务**什么时候结束**。任务函数必须返回一个流、一个 Promise，或者调用传入的回调函数。最常见的错误是忘了写 `return`：

```js
function styles() {
  src('src/styles/**/*.scss').pipe(sass()).pipe(dest('dist/css')) // ❌ 没有 return
}
```

Gulp 拿不到这根“水管”，就不知道水什么时候流完。

**修复**：返回流；非流的异步任务写成 `async` 函数或返回 Promise：

```js
function styles() {
  return src('src/styles/**/*.scss').pipe(sass()).pipe(dest('dist/css')) // ✅
}

async function clean() {
  const { deleteAsync } = await import('del') // del 的新版本只提供 ES Module
  await deleteAsync(['dist/**'])
}
```

## 4. 坑二：`primordials is not defined`

**现象**：在较新的 Node.js 上运行老项目，直接报错：

```text
ReferenceError: primordials is not defined
```

**原因**：项目使用的是 Gulp 3，它依赖的一个旧模块使用了 Node.js 内部的写法，在 Node.js 12 及以后的版本中已经不再可用。

**修复**（二选一）：

- **临时方案**：用 nvm 等工具切换到项目当年使用的 Node.js 版本（通常是 10 或更早），先让项目跑起来。在项目里写上 `.nvmrc`，避免下一个人再踩坑；
- **长期方案**：升级到 Gulp 4。注意 Gulp 3 用数组声明任务依赖的写法需要改成 `series` / `parallel`：

```js
// Gulp 3 写法
gulp.task('build', ['clean', 'styles', 'scripts'])

// Gulp 4 写法：明确表达先后关系
exports.build = series(clean, parallel(styles, scripts))
```

## 5. 坑三：`node-sass` 装不上

**现象**：`npm install` 时 `node-sass` 报出大段的编译错误（提到 `node-gyp`、`python`、`binding.node` 等）。

**原因**：`node-sass` 是基于 C++ 的 LibSass 绑定，每个版本只支持特定范围的 Node.js 版本，需要下载或现场编译对应的二进制文件。Node.js 版本一变，就可能装不上。而且 `node-sass` 和 LibSass 都已经停止维护。

**修复**：换成官方维护的纯 JavaScript 实现 `sass`（Dart Sass），绝大多数语法完全兼容：

```bash
npm uninstall node-sass
npm install -D sass gulp-sass@5
```

```js
const sass = require('gulp-sass')(require('sass')) // gulp-sass 5 需要显式传入编译器
```

迁移后可能看到一些弃用警告（比如 `/` 作为除法、`@import` 的写法），它们不影响当前构建，可以逐步按提示修改。

## 6. 坑四：Sass 写错一个括号，`watch` 就退出了

**现象**：开发时改样式，不小心少写了一个 `}`，终端报错后 `watch` 进程直接结束，之后改什么都没反应，要手动重新启动。

**原因**：流里的错误没有被处理，冒泡成了未捕获的异常，整个进程退出。

**修复**：给 Sass 插件加上错误处理，`sass.logError` 会打印错误并让当前这次编译结束，而不是让进程退出：

```js
.pipe(sass().on('error', sass.logError))
```

其他插件也可以用 `gulp-plumber` 统一防止流错误导致进程退出。

## 7. 坑五：构建一直在循环

**现象**：启动 `watch` 后，任务一遍又一遍地执行，停不下来，CPU 占满。

**原因**：输出目录被包含在了监听或输入的范围里。任务写出文件 → 触发监听 → 再次执行任务 → 又写出文件……

```js
watch('**/*.css', styles) // ❌ 连 dist 里新生成的 CSS 也被监听了
```

**修复**：输入和监听只匹配源码目录，并排除输出目录：

```js
watch('src/**/*.scss', styles)
```

## 8. 接手老项目，先确认这几件事

1. **Node.js 版本**：看 `.nvmrc`、`engines` 字段、CI 配置或 README，用当年的版本先跑起来；
2. **锁文件**：按锁文件安装（`npm ci`），不要一上来就升级所有依赖；
3. **Gulp 主版本**：看 `package.json` 里 Gulp 是 3 还是 4，写法不同；
4. **输入输出目录**：搞清楚 `src`、`dest` 和最终部署的目录，避免误删或循环构建。

先让项目按原样跑起来，再一项一项地升级，每升级一项就验证一次。

## 9. 要不要迁移到 Vite

| 情况 | 建议 |
| --- | --- |
| 项目基本不再开发，偶尔改改样式 | 保持 Gulp，修好环境问题即可 |
| 还在持续开发，构建慢、插件不再维护 | 考虑迁移 |
| Gulp 里有大量定制任务（图片处理、文件生成） | 可以保留 Gulp 处理这些任务，JS/CSS 构建交给 Vite |

迁移时逐个任务替换，每替换一项都对比构建产物，确认页面效果一致。

## 检查清单

- [ ] 每个任务都 `return` 了流或 Promise
- [ ] 有依赖关系的任务使用 `series`
- [ ] 项目记录了可用的 Node.js 版本
- [ ] 使用 `sass` 代替已停止维护的 `node-sass`
- [ ] 流中的错误被处理，`watch` 不会因为语法错误退出
- [ ] 监听和输入只匹配源码目录，不包含输出目录

## 延伸阅读

- [构建工具选型](/web/frontend/build-tools)：现代构建工具做了什么
- [技术债务治理](/engineering/tech-debt)：老项目依赖的渐进升级
- [前端工程化地图](/engineering/toolchain)：锁文件与 Node 版本管理
