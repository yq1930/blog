# Gulp4.0之初步用法

### 根目录下 gulpfile.js

```javascript
// 根目录下 gulpfile.js

'use strict'

const gulp = require('gulp'),
  sass = require('gulp-sass'),
  livereload = require('gulp-livereload'),
  webserver = require('gulp-webserver'),
  plumber = require('gulp-plumber'), //解决scss编译报错，终止监听
  watch = require("gulp-watch"); //监听scss变化

// 注册任务
gulp.task('webserver', () => {
  gulp.src('./src')   // 服务器目录（./代表根目录）
    .pipe(webserver({   // 运行gulp-webserver
      livereload: true,   // 启用LiveReload
      open: true,   // 服务器启动时自动打开网页
      port: 8080
    }))
});

gulp.task('watchHtml', () => {
  gulp.src('src/*.html', 'src/pages/*.html')
    .pipe(livereload());
});

//sass编译
gulp.task('watchSass', () => {
  gulp.src('src/scss/*.scss')
    .pipe(sass())
    .pipe(plumber())
    .pipe(gulp.dest('src/css'))
    .pipe(livereload());
});

gulp.task('watchJs', () => {
  gulp.src('src/js/*.js')
    .pipe(livereload());
});

//监听.scss
gulp.task('watch', () => {
  livereload.listen();
  watch(['src/scss/*.scss'], gulp.series(['watchSass']))
  watch(['src/*.html', 'src/pages/*.html'], gulp.series(['watchHtml']))
  watch(['src/js/*.js'], gulp.series(['watchJs']))
});

//用gulp实现编译
gulp.task('default',
  gulp.parallel('watch', 'watchSass', 'watchHtml', 'watchJs', 'webserver'));

  // gulp.series 用于串行（顺序）执行
  // gulp.parallel 用于并行执行

```

### 页面结构

![page](https://cdn.nlark.com/yuque/0/2019/png/242278/1566458512057-29ed447f-1094-42a0-8b52-44162afc1982.png)