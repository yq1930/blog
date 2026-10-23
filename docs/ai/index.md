---
title: AI 应用开发：从 LLM 基础到 Agent 实战
description: 按模型基础、Agent 开发、架构比较与工程边界组织 AI 文章，包含 DeepSeek Harness 实战及 ZCode 源码对比。
---

# AI 应用开发：从 LLM 基础到 Agent 实战

这个栏目从模型的能力与限制开始，逐步讨论提示词、检索、工具调用、会话管理和产品交互。基础概念与开发实战分开阅读，源码分析注明版本，已实现能力与建议方案分别说明。

## 先读这三篇

1. [LLM 基础：Token、上下文、采样与幻觉](/ai/llm-basics)：理解生成方式与输入输出边界。
2. [AI Agent 开发实战：参考 DeepSeek Harness](/ai/agent-development)：从一个最小工具，走到检索笔记、预览采纳与可靠保存。
3. [ZCode 与 DeepSeek Harness：工作台、运行时与 Agent 工程](/ai/zcode-vs-deepseek-harness)：沿官方源码比较产品分层、会话恢复、扩展及权限边界。

原有的 `/ai/llm-basics` 地址继续作为 LLM 基础文章入口，Agent 开发部分及笔记案例已独立到第二篇。

## 模型与输入

| 文章 | 重点 |
| --- | --- |
| [LLM 基础](/ai/llm-basics) | Token、上下文窗口、采样与幻觉 |
| [Prompt 工程实践](/ai/prompt-engineering) | 输入约束、示例与输出格式 |
| [多模态应用入门](/ai/multimodal) | 图片、音频与文本的处理边界 |

## 应用架构与开发

| 文章 | 重点 |
| --- | --- |
| [Agent 开发实战](/ai/agent-development) | Harness 工具、任务状态、笔记检索与保存 |
| [Agent 架构与工具调用](/ai/agent-architecture) | 通用循环、工具契约与失败模式 |
| [RAG 检索增强生成](/ai/rag) | 检索资料、组装上下文与核对来源 |
| [LLM 多模型选型与成本控制](/ai/model-selection) | 能力取舍、用量与调用成本 |
| [LLM 评测与 Guardrails](/ai/evaluation-guardrails) | 固定案例、质量判断与运行约束 |

## 工程与产品

| 文章 | 重点 |
| --- | --- |
| [ZCode 与 DeepSeek Harness](/ai/zcode-vs-deepseek-harness) | 工作台与运行时的源码分析 |
| [AI 辅助编码工作流](/ai/ai-coding-workflow) | 开发过程中的上下文与验证 |
| [LLM 应用安全](/ai/security) | 工具权限、不可信输入与数据范围 |
| [AI 产品设计边界](/ai/product-design) | 让用户理解、检查并采纳结果 |

如果正在开发编辑器或知识库，也可以继续读真实工程实践中的 [AI 编辑的可靠性边界](/practice/notes-ai-editing)与[编辑会话和本地草稿](/practice/notes-save-lifecycle)。
