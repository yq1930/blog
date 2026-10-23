---
title: LLM 应用基础：参考 DeepSeek Harness 开发 AI Agent
description: 从模型、工具、会话与执行策略出发，参考 DeepSeek Harness 的真实架构和工具接口，走通一个可取消、可追踪、可验证的 Agent 开发流程。
---

# LLM 应用基础：参考 DeepSeek Harness 开发 AI Agent

开发一个可用的 AI Agent，需要把模型、工具、任务状态、执行权限和失败处理连成闭环。模型负责提出下一步，应用负责验证、执行、记录和决定何时停止。

本文先解释 LLM 的几个基础约束，再参考 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 给出开发顺序和一个最小工具示例。适合想从“能问答”继续做到“能完成任务”的开发者。

**参考快照：2026-10-23，官方仓库提交 [687f282](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)。** 该版本仍处于开发预览，接口可能发生不兼容变化。下文区分官方已有能力与本文建议；本次没有启动 Harness、配置模型密钥或调用收费模型。

## 它本质是在预测下一个 Token

模型把输入文本切成 Token，根据已见过的所有 Token，计算词表中每个候选 Token 出现的概率，挑一个接上去，再循环这个过程。

```text
输入: "今天天气"
  → 计算: 真(0.6) / 很(0.2) / 不(0.1) / ...
  → 选取: "真"
输入: "今天天气真"
  → 计算: 好(0.7) / 不错(0.2) / ...
  → 选取: "好"
```

这个"逐 Token 生成"带来几个直接后果：

- **权重中的知识不是可审计数据库**：模型可以记住知识，但不能仅凭回答证明事实来源、有效期或数据是否最新。
- **生成可能变化**：采样设置、服务实现和运行环境都可能影响结果，不能把自然语言输出当作确定性接口。
- **精确任务要有外部校验**：计数、计算、检索和业务操作可以交给工具，再用确定性代码验证结果。

网页检索、文件读取和数据库访问由应用提供。带检索能力的产品可以取得新资料，但这项能力来自模型外围的系统。

## Token 与上下文窗口

Token 是模型处理文本的单位，具体切分由 tokenizer 决定。汉字、英文、代码和特殊符号的比例会变化，不应用固定字数换算来判断请求是否超限。

| 概念 | 含义 | 实践影响 |
| --- | --- | --- |
| 输入 Token | 指令、历史、工具定义与相关资料 | 需要估算、裁剪和记录实际用量 |
| 输出预算 | 回复以及模型可能使用的推理预算 | 预留容量，具体口径依模型协议 |
| 上下文窗口 | 当前请求可容纳的上下文容量 | 按模型能力检查，不能只看输入字数 |

超限可能被服务端拒绝，也可能由应用先做压缩或裁剪；应用必须说明自己采用了哪种策略。长上下文还需要关注信息位置、相关性和检索质量，不能把整份历史无限追加。

Harness 会在实际请求准备阶段解析模型路由及能力，再组装对应上下文；这说明容量检查应与实际模型绑定，而不是在所有提供方之间共用一个估算常量。[Agent Loop 参考](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/README.md)

## 温度与采样

温度（temperature）等采样参数影响候选 Token 的选择方式。较低温度通常减少随机性，较高温度通常增加多样性，但实际支持范围与行为由提供方和模型决定。

温度为 0 也不等于结果必然正确或端到端完全可复现。结构化提取还要验证 schema，事实问答还要核对来源，精确计算仍应交给工具。接入思考模型时，应先确认其支持的参数，而不是沿用另一模型的温度配置。

## 能力边界：幻觉从哪里来

幻觉（hallucination）指模型生成看起来合理但缺乏依据或与事实不符的内容。模型可能在知识不足、上下文不完整或推断出错时给出自信答案，也可能正确表达不确定性；应用不能只靠语气判断可信度。

常见的不可靠场景：

| 场景 | 为什么不可靠 |
| --- | --- |
| 具体事实、数字、日期 | 知识可能过时或缺少来源，仍需逐项核对 |
| 引用来源、文献 | 未取得真实资料时，可能生成不存在的引文 |
| 严格计数与长列表 | 自然语言生成不能替代明确的计算与约束检查 |
| 自我描述 | 缺少可信运行时信息时，不能靠生成文本确认自身版本 |

应对不是"消灭幻觉"，而是把它当作可管理的风险：让模型在有据可查的范围内回答（这就是 RAG 的动机），要求它给出引用，对关键输出做校验，把"可能出错"纳入产品设计而不是假设它一定对。

## 上层应用的心智模型

理解了上述基础，再去看 Prompt、Agent、RAG，会清晰很多：

- **Prompt 工程**：在固定权重下，用更好的输入引导出更可靠的输出。
- **Agent**：让模型通过"调用工具"绕过它不擅长的部分（计算、检索、查询），把可验证的操作交给确定性代码。
- **RAG**：检索相关资料并提供可核对的上下文，再验证回答与来源的关系。

## 从 Harness 看 Agent 需要哪些模块

