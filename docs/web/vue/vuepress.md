# VuePress从使用，到部署GitHub Pages，到自定义域名设置

一、项目结构

![project](https://cdn.nlark.com/yuque/0/2019/png/242278/1567494861315-570edd2b-af09-4015-8080-9b230b9e8500.png)

二、搭建

1. 全局安装VuePress

` npm install -g vuepress `

2. 新建文件夹

比如：blog-vuepress

3. 项目初始化

```json
// 命令行:  yarn init -y
// 文件: package.json

{
  "name": "blog-vuepress",
  "version": "1.0.0",
  "main": "index.js",
  "license": "MIT",
  "scripts": {
    "docs:dev": "vuepress dev docs",
    "docs:build": "vuepress build docs",
    "deploy": "bash deploy.sh"
  }
}
```

4. 在blog-vuepress根目录下新建docs

```js
// 1.命令行:  yarn docs:build

// 生成 docs/.vuepress 文件夹,在此文件夹下新建config.js

// config.js
module.exports = {
  title: '给大佬端茶',
  description: '给大佬端茶',
  head: [
    ['link', { rel: 'icon', href: 'image/给大佬端茶.png' }],
  ],
  base: '/blog/',
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    sidebarDepth: 2,
    lastUpdated: 'Last Updated',
    collapsable: true,
    displayAllHeaders: true,
    activeHeaderLinks: false,
    repo: 'https://github.com/yq1930/blog',
    nav: [  //导航栏                                             
      { text: '首页', link: '/' },
      { text: '语雀', link: 'https://www.yuque.com/dashboard/books' },
      { text: 'GitHub', link: 'https://github.com/yq1930' },
      {
        text: 'English', items: [
          { text: '单词', link: 'https://translate.google.com' }
        ]
      },
    ],
    sidebar: [  //侧边栏
      {
        title: '前端',
        collapsable: false,
        children: [
          ['/web/html', '超文本标记'],
          ['/web/css', '层叠样式表'],
          ['/web/js', '解释型编程语言']
        ]
      }
    ]
  }
};

// 2.在docs根文件夹下新建README.md

// README.md

---
home: true
lang: zh-CN
heroImage: image/给大佬端茶.png
actionText: 快速进入 →
actionLink: /web/html
features:
- title: GitHub
  details: 全球最大的'同性交友网站'
- title: 语雀
  details: 专业的云端知识库
- title: Vue
  details: Vue是一套用于构建用户界面的渐进式框架。与其它大型框架不同的是，Vue 被设计为可以自底向上逐层应用。
footer: MIT Licensed | Copyright © 2019-present qun ye
---

```

5. 运行 yarn docs:dev查看本地效果

三、部署到GitHub Pages

这里按照https://***.github.io/***方式部署

1. 在github新建一个名为blog的仓库
2. 按照github给出的步骤，讲blog-vuepress项目push上去
3. 在blog-vuepress根目录下新建 deploy.sh 脚本

```sh

#!/usr/bin/env sh

# 确保脚本抛出遇到的错误
set -e

# 生成静态文件
yarn run docs:build

# 进入生成的文件夹
cd docs/.vuepress/dist

# 如果是发布到自定义域名
# echo 'www.yequn.fun' > CNAME

git init
git add -A
git commit -m 'deploy'

# 如果发布到 https://<USERNAME>.github.io
# git push -f git@github.com:yq1930/blog.github.io.git master

# 如果发布到 https://<USERNAME>.github.io/<REPO> （注意：我们用的是这个方式！！！）
git push -f git@github.com:yq1930/blog.git master:gh-pages

cd -

```

4. 在终端上进入blog-vuepress项目中

`命令行:    yarn deploy`

![deploy](https://cdn.nlark.com/yuque/0/2019/png/242278/1567496870204-b1ba90e0-02bc-4926-9483-c01dc127a59b.png?x-oss-process=image/resize,w_746)

5. 在github中仓库blog设置

![github1](https://cdn.nlark.com/yuque/0/2019/png/242278/1567496941180-6b64b00f-0d2b-46db-aea2-8e71b7f57e0f.png?x-oss-process=image/resize,w_746)

![github2](https://cdn.nlark.com/yuque/0/2019/png/242278/1567496982334-aa49de30-dcce-4dd8-941b-f0ebe2a8efb9.png?x-oss-process=image/resize,w_746)


在github pages的source下选择我们在脚本中push上来的分支，然后点击 `https://yq1930.github.io/blog/` 看看是否部署成功

**这里有个坑**：

github中的公钥是以前windows上，在mac上并没有更换，导致在 输入命令行: `yarn deploy` 时并没有产生 `gh-pages breanch 分支`，
导致找不到这个分支，**解决的办法是**:进入到mac上本地 .ssh 中 id_rsa.pub中的公钥添加到github上即可

这样在github pages分支上找到这个gh-pages breanch分支

四、自定义域名

1. 需要:一个域名（阿里云等）
2. 解析域名，看下图

![aliyun](https://cdn.nlark.com/yuque/0/2019/png/242278/1567565645943-69598caf-a885-40a3-804a-9bf91ee6aa46.png?x-oss-process=image/resize,w_746)

比如：我的域名 `yequn.fun`（阿里云购买的域名）

3.
```sh

`文件 deploy.sh`

#!/usr/bin/env sh

# 确保脚本抛出遇到的错误
set -e

# 生成静态文件
yarn run docs:build

# 进入生成的文件夹
cd docs/.vuepress/dist

# 如果是发布到自定义域名
echo 'www.yequn.fun' > CNAME

git init
git add -A
git commit -m 'deploy'

# 如果发布到 https://<USERNAME>.github.io
# git push -f git@github.com:yq1930/blog.github.io.git master

# 如果发布到 https://<USERNAME>.github.io/<REPO>
git push -f git@github.com:yq1930/blog.git master:gh-pages

cd -

```

4. config.js中 `base：'/'`,这里发现写法变成 `base:'/blog/'`，跳转404页面

![404](https://cdn.nlark.com/yuque/0/2019/png/242278/1567565731813-f0933e78-4bc3-4b77-83f3-b4c7508ae912.png)

5.命令行: `yarn deploy` 输入网址:www.yequn.fun即可
