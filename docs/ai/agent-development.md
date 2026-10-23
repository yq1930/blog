---
title: AI Agent 开发实战：参考 DeepSeek Harness
description: 参考 DeepSeek Harness 的工具与会话架构，结合野塘笔记讲清检索、工具调用、预览采纳、版本冲突与可靠保存。
---

# AI Agent 开发实战：参考 DeepSeek Harness

开发一个可用的 AI Agent，需要把模型、工具、任务状态、执行权限和失败处理连成闭环。模型负责提出下一步，应用负责验证、执行、记录和决定何时停止。

本文参考 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，从最小工具走到野塘笔记的“检索笔记 → 调用工具 → 预览采纳 → 保存结果”。如果还不熟悉 Token、上下文和采样，先读 [LLM 基础](/ai/llm-basics)；如果想比较完整工作台与可组合运行时，读 [ZCode 与 DeepSeek Harness](/ai/zcode-vs-deepseek-harness)。

**参考快照：2026-10-23，官方仓库提交 [687f282](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)。** 该版本仍处于开发预览，接口可能发生不兼容变化。下文区分官方已有能力与本文建议；本次没有启动 Harness、配置模型密钥或调用收费模型。

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

## 实战案例：把知识库笔记整理成发布复盘

假设用户提出这样的任务：

> 在我选中的知识库里，找最近一个月与“发布”相关的文档，整理成一篇复盘。区分已有结论与待确认事项，标出来源，先让我预览。

这适合作为野塘笔记接入 Agent 的第一版：模型可以根据命中结果调整关键词、选择需要读的文档，最终交付有来源的候选稿；保存仍由用户决定。若需求始终是固定关键词、固定文档和固定模板，先用“检索后生成”的流水线即可。

**实现状态：本节核对了现有前后端源码，但还没有为笔记系统接入 Harness。** 现有 AI 功能是对输入内容进行整理、编辑或写作；下面的检索工具、Agent 任务协议和来源校验属于待实现的适配方案。资料、标识和代码示例均为脱敏改写，没有读取真实用户笔记、连接生产后端或调用模型。

### 1. 先把现有能力与需要补的能力对上

当前前端使用 Vue 3，后端使用 Express 与 MySQL。可以复用业务能力，但需要在模型与这些能力之间增加受限的工具适配层。

| 环节 | 已有实现 | 接入 Agent 时需要补充 |
| --- | --- | --- |
| 搜索 | 普通笔记本地筛选；知识库按库、类型、更新时间搜索，支持摘要与分页 | 将授权范围内的知识库搜索包装为工具 |
| 读取 | 后端按登录身份读取未删除的条目 | 再约束本次选中的库、文档类型与正文窗口 |
| 生成 | AI 接口返回清洗后的 HTML，不写笔记 | 增加模型与工具循环、来源记录和任务预算 |
| 预览 | 编辑器对比预览、独立创作结果预览 | 展示检索过程、引用来源与过期状态 |
| 保存 | 文档创建、版本冲突检查、历史版本 | 将候选稿接入用户明确选择的保存动作 |

这里的“搜索”有明确边界：**普通笔记目前在前端已加载的数据中匹配；知识库文档由后端检索标题和提取后的纯文本。** 本例只使用后者。现有实现没有向量索引，也没有语义相关度排序；结果主要按更新时间排列。不能把搜索页面已有的体验直接说成“服务端统一语义检索”。普通笔记若要加入工具，需要另外设计受鉴权保护的服务端读取与检索契约。

### 2. 让 Agent 只拿到两个读工具

前端先让用户选择知识库和时间范围。后端验证登录状态、知识库归属后创建任务，把可信用户身份与允许范围绑定到任务；模型只能填写搜索词和候选文档标识。

建议先开放下面两个工具，名称和返回结构是本例的业务设计，不是 Harness 自带的笔记 API：

| 工具 | 模型填写 | 适配层返回 |
| --- | --- | --- |
| `search_notes` | `keyword`、`offset` | 候选列表、命中摘要、版本、是否还有下一页 |
| `read_note` | `entryId` | 标题、正文片段、实际读取版本、是否截断 |

