---
title: React Native iOS 环境排查
description: React Native 的 iOS 启动是一条跨 Node、CocoaPods、Xcode、模拟器和 Metro 的流水线。按层找到第一个出错的环节，而不是一上来就删缓存重装，并整理几类最常见的报错和处理顺序。
---

# React Native iOS 环境排查

React Native 项目在 iOS 上跑不起来时，很多人的第一反应是：删 `node_modules`、删 Pods、删 DerivedData、全部重装。运气好能解决，运气不好一个下午就过去了，而且下次遇到还是不知道原因。

更高效的做法是：**先弄清楚启动要经过哪几个环节，找到第一个出错的环节，只处理那一层**。

::: tip 读完这篇你会
- 画出 React Native iOS 应用从源码到模拟器的启动链路
- 根据报错判断问题出在哪一层
- 按“由轻到重”的顺序清理缓存，并留下可复用的排查记录
:::

## 1. 原理：一条五个工位的流水线

```text
① JS 依赖          npm / yarn / pnpm 按锁文件安装 node_modules
      ↓
② 原生依赖         CocoaPods 根据 ios/Podfile 安装原生库（生成 Pods 和 .xcworkspace）
      ↓
③ 原生编译         Xcode 编译 workspace（你的 App + Pods）
      ↓
④ 安装启动         把 App 安装到模拟器并启动
      ↓
⑤ 加载 JS          App 连接 Metro 开发服务器，下载并执行 JS 代码
```

就像工厂流水线，某个工位出了问题，后面所有工位都会跟着报错。排查时要找到**第一个**报错的工位，后面的错误往往只是连锁反应。

## 2. 先收集事实

动手修之前，先记录这些信息：

```sh
node --version
xcodebuild -version
pod --version
xcrun simctl list devices available   # 当前可用的模拟器
```

再对照项目 README 或团队约定的版本（Node、包管理器、Xcode、Ruby/CocoaPods）。版本不一致时，先切换版本，很多问题会直接消失。

最重要的一条：**找到第一条真正的错误信息**。终端最后几行往往是“构建失败”这样的总结，真正的原因在更上面。在 Xcode 里，打开左侧的 Report navigator（报告导航），查看完整的构建日志。

## 3. 按层定位

| 出错的环节 | 典型现象 | 先做什么 |
| --- | --- | --- |
| ① JS 依赖 | 找不到命令、`Cannot find module` | 用项目约定的包管理器，按锁文件重新安装 |
| ② 原生依赖 | `pod install` 报错、找不到某个原生库 | 进入 `ios` 目录看 Pod 的完整错误 |
| ③ 原生编译 | 签名错误、`No such module`、架构错误 | 用 Xcode 打开 `.xcworkspace` 看完整日志 |
| ④ 安装启动 | 没有可用的模拟器、启动后立即闪退 | 检查模拟器和 iOS 运行时是否已安装 |
| ⑤ 加载 JS | 红屏、`Unable to load script`、找不到原生模块 | 检查 Metro 是否在运行、原生依赖是否已链接 |

## 4. 坑一：打开了 `.xcodeproj` 而不是 `.xcworkspace`

**现象**：在 Xcode 里编译，报一大堆 `No such module 'React'` 或者找不到某个第三方库的头文件。

**原因**：CocoaPods 安装后，你的 App 工程和 Pods 工程需要通过 `.xcworkspace` 一起加载。直接打开 `.xcodeproj`，Xcode 只看到了你的 App，看不到依赖。

**修复**：

```sh
open ios/YourApp.xcworkspace   # 把 YourApp 换成实际的工程名
```

## 5. 坑二：装了新的原生库，运行时报“找不到原生模块”

**现象**：安装了一个带原生代码的库（比如相机、存储、地图），JS 里一调用就红屏，提示类似 `TurboModuleRegistry.getEnforcing(...): 'Xxx' could not be found` 或 `Native module cannot be null`。

**原因**：原生库需要经过第 ② 步安装、第 ③ 步编译进 App。只安装 npm 包、然后在 Metro 里刷新 JS，App 里根本没有这段原生代码。

**修复**：

```sh
cd ios
bundle exec pod install   # 项目有 Gemfile 时，用 Bundler 锁定的 CocoaPods 版本
cd ..
npx react-native run-ios  # 重新编译原生工程，而不仅仅是刷新 JS
```

