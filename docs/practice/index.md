---
title: 真实工程实践
description: 从笔记应用、桌面扩展，以及 PHP/Yaf、Vue 2、移动 H5 和微信小程序的近期改动中整理出的可复用开发经验。
---

# 真实工程实践

这里收录笔记应用、桌面扩展与多端业务系统的真实项目经验，覆盖 Vue 3、Express、PHP/Yaf、PC 管理后台、移动 H5 和原生微信小程序。

文章不会按源码目录逐个介绍，而是挑开发中反复出现的问题，用短流程图、简化项目代码和检查清单讲清楚。

> 代码保留了真实项目中的工程模式，但已经删除生产地址、凭据、客户数据、内部业务名称和特殊常量。

## 第一次来，建议这样读

如果你正在做 Vue 3 编辑器、知识库或个人工具，从[笔记应用：从编辑器到可靠保存](/practice/notes-architecture)开始。

如果你在维护多端业务系统，可以按下面的顺序阅读：

1. [一次需求到底要改哪里](/practice/full-stack-system-map)：先看懂多端系统的完整请求链。
2. [PC、H5 和小程序怎样统一 API](/practice/cross-client-api-contract)：统一成功、失败、登录与重复提交。
3. [旧系统怎样一步步改](/practice/legacy-modernization-roadmap)：不停止业务，也不做高风险推倒重来。

这三篇建立整体视角，后面的文章可以按当前问题直接选择。

## 近期改动选读：2026-10-23

本轮从八个项目近 30 天的本地提交中取材，沿直接相关修复追踪上下文。已提交源码只证明实现状态，不等于已经部署或通过本次业务实测；未提交的在途改动没有写成稳定能力。

| 取材方向 | 新增经验 |
| --- | --- |
| 两个移动 H5 的滚动、海报与定位修复 | [数据、图片与布局就绪](/practice/h5-layout-readiness) |
| PC 后台的单条及批量打印 | [打印空白页与分页规则](/practice/browser-print-pagination) |
| PHP 报表服务及配套前端 | [SQL 批处理结果契约](/practice/sql-batch-result-contract) |
| 桌面扩展的设置接口和依赖调整 | [插件宿主兼容](/practice/plugin-host-compatibility) |
| 原生小程序的动态跳转改造 | [缓存候选范围、确认时重读规则](/practice/runtime-navigation-rules) |

同时更新已有文章中的过时描述：[AI 编辑](/practice/notes-ai-editing)补齐取消链路与并发准入，[发布恢复](/practice/notes-release-recovery)补充固定提交和依赖恢复，[本地草稿](/practice/notes-save-lifecycle)补充类型隔离，[H5 会话](/practice/mobile-h5-reliability)补充入口身份来源和失败反馈。

## 笔记应用：Vue 3 与 Express 全栈实践

这一组围绕“用户写下的内容怎样可靠保存”展开，取材于 PC 客户端、共享数据层和独立服务端的实际实现。已实现的行为、设计取舍和后续建议分别说明。

| 文章 | 解决的问题 |
| --- | --- |
| [从编辑器到可靠保存](/practice/notes-architecture) | 共享数据层、页面状态、编辑会话与服务端各自负责什么 |
| [编辑会话与本地草稿](/practice/notes-save-lifecycle) | 保存期间继续输入、切换文档、恢复草稿和账号隔离 |
| [快照同步与并发冲突](/practice/notes-sync-consistency) | 多窗口覆盖、目录移动、旧快照复活已删除内容 |
| [富文本与附件生命周期](/practice/notes-rich-text-assets) | Markdown 粘贴、HTML 存储、自定义节点和私有附件 |
| [AI 编辑的可靠性边界](/practice/notes-ai-editing) | 长任务取消、容量单位、完整输出和预览采纳 |
| [懒加载与发布恢复](/practice/notes-release-recovery) | 旧标签页请求不到页面资源，以及保护编辑内容的恢复流程 |

## 服务端开发

### [PHP 9.2 分漏洞怎么处理](/practice/php-critical-vulnerability-response)

根据 PHP2Shell 官方公告和 Windows/Yaf 项目的静态检查，说明运行时盘点、临时缓解、补丁回补和兼容迁移的边界，并给出验证与回滚顺序。