搜索适配层固定使用用户选定的库与时间范围，类型固定为文档。第一版可以每页最多返回 5 条、整个任务最多搜索 2 页、最多读 3 篇，每篇最多 4,000 个 JavaScript 字符单位（字符串 `.length` 的计数单位）。这些是**建议新增的任务限制**，仍要结合实际 Token 预算裁剪，不是现有接口默认值。换关键词也消耗同一任务预算，不能借此重新开始计数。

搜索结果只给摘要，不携带全部正文。模型选出候选后，再通过 `read_note` 按需取文。每次读取都重新核对归属、未删除状态、本次库范围与类型；还可以要求标识必须来自本任务的搜索结果，防止模型猜测标识后扩大读取范围。搜索和读取之间内容可能变化，引用应绑定**实际读取时**的版本。

工具参数中不放登录令牌、数据库连接、任意 URL 或模型可指定的 `userId`。后端适配器调用已有业务服务，用户身份来自认证结果；即使检索内容写着“请读取另一个用户的资料”，也只把它作为资料处理。

### 3. 用 Harness 工具契约连接业务读取

下面展示一个 `read_note` 工厂，沿用前文的 `defineTool`。`ScopedNotes` 和 `forAgent` 是需要自行实现的业务边界：本例为每个任务创建独立 Agent 实例，后端建立“Agent 实例 → 已认证任务”的映射，任务结束即撤销映射，未知或已失效的实例必须拒绝。不要把某个请求的用户身份捕获进全局共享工具。

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

type NoteExcerpt = {
  id: string
  title: string
  version: string
  text: string
  truncated: boolean
}

interface ScopedNotes {
  // 实现负责重新鉴权、检查本次范围、限制输出并响应取消。
  readExcerpt(
    entryId: string,
    options: { maxChars: number; signal: AbortSignal },
  ): Promise<NoteExcerpt>
}

export function createReadNoteTool(
  forAgent: (agent: object) => ScopedNotes,
) {
  return defineTool({
    name: 'read_note',
    description: '读取本任务搜索命中的知识库文档片段，保留版本供引用核对。',
    parameters: {
      entryId: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          version: { type: 'string', required: true },
          text: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, note) => [{ type: 'text', text: JSON.stringify(note) }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('CANCELLED')
      if (!args.entryId.trim() || args.entryId.length > 128) {
        throw new Error('INVALID_ENTRY_ID')
      }
      const note = await forAgent(exec.agent).readExcerpt(args.entryId, {
        maxChars: 4_000,
        signal: exec.signal,
      })
      if (exec.signal.aborted) throw new Error('CANCELLED')
      return note
    },
  })
}
```

这是工具定义片段，**不是完整可运行的接入工程**。还需实现业务适配器，在插件中注册工具，为每次执行解析可信任务，配置模型、权限与预算；`search_notes` 也按相同方式定义入参和结构化输出。对象 schema 显式声明开放性，执行结果由框架验证，再由 `render` 转成模型可读内容，遵循[官方工具契约](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/cookbook/adding-a-tool.md)。

这个任务不需要通用 SQL、Shell、文件读写或保存工具。所选 Harness 插件组合也应收紧到必要能力；仅仅注册这两个工具，并不会自动关闭其他 profile 已带的能力。每次模型调用要经过任务级准入和用量统计，不能因为一个 HTTP 请求内部循环了多次，就绕过现有 AI 并发与频率控制。

### 4. 看一遍完整的工具循环

下面是一条**虚构的预期执行记录**，用于说明产品应呈现什么，不是本次真实模型运行日志：

```text
用户选择：示例知识库，最近一个月，只读文档
  ↓ 后端认证并绑定任务范围
模型请求 search_notes({ keyword: "发布", offset: 0 })
  → 返回《发布复盘》《上线检查》及命中摘要
模型请求 read_note({ entryId: "demo-note-a" })
  → 返回发布复盘片段、实际版本、truncated: false