DeepSeek Harness 的核心设计是“everything-is-a-plugin”。模型适配器、工具注册、会话日志和默认 Agent 循环都通过插件组成，可以分别替换。Cordis 提供依赖注入与生命周期管理；卸载插件时，相应注册与资源应随所属作用域释放。[官方架构说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md)

初次开发可以先理解这几个职责：

| 模块 | Harness 对应能力 | 开发时要回答的问题 |
| --- | --- | --- |
| 模型适配 | `ctx.llm` | 使用什么协议、模型和能力参数 |
| 指令与工具描述 | `ctx.systemPrompt` | 当前任务应该看见哪些指令和工具 |
| 工具注册与执行 | `ctx.tools` | 参数怎样验证，执行如何拦截 |
| 会话记录 | `ctx.sessions` | 哪些事实能持久化、恢复和追踪 |
| Agent 运行 | `ctx.agents`，默认由 agent-loop 驱动 | 怎样继续、取消和结束任务 |
| 交互界面 | Web 或其他客户端 | 怎样展示动作、结果与审批状态 |

可以把它理解为下面这条闭环：

```text
用户目标 + 当前会话
        ↓
组装指令、相关上下文和可见工具
        ↓
调用模型
  ├─ 返回最终回答 → 结束或交给用户检查
  └─ 请求工具调用
          ↓
     校验参数与执行策略
          ↓
     执行工具 / 返回拒绝或失败
          ↓
     记录结果 → 送入下一次模型请求
```

模型产生的是行动请求，真正的文件、网络或业务操作由运行时执行。调用结果必须与对应调用关联；工具失败也应有明确结果，不能把一串错误丢进终端后让循环继续假装成功。

## 第一步：先定义一个能验收的小任务

建议第一个版本做“只读资料助手”：在允许的资料范围内检索、读取、总结，并指出依据。也可以先用下文的纯计算工具验证调用链，再接检索能力。

先写清四件事：

1. **目标**：例如根据指定资料回答一个问题。
2. **输入范围**：允许读取哪些内容，用户与租户身份从哪里来。
3. **完成证据**：回答要关联检索到的资料，无法取得证据时明确失败或不确定。
4. **停止条件**：达到任务目标、用户取消、预算耗尽或连续无进展。

步骤固定的任务可以直接写成检索与生成流水线。只有中间结果决定后续工具或步骤时，才需要动态循环。

## 第二步：先跑通官方运行方式

官方仓库提供 Web、headless、SDK 等 profile。Profile 是一套插件组合，bundle 是可被组合与覆盖的分发层；它们决定启动了哪些能力。普通业务扩展优先接入已有工具和事件接口，不必重写 Agent 循环。

要复现本文参考版本，可在独立测试目录按源码方式运行。该快照的 Node 要求是 `^22.19.0 || >=24.0.0`，包管理器声明为 `pnpm@11.28.5`；以下命令供读者执行，本次没有运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 687f282e8625c6b8d11ff58211a90524be2e4317
pnpm install
pnpm run build
pnpm dsh web
```

Web UI 默认在本机 `http://127.0.0.1:3080`。按官方说明在 **Settings → Models** 配置提供方，再选择模型和测试工作区，开始会话。自定义模型网关还要核对协议，不能因为 URL 可访问就认定兼容。[运行说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/README.md)、[模型配置](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/guide/providers.md)

官方将当前版本标为开发预览，并明确说明它可以执行模型生成的命令、访问开放给它的文件和凭据。初次实验使用可丢弃工作区与最小必要权限，先阅读 [SAFETY.md](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/SAFETY.md)。

**新加的工具只读，不代表整个 Web profile 只读。** 默认组合还可能包含文件修改和命令执行能力。做只读产品时，需要审查整个插件组合、执行策略和底层权限，而不只是自己写的工具。

## 第三步：开发一个最小工具插件

先完成官方[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/develop/basic/index.md)教程，创建 `scratch-plugin` 及本地加载文件。然后将 `scratch-plugin/src/my-plugin.ts` 替换为下面的示例。

