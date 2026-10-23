---
title: ZCode 与 DeepSeek Harness：工作台、运行时与 Agent 工程
description: 从官方源码对比 ZCode 与 DeepSeek Harness 的执行链路、会话恢复、插件扩展和权限边界，说明开发业务 Agent 时可以分别借鉴什么。
---

# ZCode 与 DeepSeek Harness：工作台、运行时与 Agent 工程

**研究完整编程工作台，可以重点看 ZCode；研究如何组合和替换 Agent 运行能力，可以重点看 DeepSeek Harness。** 这个判断来自两者的代码组织与扩展边界。两者都包含模型调用、工具、会话和用户界面，不能简单理解为一个只有界面、另一个只有循环。

本文依据官方仓库作静态分析，核对日期为 **2026-10-23**：

- ZCode：提交 [3c5b227](https://github.com/zai-org/ZCode/tree/3c5b227649371507ddc4eb46ac5133afe6db1cab)，根包版本为 `3.16.2`。
- DeepSeek Harness：提交 [687f282](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)，版本为 `0.2.1-rc.2`。

两个版本号属于各自的分发体系，不能据此比较成熟度。本次没有安装、运行这两个项目，也没有执行模型调用；文中不包含速度、成本或任务成功率的实测排名。开发预览、发行功能和具体平台支持范围，以各自快照及后续官方说明为准。

## 先看它们各自怎样组织能力

ZCode 将 Electron 桌面端、Web 客户端、服务端、共享 React UI，以及 Agent CLI 和运行时放在同一个仓库里。阅读它时，可以沿“用户操作如何变成任务，再如何回到界面”追踪完整产品链路。[ZCode 仓库说明](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/README.md#仓库结构)

Harness 用 Cordis 把模型适配、工具注册、会话日志和默认 Agent 循环组织为插件，再通过 profile 与 bundle 组合成 Web、headless、SDK、ACP 等入口。阅读它时，可以重点追踪“一个能力由谁定义、由谁提供、由哪些工具消费”。[Harness 架构说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md)

| 比较角度 | ZCode | DeepSeek Harness |
| --- | --- | --- |
| 源码主线 | 工作台、宿主服务与 Agent 协议协作 | 插件服务、事件与运行组合 |
| 主要入口 | 桌面、Web、TUI 与非交互 CLI | Web、headless、SDK、ACP 等 profile |
| 会话展示 | CLI 权威投影，经协议送到客户端 | 会话事件日志及其投影 |
| 扩展切入点 | 技能、命令、Hooks、MCP、UI Plugin | Cordis 插件、服务提供方、工具与事件 |
| 首要阅读问题 | 状态归谁、跨进程怎样恢复 | 能力怎样组合、替换与卸载 |

表里的区别是阅读重点，不是互斥的功能清单。ZCode 的 Agent 运行时同样开源；Harness 也有自己的 Web 应用和客户端扩展。

## 沿一次任务看 ZCode 的分层

以桌面工作台为例，可以把主链路简化为：

```text
用户输入与界面草稿
  → UI 服务接口
  → 窗口作用域的 Host Process
  → 工作区对应的 zcode app-server --stdio
  → Agent、模型与工具执行
  → CLI 会话投影
  → snapshot / delta
  → 界面呈现
```

UI 不负责启动和管理 Agent 子进程，也不直接解析 stdio 帧。桌面 Host 承担协议连接和进程管理；一个窗口可以承载多个工作区，每个工作区身份对应自己的聊天 CLI 进程。远端工作区通过相应 Remote Host 连接执行环境。[当前集成说明](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/docs/zcode-agent-app-integration.md#进程与服务边界)

这层拆分最有价值的地方是**明确状态所有权**：会话正文、阶段、队列、待处理交互和用量来自 CLI 的权威投影；草稿、滚动、焦点和面板展开属于客户端；置顶、归档和分组等列表组织状态另有宿主索引。把它们都塞进一个前端 store，会让恢复与多端同步越来越难判断。[状态所有权](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/docs/zcode-agent-app-integration.md#状态所有权)

对业务产品的启发是：界面可以乐观展示“正在发送”，但不能因此自己宣布模型已启动、工具已完成或数据已保存。最终状态应从执行方确认后回流。

## ZCode 怎样处理命令与会话恢复

ZCode 当前 V4 协议将写意图和读视图分开：客户端发送 command，执行侧裁决后返回 ACK；会话内容通过 topic 的 snapshot 与 delta 同步。命令包含稳定的 `commandId`，部分操作还要求版本基线；重试复用原标识。客户端按序号连续应用增量，发现缺口时重新订阅并取得可收敛的视图。[当前协议](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/docs/zcode-protocol.md#v4-写路径)、[命令 schema](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/packages/shared/src/zcode-protocol-v4/command.ts)

这里有两项容易误读的保证：

1. **ACK 不等于任务完成。** `accepted` 表示命令被接受；最终展示仍以权威会话投影为准，不能收到 ACK 就显示“文件修改成功”。
2. **恢复记录不等于恢复执行。** 协议文档明确区分输入登记与持久执行队列：CLI 重启后，尚未提升执行的已接收输入会转为丢弃状态，由用户确认是否重发。会话恢复也不会让外部服务或工作区自动回到历史时刻。[协议队列语义](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/docs/zcode-protocol.md#队列语义)、[CLI 会话说明](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/docs/usage/06-sessions.md)

同样，Agent 协议的命令去重不能替代业务事务。模型工具向外部服务创建文档、提交订单或发布内容时，还需要由目标业务提供相应的幂等与结果查询能力。

## Harness 怎样把同一闭环做成可替换能力

Harness 的运行过程可以从插件边界理解：

```text
profile / bundle 决定插件组合
  → 模型适配、工具、会话和执行策略就绪
  → Agent 组装上下文并调用模型
  → 工具请求进入校验与策略管线
  → 执行工具，记录结果
  → 继续模型请求或结束任务
```

Cordis 提供依赖注入、类型化事件与作用域生命周期。工具、模型适配器和会话持久化都可以各自扩展，注册随插件作用域释放。对于需要替换文件访问、模型提供方或工具策略的产品，这种边界值得研究。[插件与能力边界](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md#capability-seams)

它还区分**执行中的实时事件**与**已经提交的会话事实**：流式片段供界面即时显示，完整消息或失败尝试在结算后进入会话日志，再由日志投影模型历史。进程在结算前突然丢失，并不保证每个临时片段都已经持久化。[会话日志与实时流](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md#session-log)

可以借鉴的是“执行事实先有明确归属，再派生界面和模型上下文”。不能进一步推断成“日志恢复后，所有工具动作都能自动重做”。

## 扩展工具和扩展界面是两项工作

两者都支持扩展，但“插件”这个词覆盖的层次不同。

ZCode 的普通插件可以分发技能、自定义命令、Hook 和 MCP 服务。UI Plugin 再增加可交互页面，页面通过 MCP Apps 与宿主通信，业务数据由插件服务管理。当前官方说明将交互面板范围限定在 **Desktop 本地工作区**；Web、手机和远端工作区保留普通工具记录，不能据同一个插件名称认定交互界面处处可用。[插件指南](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/docs/usage/10-plugins.md)、[UI Plugin 能力与平台边界](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/UI_PLUGIN.md)

Harness 的工具定义则把模型入参、规范返回值和模型可读呈现分开，并提供执行前策略、最终拒绝 guard 及执行包装等扩展点。宿主工具与客户端展示也各有契约，给工具加一个返回值，并不等于已经接入业务页面。[工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/tools.md)

例如开发“检索笔记”能力时，可以先把鉴权、范围和结果结构放在业务服务中，再包装成工具。至于检索进度、引用卡片、预览对比和保存按钮，需要在实际客户端里实现。模型工具、页面接口与业务保存接口应有各自清楚的调用方。

## 权限与数据边界，要按实际入口判断

最需要比较的不是弹窗数量，而是**谁执行、谁授权、数据发给谁**。

ZCode 的权限默认值随入口变化。当前非交互 `--prompt` 在没有显式模式时采用 `yolo`；常规工具操作可能跳过提示，交互工具、独立 Plan 状态与 Hook 等仍有自己的规则。`plan` 也不是操作系统只读沙箱，源码中的权限判定不能被替换成“所有运行都逐次批准”的描述。[CLI 权限说明](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/docs/usage/05-permissions.md)、[非交互默认模式源码](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/packages/cli/src/run.ts#L573)

Harness 的权限取决于完整插件组合、执行策略与底层提供方。自己新增一个只读工具，不代表 profile 中原有的文件修改和命令执行能力也被关闭；官方明确将当前版本标为开发预览，不能仅依赖其沙箱或审批机制处理不可信任务。[Harness 安全说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md)

| 需要核对的边界 | 对开发者的实际影响 |
| --- | --- |
| 执行位置 | 本地窗口、Web 服务、SSH 主机与容器可能对应不同账号和文件权限 |
| 模型请求 | 本地运行 UI 和保存会话，不代表模型请求只在本地处理 |
| 插件与 Hook | 安装、连接、启动和执行工具是不同阶段，审批范围不能混为一谈 |
| 会话与诊断日志 | 可能包含代码、提示词和工具结果，需要明确访问与保留范围 |

ZCode 的 `NOTICE.md` 还具体说明了官方模型网关转发、本地日志、远端环境中的配置和凭据同步等行为。这些都说明最终接收方要沿实际请求链判断。其开源 Computer Use 包是不可用占位实现，不能把官方产品展示或其他能力直接算作开源构建的已交付功能。[ZCode 执行、数据与发行边界](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/NOTICE.md)

许可层面，ZCode 第一方代码采用 Apache-2.0，Harness 采用 MIT；依赖、原生组件与资源仍需分别核对对应声明。[ZCode 许可说明](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/NOTICE.md#四第三方许可与版权声明)、[Harness LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/LICENSE)

## 开发笔记 Agent，可以分别借鉴什么

下面是结合前述源码边界作出的工程建议，不是两个官方项目已经替笔记系统实现的功能。

**向 ZCode 借鉴客户端与运行时分工。** 让服务端成为任务状态的权威，前端只维护输入、视图与待确认动作；为任务、工具调用和用户采纳操作分别建立标识。断线重连时取得可恢复状态，不能由前端凭聊天文案猜测任务是否完成。

**向 Harness 借鉴受限能力组合。** 把搜索和读取拆成两个工具，由可信任务上下文提供用户身份、知识库范围和预算；模型只填写必要参数。需要替换模型或检索实现时，尽量保持业务契约稳定，减少客户端跟着调整。

**业务保存继续交给笔记系统。** Agent 返回带来源版本的候选稿，用户预览后选择插入或另存；保存检查目标版本、权限与格式。源资料过期、目标并发更新和保存结果不确定，是三种不同情况。会话恢复与工具循环不能绕过这些业务边界。

```text
选定资料范围
  → search_notes / read_note
  → 带来源的候选稿
  → 用户预览并选择采纳方式
  → 业务保存检查版本，适配层补齐操作去重
  → 确认本次提交结果
```

采纳操作的持久去重属于需要补齐的适配能力，不能由现有会话协议推断业务写入已经幂等。如果目的是给已有 Vue 产品增加这个能力，可以先做受限工具与候选稿适配，再接自己的预览和保存页面；不必一开始复制完整编程工作台。详细案例见 [AI Agent 开发实战：检索笔记、预览采纳与保存](/ai/agent-development#实战案例-把知识库笔记整理成发布复盘)。

## 怎样比较实际效果

源码分析可以说明架构与实现边界，不能回答哪一个在你的任务上更快、更省或更可靠。需要性能或选型结论时，用同一组脱敏任务固定模型、工具权限、资料、版本与预算，再记录以下证据：

| 评估项 | 检查依据 |
| --- | --- |
| 完成质量 | 答案与来源、代码差异、业务约束及实际产物 |
| 执行成本 | 模型请求、工具调用、总耗时与提供方实际用量 |
| 失败处理 | 无结果、工具拒绝、取消、超时与断线恢复 |
| 副作用控制 | 越界请求是否被拒绝、重复请求是否产生重复写入 |
| 客户端一致性 | 迟到事件、重连缺口与已确认状态是否正确收敛 |

不同入口、权限模式和插件组合应分别记录；退出码为 0 或最后一句“已完成”都不能单独证明任务成功。先验证固定任务的完整过程，再决定需要一个完整工作台、一个可组合运行时，还是一条更简单的检索生成流水线。
