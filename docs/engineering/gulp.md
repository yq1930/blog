---
title: Gulp 4：维护旧项目
description: 在已有 Gulp 项目中读懂任务编排、文件流和常见排查点，而不是为新项目盲目引入它。
---

# Gulp 4：维护旧项目

Gulp 擅长把“读取文件 → 转换 → 写回文件”的重复工作串成任务。它依然适合维护历史项目；新项目是否使用，应先比较 Vite、框架 CLI 等已有工具是否已经覆盖需求。

## 一条任务就是一条文件流

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

这里的关键是 `return`：Gulp 需要拿到 stream、Promise、回调或子进程中的一种，才能准确知道任务何时结束。遗漏 `return` 常常导致构建提前结束或任务顺序混乱。

## 串行与并行要表达真实依赖

| API | 语义 | 适用情况 |
| --- | --- | --- |
| `series(a, b)` | `a` 成功后再执行 `b` | 清理完成后再构建 |
| `parallel(a, b)` | 同时执行 | 样式、脚本、图片互不依赖 |
| `watch(glob, task)` | 文件变化时运行任务 | 本地开发 |

```js
function clean() {
  // 返回删除操作对应的 Promise
}

exports.build = series(clean, parallel(styles, scripts, copyAssets))
```

不要把有读写同一目录关系的任务放入 `parallel`。例如先清空 `dist`，再生成文件，这两个动作必须串行。

## 维护旧仓库前先确认三件事

1. **Node 版本与锁文件**：旧插件可能只支持特定 Node 版本，先按项目说明安装依赖。
2. **Gulp 主版本**：Gulp 3 的依赖数组写法与 Gulp 4 的 `series` / `parallel` 不兼容，升级前要完整评估。
3. **输出目录**：确认 `src`、`dest` 和部署目录，避免 watcher 把构建产物再次当作输入造成循环。

## 常见问题排查

| 现象 | 优先检查 |
| --- | --- |
| 任务刚启动就结束 | 是否 `return` 了 stream / Promise |
| Sass 构建中断 | 是否监听了 error，并确认 `sass` 实现版本 |
| 修改后没有重新编译 | glob 是否覆盖目标文件，watcher 是否仍在运行 |
| 文件重复或无限构建 | 输出目录是否被包含在输入 glob 中 |

Gulp 的价值在于明确的自动化边界。只保留团队确实需要的任务，并给输入、输出和失败行为写清注释，维护成本会低得多。