这个工具统计输入文本的非空行数，没有文件或网络访问。它基于已核对的官方 `defineTool` 接口改写，不是另造一套 Harness API：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'line-count-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'count_nonempty_lines',
    description: '统计文本的非空行数；需要精确计数时使用。',
    parameters: {
      text: { type: 'string', required: true, description: '待统计的文本' },
    },
    output: {
      schema: { type: 'integer' },
      render: (_args, count) => [{ type: 'text', text: String(count) }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('CANCELLED')
      if (args.text.length > 20_000) throw new Error('INPUT_TOO_LARGE')
      return args.text.split(/\r?\n/).filter(line => line.trim()).length
    },
  }))
}
```

这里有几项刻意保留的设计：

- `inject` 等待工具服务就绪，再注册工具。
- `parameters` 是 Harness 的字段定义 DSL；框架会据此推断参数类型并验证模型入参。
- `execute` 返回规范值，这里是整数；`output.render` 再把它变成模型可读内容。
- 长度和业务条件仍需自行检查，schema 不能替代所有约束。
- 注册具有插件生命周期，避免热重载后不断叠加同一个工具。

这些契约在[官方工具参考](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/cookbook/adding-a-tool.md)及[工具 schema 源码](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/schema.ts)中均有对应定义。

官方初始教程要求本地加载文件使用插件的绝对路径。配置完成后，从仓库根目录启动：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

验收时明确要求模型调用 `count_nonempty_lines`，输入包含两行正文和一行空白的文本，预期工具结果为 `2`。检查会话里是否真的出现了工具调用及结果，不能只看模型最后猜对数字。[官方工具教程](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/develop/basic/tool.md)

## 第四步：把执行边界放进运行时

业务工具接入数据库、文件或外部系统后，应由运行时提供可信身份，并在执行前检查权限与范围。不要让模型传入一个 `userId` 就取得该用户的数据，也不要把网页或工具结果里的指令视为新授权。

Harness 提供工具执行前策略、最终拒绝 guard 和执行包装等扩展点。工具可见性与最终授权各有职责：工具是否出现在模型面前，不能单独证明某次调用可执行。[工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/tools.md)

建议按副作用设计能力：

| 能力 | 建议的执行边界 |
| --- | --- |
| 检索与读取 | 资源允许范围、身份校验、结果条数及输出上限 |
| 生成待审草稿 | 返回候选内容与来源，保留用户采纳步骤 |
| 写入业务数据 | 精确参数验证、授权、幂等及结果核对 |
| 发信、发布、删除 | 在执行边界取得所需确认，避免重试重复执行 |

取消也必须传到真实工作中。网络调用和子进程需要协作取消与清理；工具定义中声明超时，并不等于运行时可以硬终止任意同进程代码。Harness 的 `timeoutMs` 还依赖相应超时策略插件，不能只填一个字段就认为保护已经完整。

## 第五步：管理会话、上下文和预算

Harness 将会话事实记录到事件日志，再从日志投影模型可见历史。工具调用与结果、已完成消息及失败尝试有明确归属，这有利于恢复、展示和排障。[会话与请求流程](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/architecture.md#session-log)

自己的 Agent 至少应保留任务标识、工具调用标识、执行状态、错误、用量与关键证据。审计关注执行了什么及其依据，不必依赖展示模型内部推理。

日志可恢复会话，不代表业务动作可以重放。发送邮件、扣减库存或提交订单，需要用业务幂等键与持久状态判断是否已经执行，不能在进程恢复后机械重做。

上下文可以按需检索、限制工具输出或做摘要。压缩时要保留用户目标、约束、已完成动作和未解决问题；历史记录里也可能有凭据与个人信息，应先定义保存范围与访问权限。

预算至少分为：

- 单次模型请求的输出预算与超时；
- 一次任务允许的步数、总时长和费用；
- 工具调用并发数与单项资源上限；
- 无进展、重复失败或重复调用时的停止规则。

这些是产品需要配置并验证的策略。Harness 的 `maxParallelToolCalls` 限制同一步中的工具并发，**不是最大任务步数**；不能据此认定循环不会无限运行。其调度器也只让声明安全的调用并行，互斥调用保留顺序。[工具调度源码](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/tool-calls.ts)

## 第六步：验证完成任务的过程

先做少量固定案例，分别验证正常路径和失败边界：

| 场景 | 应观察的证据 |
| --- | --- |
| 可以直接回答 | 不产生无意义工具调用 |
| 必须检索或计算 | 实际调用对应工具，回答引用真实结果 |
| 工具名或参数无效 | 校验失败，有明确反馈，未执行副作用 |
| 没有权限或用户拒绝 | 记录拒绝，任务不会换路径偷偷执行 |
| 工具超时或用户取消 | 停止新增工作，清理资源，保留准确状态 |
| 同一步请求读写同一资源 | 调度遵守依赖与互斥关系 |
| 进程中断后恢复 | 不重复已确认的写操作 |
| 返回内容夹带指令 | 作为不可信资料处理，不扩大权限 |

这些是开发验收建议，不是本文已经执行的 Harness 集成测试。不要仅凭最后一段回答流畅，就判断整个 Agent 正确。

## 按阶段扩展，而不是一次装满能力

建议按下面的顺序交付：

1. **最小闭环**：一个模型、一个可验证工具、一组固定任务。
2. **可靠性**：会话、错误、取消、预算、输出校验与观察记录。
3. **业务接入**：可信身份、受限数据、写操作授权和幂等。
4. **规模化**：再考虑 SDK 接入、多 Agent、后台任务和多实例调度。

接入现有产品时可以选择官方 SDK，但应核对所选 profile 的完整能力与数据流。官方 `sdk-minimal` 文档包含执行权限及会话日志传输说明，“minimal”描述组合规模，不能据名称推断只读、隔离或没有数据外发。[SDK 与最小 profile 说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/guide/python-sdk.md)

继续阅读：[Agent 架构与工具调用](/ai/agent-architecture)、[RAG 检索增强生成](/ai/rag)、[评测与 Guardrails](/ai/evaluation-guardrails)。
