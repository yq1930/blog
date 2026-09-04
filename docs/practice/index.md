---
title: 真实工程实践
description: 从 PHP/Yaf、Vue 2、移动 H5 和微信小程序项目中整理出的简单、可复用开发经验。
---

# 真实工程实践

这一组文章来自一套长期维护的多端系统：一个 PHP/Yaf 服务端，同时支撑 PC 管理后台、移动 H5 和微信小程序。

文章不会按源码目录逐个介绍，而是挑开发中反复出现的问题，用短流程图、简化项目代码和检查清单讲清楚。

> 代码保留了真实项目中的工程模式，但已经删除生产地址、凭据、客户数据、内部业务名称和特殊常量。

## 第一次来，建议这样读

1. [一次需求到底要改哪里](/practice/full-stack-system-map)：先看懂多端系统的完整请求链。
2. [PC、H5 和小程序怎样统一 API](/practice/cross-client-api-contract)：统一成功、失败、登录与重复提交。
3. [旧系统怎样一步步改](/practice/legacy-modernization-roadmap)：不停止业务，也不做高风险推倒重来。

这三篇建立整体视角，后面的文章可以按当前问题直接选择。

## 服务端开发

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
| 一个需求不知道会影响哪些仓库 | [多端系统全景图](/practice/full-stack-system-map) |
| 三个客户端对同一接口判断不一样 | [跨端 API 契约](/practice/cross-client-api-contract) |
| Yaf 控制器和公共库越来越大 | [Yaf 多应用架构](/practice/yaf-multi-app-architecture) |
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