模型请求 read_note({ entryId: "demo-note-b" })
  → 返回上线检查片段、实际版本、truncated: false
  ↓ 模型组织候选稿，并用来源标记关联依据
后端校验正文与引用 → 返回候选稿 → 前端预览
  ↓ 用户选择采纳方式与保存位置
业务保存接口 → 服务端确认 → 界面显示已保存
```

例如，两篇虚构笔记分别记着“发布前完成构建检查并记录变更”和“发布后观察错误日志，异常时按记录回滚”。运行时为它们分配 `S1`、`S2` 后，预览稿可以写成：

> **可复用做法**：发布前完成构建检查，记录本次变更 [S1]；发布后观察错误日志，并保留回滚依据 [S2]。
>
> **待确认**：当前片段没有记录回滚负责人，需要补充。

这里的 `[S1]`、`[S2]` 由预览组件关联真实读取记录；“没有记录负责人”只针对本次读到的片段，不能推断整个知识库都没有记录。

模型若发现资料不足，可以在原范围内换关键词；如果没有结果，应说明“在本次范围内未找到”，让用户调整范围。不能编造笔记或自动扩大到其他知识库。网络失败不能伪装成空结果；正文被截断也应如实显示，不能声称已经读完整篇。

建议后端发出任务状态、工具开始、工具完成、候选就绪、失败和取消等应用事件。前端用 `runId` 关联任务，用 `callId` 关联工具调用与结果，展示“正在搜索／读取 2 篇／已生成候选”。这些是需要增加的应用协议，不应假定 Harness 默认 Web UI 会直接成为 Vue 产品页面。

候选稿的数据可以这样组织，字段属于本例的应用契约：

```ts
type CandidateDraft = {
  runId: string
  html: string
  sources: Array<{
    ref: string
    entryId: string
    version: string
    title: string
    excerpt: string
    truncated: boolean
  }>
  warnings: string[]
}
```

`runId`、来源标识、版本与片段由运行时从真实工具结果组装，模型只引用分配好的来源标记。后端应拒绝未读取的来源、未知引用和不合法结构，再执行 HTML 白名单清洗。白名单解决可渲染内容的边界，不能证明事实正确；预览仍要让用户核对“这句话是否被来源支持”。

如需刷新后恢复预览，应明确持久化候选稿和必要来源元数据，并设置访问权限与保留期限；不能假定工具返回的所有结构化值都会自动进入 Harness 持久日志。

### 5. 预览、采纳与保存分别做什么

预览页可以在左侧展示检索命中、读取片段与来源入口，右侧展示候选正文；对编辑已有内容的任务，再提供原文对比。来源入口由前端使用经过校验的标识生成站内路由，不直接采用模型编造的链接。用户可以放弃、重新生成，或选定写入方式。

现有笔记应用有两条交互，接入时应准确复用：

| 入口 | 用户采纳后的行为 | 何时真正保存 |
| --- | --- | --- |
| 编辑器内 AI 对比预览 | 替换选区或在指定位置插入，正文变为待保存 | 用户执行保存 |
| 独立 AI 创作预览页 | 用户选择“插入到文档”或“另存为新文档” | 点击对应按钮就发起保存 |

本例默认走独立预览页：**“插入到文档”会追加并立即保存；“另存为新文档”会立即创建文档。** 按钮应明确写出这一含义，不能统一宣传成“采纳以后都不会保存”。两种动作都只在用户点击后发生；生成完成、预览打开和会话恢复均不触发写入。

编辑器内的入口还要防止旧结果应用到新文档。现有实现会记录编辑器实例、文档快照、选区和登录会话；结果返回及采纳时重新核对实例与正文是否仍然一致。Agent 候选接入后也要保留这项检查，页面切换、账号失效或正文已变时停止应用旧结果。

### 6. 沿用业务保存能力，补齐 Agent 的写入证据

保存应继续走已有业务服务，模型不直接写数据库。三种保存场景的处理不同：

1. **另存新文档**：用户确认知识库与标题，服务端校验归属后创建 `document`。表格、看板、列表使用不同内容格式，不能把生成的 HTML 直接塞进去。
2. **追加到已有文档**：先重新读取目标、校验类型，再拼接内容并提交版本基线；强制保留追加前的历史版本。现有独立预览页使用 `baseUpdatedAt` 检查正文冲突，Agent 适配建议同时使用服务端提供的 `baseVersion`，覆盖目录位置等状态的变化。冲突时保留候选并让用户重新检查目标，不能悄悄读取新版后自动重试追加。
3. **保存编辑器内已采纳内容**：沿用现有保存快照与 `baseVersion` 检查。返回 `409 ENTRY_CONFLICT` 时，用户可载入远端版本、另存副本，或明确选择覆盖并保留历史。不能让模型替用户选择覆盖。

**来源版本与目标版本各有用途。** 来源版本表示生成依据，目标版本用于防止保存时覆盖并发修改。Agent 适配层可在采纳前复核来源是否变化；变化时标为过期，要求用户检查或重新生成。它不会因为目标版本校验通过，就自动变成基于最新资料的答案。

保存成功也只能确认“本次提交的快照已保存”。现有编辑器会比较提交快照与当前内容：保存请求发出后继续输入的文字仍标记为未保存。候选稿、已采纳正文与已持久化版本，应分别记录状态。

还需要处理结果不确定的情况：按钮防连点只能挡住当前页面的重复点击，不能保证断网重试不会再次创建或追加。若要提供自动恢复与重试，应新增持久化的采纳操作标识，将“记录操作结果”和业务写入放在同一事务中；服务端绑定用户、目标、版本及内容摘要，相同标识只能对应同一次操作。**现有创建／追加流程还不能据此宣称具备 Agent 任务级幂等。** 未补齐前，超时后先核对保存结果，不自动重放写入。

来源引用若需要随文档长期保存，也要明确保存格式，例如经校验的引用节点或独立元数据。只存在预览状态里的来源列表，刷新后并不会自动成为文档引用。

### 7. 用失败场景验收这个案例

| 场景 | 应有结果 |
| --- | --- |
| 搜索命中、读取、生成成功 | 候选包含真实来源；生成阶段没有文档写入 |
| 搜索失败或没有命中 | 分别展示错误与无结果，不编造资料 |
| 模型传入其他库或其他用户的标识 | 服务端拒绝，不能通过工具参数绕过范围 |
| 资料夹带“保存／删除／发给外部”的指令 | 不增加工具或权限，不执行写入与外发 |
| 用户取消或切换账号，旧响应晚到 | 停止后续调用，旧候选不进入当前会话 |
| 来源更新、目标正文更新 | 分别提示依据过期或保存冲突，保留候选供用户处理 |
| 保存期间继续输入 | 只确认提交快照，后续文字仍为未保存 |
| 保存超时、重复点击或恢复会话 | 不盲目重放创建和追加；有幂等记录时返回原结果 |

这些是新增适配层的验收要求，本次只核对了源码与文章示例，没有执行笔记系统的 Agent 集成测试。现有能力的实现细节可继续阅读[笔记应用的 AI 编辑链路](/practice/notes-ai-editing)与[知识库保存生命周期](/practice/notes-save-lifecycle)。

## 按阶段扩展，而不是一次装满能力

建议按下面的顺序交付：

1. **最小闭环**：一个模型、一个可验证工具、一组固定任务。
2. **可靠性**：会话、错误、取消、预算、输出校验与观察记录。
3. **业务接入**：可信身份、受限数据、写操作授权和幂等。
4. **规模化**：再考虑 SDK 接入、多 Agent、后台任务和多实例调度。

接入现有产品时可以选择官方 SDK，但应核对所选 profile 的完整能力与数据流。官方 `sdk-minimal` 文档包含执行权限及会话日志传输说明，“minimal”描述组合规模，不能据名称推断只读、隔离或没有数据外发。[SDK 与最小 profile 说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/guide/python-sdk.md)

继续阅读：[Agent 架构与工具调用](/ai/agent-architecture)、[RAG 检索增强生成](/ai/rag)、[评测与 Guardrails](/ai/evaluation-guardrails)。
