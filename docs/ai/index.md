---
title: AI 应用开发：从 LLM 基础到 Agent 实战
description: AI 栏目导读：先用大白话解释 Token、上下文、RAG、Agent 等核心概念，再按“我想解决什么问题”推荐阅读顺序，从模型基础一路走到 Agent 开发、评测和安全。
---

# AI 应用开发：从 LLM 基础到 Agent 实战

这个栏目写给想把大语言模型（LLM）用进自己产品的开发者。目标不是追逐最新的模型名字，而是讲清楚那些**换了模型也依然成立**的东西：模型是怎么工作的、它擅长什么不擅长什么、怎样让它稳定地完成任务、怎样避免它闯祸。

::: tip 怎么读这个栏目
- 完全没接触过：先读“核心概念速览”，再读 [LLM 基础](/ai/llm-basics)
- 想做一个能调用工具的助手：按“推荐路线”读到 Agent 开发实战
- 遇到了具体问题：直接看“按问题找文章”
:::

## 核心概念速览

| 概念 | 一句话解释 |
| --- | --- |
| **LLM**（大语言模型） | 一个根据前文预测下一个字（Token）的模型，像能力极强的“输入法联想” |
| **Token** | 模型处理文本的最小单位，计费和长度限制都按它算，不等于字数 |
| **上下文窗口** | 模型一次能“看到”的内容上限，包括指令、历史对话和资料 |
| **Prompt**（提示词） | 你交给模型的任务说明，写得越清楚，模型猜得越少 |
| **幻觉** | 模型说出看起来合理、但没有依据甚至错误的内容 |
| **RAG**（检索增强生成） | 先从你的资料库里检索相关内容，再让模型依据这些内容回答 |
| **工具调用** | 模型不直接做事，而是说“请帮我调用某个函数”，由你的程序执行 |
| **Agent**（智能体） | 让模型循环“思考 → 调用工具 → 看结果 → 再决定下一步”，直到完成任务 |
| **Harness** | 包在模型外面的那层程序：负责工具、权限、状态、上下文和安全边界 |
| **Guardrails**（护栏） | 在模型输入和输出两端加的检查，拦住不合规、不安全的内容 |

## 推荐路线

1. [LLM 基础：Token、上下文、采样与幻觉](/ai/llm-basics)——理解模型怎么生成内容、它的边界在哪里。
2. [Prompt 工程实践](/ai/prompt-engineering)——写出稳定、可解析的提示词。
3. [Agent 架构与工具调用](/ai/agent-architecture)——理解“模型提议、程序执行”的基本循环。
4. [AI Agent 开发实战：参考 DeepSeek Harness](/ai/agent-development)——从一个最小工具开始，做出能检索笔记、预览并可靠保存的 Agent。
5. [LLM 评测与 Guardrails](/ai/evaluation-guardrails) 和 [LLM 应用安全](/ai/security)——让它上线后依然可控。

## 按问题找文章

| 你遇到的问题 | 去读 |
| --- | --- |
| 模型“忘了”前面说过的话，或者对话一长就跑题 | [LLM 基础](/ai/llm-basics) |
| 让模型返回 JSON，偶尔解析失败 | [Prompt 工程实践](/ai/prompt-engineering) |
| 想让模型根据公司文档、个人笔记回答问题 | [RAG 检索增强生成](/ai/rag) |
| 想让模型帮忙查数据、改文件、执行操作 | [Agent 架构与工具调用](/ai/agent-architecture)、[Agent 开发实战](/ai/agent-development) |
| 调用费用太高，或者不知道该选哪个模型 | [LLM 多模型选型与成本控制](/ai/model-selection) |
| 改了提示词，不知道效果是变好还是变坏 | [LLM 评测与 Guardrails](/ai/evaluation-guardrails) |
| 担心用户通过输入“骗”模型做坏事 | [LLM 应用安全](/ai/security) |
| 要处理图片、截图、发票、语音 | [多模态应用入门](/ai/multimodal) |
| 用 AI 写代码，总觉得不太可靠 | [AI 辅助编码工作流](/ai/ai-coding-workflow) |
| 用户不信任或不会用 AI 生成的结果 | [AI 产品设计边界](/ai/product-design) |
| 想了解成熟的 Agent 工具在工程上是怎么设计的 | [ZCode 与 DeepSeek Harness](/ai/zcode-vs-deepseek-harness) |

## 全部文章

**模型与输入**

- [LLM 基础](/ai/llm-basics)：Token、上下文窗口、采样与幻觉
- [Prompt 工程实践](/ai/prompt-engineering)：任务说明、示例与输出格式
- [多模态应用入门](/ai/multimodal)：图片、音频的成本与边界

**应用架构与开发**

- [Agent 开发实战](/ai/agent-development)：Harness 工具、任务状态、笔记检索与保存
- [Agent 架构与工具调用](/ai/agent-architecture)：通用循环、工具契约与失败模式
- [RAG 检索增强生成](/ai/rag)：切分、检索、组装上下文与引用核对
- [LLM 多模型选型与成本控制](/ai/model-selection)：能力取舍、用量与成本
- [LLM 评测与 Guardrails](/ai/evaluation-guardrails)：固定用例、质量判断与运行约束

**工程与产品**

- [ZCode 与 DeepSeek Harness](/ai/zcode-vs-deepseek-harness)：工作台与运行时的源码对比
- [AI 辅助编码工作流](/ai/ai-coding-workflow)：上下文、验证与提交边界
- [LLM 应用安全](/ai/security)：不可信输入、工具权限与数据范围
- [AI 产品设计边界](/ai/product-design)：让用户能理解、检查和采纳结果

如果你正在开发编辑器或知识库，还可以继续读真实工程实践中的 [AI 编辑的可靠性边界](/practice/notes-ai-editing) 和 [编辑会话与本地草稿](/practice/notes-save-lifecycle)。
