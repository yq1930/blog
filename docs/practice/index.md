---
title: 真实工程实践
description: 从笔记应用、桌面扩展，以及 PHP/Yaf、Vue 2、移动 H5 和微信小程序的真实改动中整理出的开发经验：每篇从一个真实问题出发，讲清原因、修法和检查清单。
---

# 真实工程实践

这里收录的是真实项目里踩过的坑和摸索出的做法，覆盖 Vue 3、Express、PHP/Yaf、PC 管理后台、移动 H5、原生微信小程序和桌面扩展。

和其他栏目讲“一个技术点”不同，这里的每篇文章都从**一个在项目里真实发生过的问题**出发：现象是什么、为什么会发生、项目里是怎么修的、怎样避免再犯。

::: tip 关于示例代码
代码保留了真实项目中的工程模式，但已经删除生产地址、凭据、客户数据、内部业务名称和特殊常量。文章会区分“项目里已经实现的”和“建议的做法”，不会把建议写成现状。
:::

## 按问题快速找文章

| 你现在遇到的问题 | 去读 |
| --- | --- |
| 一个需求不知道会影响哪些仓库和客户端 | [多端系统全景图](/practice/full-stack-system-map) |
| 三个客户端对同一个接口的成功、失败判断不一样 | [跨端 API 契约](/practice/cross-client-api-contract) |
| 想升级旧技术栈，又担心风险 | [旧系统渐进改造](/practice/legacy-modernization-roadmap) |
| 保存成功了，请求期间新输入的内容却丢了 | [编辑会话与本地草稿](/practice/notes-save-lifecycle) |
| 多个窗口互相覆盖，删除的内容又被同步回来 | [快照同步与并发冲突](/practice/notes-sync-consistency) |
| 粘贴 Markdown、图片附件出各种问题 | [富文本与附件生命周期](/practice/notes-rich-text-assets) |
| AI 生成的内容怎样安全地采纳和保存 | [AI 编辑的可靠性边界](/practice/notes-ai-editing) |
| 发布新版本后，已打开的页面切换路由报错 | [懒加载与发布恢复](/practice/notes-release-recovery) |
| Yaf 控制器和公共库越来越大 | [Yaf 多应用架构](/practice/yaf-multi-app-architecture) |
| PHP 爆出严重漏洞，旧项目又不能直接升级 | [PHP 漏洞处置与升级](/practice/php-critical-vulnerability-response) |
| PHP 升级后频繁报类型错误，部分结果还悄悄变了 | [PHP 8 编码规范与兼容检查](/practice/php8-coding-guidelines) |
| SQL 在数据库工具里有数据，报表页面却是空的 | [SQL 批处理结果契约](/practice/sql-batch-result-contract) |
| 写操作偶尔重复，或者状态不一致 | [事务、幂等与补偿](/practice/transactional-business-workflow) |
| Vue 2 路由、全局方法和 UI 库混在一起 | [Vue 2 多端工程治理](/practice/vue2-multi-terminal-engineering) |
| 微信 H5 登录后回不来、重复弹窗 | [移动 H5 会话与恢复](/practice/mobile-h5-reliability) |
| 图片加载后页面滑不动，海报缺图，首屏被定位卡住 | [H5 数据与布局就绪](/practice/h5-layout-readiness) |
| 打印总是多出一张空白页 | [浏览器打印分页](/practice/browser-print-pagination) |
| 小程序登录、定位和页面生命周期互相打架 | [原生小程序分层](/practice/native-mini-program-architecture) |
| 跳转规则有时效，旧页面还按旧规则执行 | [动态导航与规则缓存](/practice/runtime-navigation-rules) |
| 插件能安装，但宿主的设置保存不生效 | [插件宿主与版本兼容](/practice/plugin-host-compatibility) |
| 想分享项目经验，又担心泄露公司信息 | [私有项目公开写作](/practice/public-writing-from-private-code) |

## 第一次来，建议这样读

**如果你在做 Vue 3 编辑器、知识库或个人工具**，从 [笔记应用：从编辑器到可靠保存](/practice/notes-architecture) 开始，再按需阅读这一组的其他文章。

**如果你在维护多端业务系统**，按这个顺序读，先建立整体视角：

1. [一次需求到底要改哪里](/practice/full-stack-system-map)：看懂多端系统的完整请求链；
2. [PC、H5 和小程序怎样统一 API](/practice/cross-client-api-contract)：统一成功、失败、登录和重复提交；
3. [旧系统怎样一步步改](/practice/legacy-modernization-roadmap)：不停业务，也不推倒重来。

之后可以根据手上的问题直接挑文章。

## 笔记应用：Vue 3 与 Express 全栈实践

这一组围绕“用户写下的内容怎样可靠地保存下来”展开，取材于 PC 客户端、共享数据层和独立服务端的实际实现。

