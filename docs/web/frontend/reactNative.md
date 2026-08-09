---
title: React Native iOS 环境排查
description: 按依赖层次定位 iOS 模拟器和 CocoaPods 问题，避免重复执行没有依据的修复命令。
---

# React Native iOS 环境排查

React Native 的 iOS 启动链路跨越 Node、Ruby、CocoaPods、Xcode 和 Simulator。遇到“无法打开模拟器”时，不要先清缓存；先确认错误发生在哪一层。

## 先收集最小事实

在项目根目录执行命令前，确认项目 README 规定的 Node、包管理器、Xcode 和 Ruby/CocoaPods 版本。随后记录第一条真正报错，而不是只看命令最后一行。

```sh
node --version
npm --version
xcodebuild -version
pod --version
```

这些命令只用于确认本机环境。版本不符合项目约定时，先切换到要求的版本，再重新安装依赖。

## 按顺序检查启动链路

| 层次 | 常见症状 | 优先动作 |
| --- | --- | --- |
| JavaScript 依赖 | 找不到 CLI、模块缺失 | 在项目根目录按锁文件安装依赖 |
| Pods | `pod install` 失败、iOS 原生库缺失 | 进入 `ios` 目录查看 Pod 错误 |
| Xcode 工程 | 编译签名、SDK、架构错误 | 使用 `.xcworkspace` 打开工程查看完整日志 |
| Simulator | 没有可用设备、无法启动 | 在 Xcode 中确认运行时和设备已安装 |

## Pods 变更后的常用流程

当 JavaScript 原生依赖发生变化，或 `Podfile.lock` 与依赖状态不一致时，在项目约定的包管理器完成安装后执行：

```sh
cd ios
pod install
cd ..
```

只有在确认 Pods 状态已经损坏、且团队允许重新生成依赖时，才考虑 `pod deintegrate` 后再安装。它会修改 iOS 集成状态，不应作为遇错就执行的通用命令。

## 为什么优先打开 `.xcworkspace`

CocoaPods 集成后，应用工程与 Pods 工程需要由 workspace 一起加载。直接打开 `.xcodeproj` 可能看起来“少了依赖”，从而得到误导性的编译错误。

```sh
open ios/YourApp.xcworkspace
```

将 `YourApp` 替换为实际工程名称。之后在 Xcode 的 Report navigator 中查看完整构建日志，通常比终端最后几十行更容易定位第一处失败。

## 避免无效的环境操作

- 不要把全局安装 CocoaPods 当成所有问题的解法；优先遵循项目的 Bundler 或版本管理约定。
- 不要删除 `node_modules`、Pods 或 DerivedData 作为第一步；先确认缓存与错误有关。
- 不要在未确认团队支持的 Xcode / iOS 版本上升级锁文件。
- 把“命令、首条错误、环境版本、已验证的操作”一并记录，下一次排查会快得多。