**怎么避免再犯**：记住一个判断标准——**改了 JS 代码，刷新就行；改了原生依赖（新增、升级、删除带原生代码的库），必须重新 `pod install` 并重新编译**。

## 6. 坑三：CocoaPods 版本不一致，`pod install` 报各种奇怪的错

**现象**：同事那里 `pod install` 正常，你这里报错；或者 `Podfile.lock` 里的 CocoaPods 版本和你本机的不一样，每次安装都产生一堆无关的改动。

**原因**：CocoaPods 是一个 Ruby 工具，全局安装的版本因人而异。React Native 的项目模板通常带有 `Gemfile`，用来锁定团队使用的 CocoaPods 版本。

**修复**：使用 Bundler 安装和运行项目锁定的版本：

```sh
bundle install
cd ios && bundle exec pod install
```

不要把“用 `sudo gem install cocoapods` 全局装一个最新版”当作万能解法。

## 7. 坑四：红屏提示无法加载 JS，或者改了代码没生效

**现象**：App 启动后红屏，提示 `No bundle URL present` 或 `Unable to load script`；又或者 JS 改了，刷新后还是旧代码。

**原因**：第 ⑤ 步出了问题：Metro 开发服务器没启动、8081 端口被其他进程占用，或者 Metro 的缓存里还是旧的转换结果。

**修复**：

```sh
lsof -i :8081                    # 看看端口是不是被别的进程占了
npx react-native start --reset-cache   # 清空 Metro 缓存后重新启动
```

## 8. 坑五：没有可用的模拟器

**现象**：`run-ios` 报找不到指定的模拟器，或者 Xcode 的设备列表里是空的。

**原因**：升级 Xcode 后，对应版本的 iOS 运行时（Simulator Runtime）需要单独下载；或者命令里指定的设备名在本机不存在。

**修复**：在 Xcode 的设置（Settings → Components/Platforms）里安装需要的 iOS 运行时，然后用 `xcrun simctl list devices available` 确认设备名，再用 `--simulator "iPhone 16"` 这样的参数指定。

## 9. 清理缓存：由轻到重，一步一验证

确实需要清缓存时，按下面的顺序来，**每做一步就重新试一次**，不要一口气全做完。这样既省时间，也能知道到底是哪一步解决了问题：

| 顺序 | 操作 | 清理的是什么 |
| --- | --- | --- |
| 1 | `npx react-native start --reset-cache` | Metro 的 JS 转换缓存 |
| 2 | `cd ios && bundle exec pod install` | 让原生依赖和 `Podfile.lock` 保持一致 |
| 3 | Xcode → Product → Clean Build Folder | 当前工程的编译产物 |
| 4 | 删除 `~/Library/Developer/Xcode/DerivedData` 下对应的项目目录 | Xcode 的全部中间产物 |
| 5 | 删除 `node_modules` 后按锁文件重新安装 | JS 依赖 |
| 6 | `pod deintegrate` 后重新 `pod install` | 原生依赖的集成状态（会修改工程文件，先和团队确认） |

越往下的操作越耗时，影响也越大。第 6 步会改动 iOS 工程的集成配置，不应作为遇到错误就执行的通用命令。

## 10. 留一份排查记录

每次环境问题解决后，花两分钟记下来，下次（或者同事）遇到时能省下几个小时：

```text
时间：
环境：Node x / Xcode x / CocoaPods x / macOS x
操作：执行了什么命令
第一条错误：（原文）
定位到的层：② 原生依赖
原因：
解决方法：
```

## 检查清单

- [ ] 本机的 Node、Xcode、CocoaPods 版本符合项目约定
- [ ] 找到了第一条真正的错误，而不是最后一行总结
- [ ] 用 `.xcworkspace` 打开工程
- [ ] 原生依赖变化后执行了 `pod install` 并重新编译
- [ ] 使用 Bundler 锁定的 CocoaPods 版本
- [ ] 清理缓存由轻到重、逐步验证
- [ ] 解决后留下了排查记录

## 延伸阅读

- [前端调试技巧](/web/frontend/debugging)：“缩小范围”的通用排查方法
- [环境与配置管理](/engineering/environment)：统一团队的开发环境
- [浏览器兼容性](/web/frontend/compatibility)：另一类“我这里好好的”问题