| 文章 | 解决的问题 |
| --- | --- |
| [从编辑器到可靠保存](/practice/notes-architecture) | 共享数据层、页面状态、编辑会话和服务端各自负责什么 |
| [编辑会话与本地草稿](/practice/notes-save-lifecycle) | 保存期间继续输入、切换文档、恢复草稿和账号隔离 |
| [快照同步与并发冲突](/practice/notes-sync-consistency) | 多窗口覆盖、目录移动、旧快照把已删除的内容复活 |
| [富文本与附件生命周期](/practice/notes-rich-text-assets) | Markdown 粘贴、HTML 存储、自定义节点和私有附件 |
| [AI 编辑的可靠性边界](/practice/notes-ai-editing) | 长任务取消、容量单位、完整输出和预览采纳 |
| [懒加载与发布恢复](/practice/notes-release-recovery) | 旧标签页请求不到页面资源，以及怎样保护编辑中的内容 |

## 服务端

| 文章 | 解决的问题 |
| --- | --- |
| [PHP 严重漏洞处置与升级](/practice/php-critical-vulnerability-response) | 严重漏洞公布后，Windows/Yaf 旧项目怎样盘点、临时缓解、补丁回补和迁移 |
| [PHP 8 编码规范与兼容检查](/practice/php8-coding-guidelines) | 数组与对象、数值运算、静默变化和 PHP 7.3 回滚期的兼容规则 |
| [Yaf 多应用项目整理](/practice/yaf-multi-app-architecture) | 多个入口、多个应用目录、共享模型和公共库各自负责什么 |
| [SQL 批处理与结果集](/practice/sql-batch-result-contract) | 一段 SQL 返回多个结果集时，前后端怎样约定“哪个才是数据” |
| [事务、幂等与补偿](/practice/transactional-business-workflow) | 订单、库存、支付、预约等不能重复执行的写操作 |

## 前端、H5 与小程序

| 文章 | 解决的问题 |
| --- | --- |
| [Vue 2 多端项目治理](/practice/vue2-multi-terminal-engineering) | PC 后台和移动 H5 的路由、请求层、Vuex、组件库怎样逐步整理 |
| [移动 H5 会话与恢复](/practice/mobile-h5-reliability) | 登录回跳、页面恢复、弱网、重复点击和宿主 SDK 互相影响 |
| [H5 数据与布局就绪](/practice/h5-layout-readiness) | 接口成功了，页面却还滑不动、海报缺图 |
| [浏览器打印分页](/practice/browser-print-pagination) | 单条和批量打印时的空白页与分页规则 |
| [原生小程序分层](/practice/native-mini-program-architecture) | `App`、`Page`、`Component`、请求和会话怎样组织 |
| [动态导航与规则缓存](/practice/runtime-navigation-rules) | 缓存候选范围，确认时重新读取规则 |
| [插件宿主与版本兼容](/practice/plugin-host-compatibility) | 桌面扩展的设置接口和依赖随宿主版本变化 |

## 写作附录

[私有项目怎么写成公开技术文章](/practice/public-writing-from-private-code)：怎样挑选代码、重写示例、合成数据、扫描构建产物，并区分“项目现状”和“推荐方案”。这个系列的每一篇都按这个方法写成。

## 近期更新：2026-10-26

新增 [PHP 8 编码规范与兼容检查](/practice/php8-coding-guidelines)，将 PHP 7.3 迁移到 PHP 8.3 后的常见问题整理为类型、运算、函数契约和回滚验证规则，并区分语言行为与项目兼容层约定。

## 2026-10-23 更新

本轮从八个项目近 30 天的本地提交中取材，并沿着直接相关的修复追踪上下文。已提交的源码只能证明“实现了”，不等于已经部署上线或通过了本次业务实测；还在进行中、没有提交的改动，没有写成稳定能力。

| 取材方向 | 对应文章 |
| --- | --- |
| 两个移动 H5 的滚动、海报和定位修复 | [数据、图片与布局就绪](/practice/h5-layout-readiness) |
| PC 后台的单条和批量打印 | [打印空白页与分页规则](/practice/browser-print-pagination) |
| PHP 报表服务及配套前端 | [SQL 批处理结果契约](/practice/sql-batch-result-contract) |
| 桌面扩展的设置接口和依赖调整 | [插件宿主兼容](/practice/plugin-host-compatibility) |
| 原生小程序的动态跳转改造 | [缓存候选范围、确认时重读规则](/practice/runtime-navigation-rules) |

同时更新了已有文章中的过时描述：[AI 编辑](/practice/notes-ai-editing) 补齐了取消链路和并发准入，[发布恢复](/practice/notes-release-recovery) 补充了固定提交和依赖恢复，[本地草稿](/practice/notes-save-lifecycle) 补充了类型隔离，[H5 会话](/practice/mobile-h5-reliability) 补充了入口身份来源和失败反馈。

## 每篇文章的写法

- 先讲现象，再讲原因，最后才给出术语；
- 每个坑都按“现象 → 原因 → 修复 → 怎么避免再犯”展开；
- 代码片段尽量短，说明它解决什么；
- 同时写成功路径和失败路径；
- 最后给出可以直接对照的检查清单。

只准备读一篇的话，从 [一次需求到底要改哪里](/practice/full-stack-system-map) 开始。