### [Yaf 多应用项目怎样整理](/practice/yaf-multi-app-architecture)

适合遇到多个入口、多个应用目录、共享模型和公共库的 PHP 项目。重点说明入口、控制器、业务服务、配置和共享代码各自负责什么。

### [事务、幂等和补偿怎么配合](/practice/transactional-business-workflow)

适合订单、库存、支付、预约等不能重复执行的写操作。用白话解释数据库事务、重复请求、外部调用超时和失败恢复。

## 前端与小程序

### [Vue 2 多端项目怎样继续维护](/practice/vue2-multi-terminal-engineering)

对比 PC 后台和移动 H5 的路由、请求层、Vuex 与组件库使用方式，给出不用一次重写的整理方法。

### [微信内 H5 为什么总有“偶现问题”](/practice/mobile-h5-reliability)

说明登录回跳、页面恢复、弱网、重复点击和宿主 SDK 为什么容易互相影响，以及怎样用简单状态机解决。

### [原生小程序怎样组织才不乱](/practice/native-mini-program-architecture)

从 `App`、`Page`、`Component`、`request` 和 `session` 开始，讲清登录、授权、分包、性能和联调。

## 分享经验但不泄露项目

### [私有项目怎么写成公开技术文章](/practice/public-writing-from-private-code)

介绍怎样挑选代码、重写示例、合成数据、扫描构建产物，并区分“项目现状”和“推荐方案”。

## 按问题快速选择

| 你现在遇到的问题 | 建议阅读 |
| --- | --- |
| 保存成功后，请求期间的新输入却丢了 | [编辑会话与本地草稿](/practice/notes-save-lifecycle) |
| 多设备互相覆盖，删除内容又被同步回来 | [快照同步与并发冲突](/practice/notes-sync-consistency) |
| AI 生成后怎样安全采纳并保存 | [AI 编辑的可靠性边界](/practice/notes-ai-editing) |
| 发布后，已打开的页面无法切换路由 | [懒加载与发布恢复](/practice/notes-release-recovery) |
| 一个需求不知道会影响哪些仓库 | [多端系统全景图](/practice/full-stack-system-map) |
| 三个客户端对同一接口判断不一样 | [跨端 API 契约](/practice/cross-client-api-contract) |
| Yaf 控制器和公共库越来越大 | [Yaf 多应用架构](/practice/yaf-multi-app-architecture) |
| PHP 爆出严重漏洞，旧项目又不能直接升级 | [PHP 漏洞处置与升级](/practice/php-critical-vulnerability-response) |
| SQL 在工具里有数据，报表页面却为空 | [SQL 批处理结果契约](/practice/sql-batch-result-contract) |
| 图片加载后滑不动，海报缺图或首屏被定位卡住 | [H5 布局就绪](/practice/h5-layout-readiness) |
| 打印总是多一张空白页 | [浏览器打印分页](/practice/browser-print-pagination) |
| 插件能安装，但宿主设置保存不生效 | [插件宿主兼容](/practice/plugin-host-compatibility) |
| 跳转规则有时效，旧页面仍按旧规则执行 | [动态导航规则](/practice/runtime-navigation-rules) |
| 写操作偶尔重复或状态不一致 | [高一致性业务工作流](/practice/transactional-business-workflow) |
| Vue 2 路由、全局方法和 UI 库混在一起 | [Vue 2 多端工程治理](/practice/vue2-multi-terminal-engineering) |
| H5 登录后回不来或重复弹窗 | [移动 H5 可靠性](/practice/mobile-h5-reliability) |
| 小程序登录、定位和页面生命周期互相打架 | [原生小程序架构](/practice/native-mini-program-architecture) |
| 想升级旧技术栈又担心风险 | [渐进式治理路线](/practice/legacy-modernization-roadmap) |
| 想分享项目经验但担心泄密 | [私有源码公开写作](/practice/public-writing-from-private-code) |

## 每篇文章都遵守的写法

- 先说明问题，不先堆术语；
- 一次只解释一条主流程；
- 代码片段尽量短，并说明它解决什么；
- 同时写成功路径和失败路径；
- 最后给出可以直接复制的检查清单。

如果只准备读一篇，从[一次需求到底要改哪里](/practice/full-stack-system-map)开始。
