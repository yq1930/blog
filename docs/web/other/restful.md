---
title: REST API 设计
description: 用资源、HTTP 方法和一致的响应语义设计易理解、易演进的接口。
---

# REST API 设计

REST 的核心不是把 URL 写成复数，而是把接口当成资源的统一操作面：URL 标识资源，HTTP 方法表达意图，状态码描述结果。这样客户端不必为每个动作记忆一套新规则。

## URL 表示资源，不表示页面动作

```text
/users              用户集合
/users/42           一个用户
/articles/18        一篇文章
/users/42/articles  某个用户的文章集合
```

资源通常使用名词和复数形式，路径层级只表达稳定的归属关系。不要把查询条件硬编码进路径；筛选、排序和分页适合使用查询参数。

```text
GET /articles?authorId=42&status=published&page=2&pageSize=20
```

## HTTP 方法表达对资源的意图

| 动作 | 方法 | 示例 | 说明 |
| --- | --- | --- | --- |
| 查询集合 | `GET` | `GET /articles` | 不应修改服务端状态 |
| 查询单项 | `GET` | `GET /articles/18` | 找不到时返回 `404` |
| 创建 | `POST` | `POST /articles` | 服务端分配资源标识 |
| 完整替换 | `PUT` | `PUT /articles/18` | 客户端提供完整资源表示 |
| 局部更新 | `PATCH` | `PATCH /articles/18` | 只提交发生变化的字段 |
| 删除 | `DELETE` | `DELETE /articles/18` | 成功可返回 `204` |

`GET` 不应用于删除、扣款或发送消息等有副作用的操作。浏览器预取、缓存与链接扫描都可能触发 GET，错误使用会造成难以预测的风险。

## 一个资源的完整示例

```http
POST /articles
Content-Type: application/json

{
  "title": "前端工程化地图",
  "content": "..."
}
```

创建成功后，响应应明确资源位置和数据：

```http
HTTP/1.1 201 Created
Location: /articles/18
Content-Type: application/json

{
  "id": 18,
  "title": "前端工程化地图",
  "status": "draft"
}
```

## 状态码是客户端处理分支的依据

| 状态码 | 含义 | 客户端通常如何处理 |
| --- | --- | --- |
| `200` | 请求成功并返回内容 | 渲染最新数据 |
| `201` | 创建成功 | 使用返回的资源或跳转详情 |
| `204` | 成功但无响应体 | 清理本地状态即可 |
| `400` | 请求格式或参数无效 | 提示可修正的输入问题 |
| `401` | 未认证 | 引导登录或刷新会话 |
| `403` | 已认证但无权限 | 告知无访问权限，不要伪装为 404 |
| `404` | 资源不存在 | 显示资源已删除或链接无效 |
| `409` | 当前状态冲突 | 提示刷新、合并或重新操作 |
| `422` | 语义校验未通过 | 展示具体字段校验信息 |
| `500` | 服务端异常 | 记录请求标识，提供重试或反馈入口 |

错误体保持稳定，比“每个接口各自返回一句文案”更利于前端处理。

```json
{
  "code": "VALIDATION_ERROR",
  "message": "请检查提交内容",
  "fields": {
    "title": "标题不能为空"
  },
  "requestId": "req_xxx"
}
```

## 不是所有动作都要硬塞进 CRUD

“发布文章”“重置密码”这类业务命令有明确副作用。可把它建模为动作子资源或状态更新，并在团队内保持一致。

```text
POST /articles/18/publications
POST /password-reset-requests
```

关键不是形式，而是让 URL、方法、权限和幂等性共同表达真实业务。设计接口时，先写清资源生命周期和失败分支，再确定路径。
