---
title: 数据库索引与事务
description: 从查询路径和业务一致性出发使用索引与事务，避免把性能和正确性留给线上猜测。
---

# 数据库索引与事务

数据库设计的两个核心问题是：如何快速找到需要的数据，以及一组相关修改如何保持一致。索引解决前者，事务解决后者；两者都应从真实访问模式出发。

## 索引服务于具体查询

先写出常见查询的筛选、排序和关联条件，再考虑索引。一个索引并非越多越好：它会占空间，也会增加写入维护成本。

```sql
SELECT id, title, created_at
FROM articles
WHERE author_id = ? AND status = ?
ORDER BY created_at DESC
LIMIT 20;
```

这个查询通常会受益于以 `author_id`、`status`、`created_at` 为顺序的组合索引；实际顺序仍需根据选择性、数据库实现和执行计划验证。

## 用执行计划验证假设

查询慢时，不要只凭字段名加索引。检查执行计划、返回行数、扫描方式和排序是否走到了预期路径；同时使用接近生产量级的数据测试。

| 症状 | 优先检查 |
| --- | --- |
| 扫描行数远高于返回行数 | 筛选条件与索引前缀是否匹配 |
| 排序耗时明显 | 排序字段是否能被索引顺序利用 |
| 分页越往后越慢 | 是否使用过大的 offset，能否改为游标分页 |
| 单条查询很快但列表很慢 | 是否存在 N+1 查询或取了过多列 |

## 事务保护一个完整业务动作

转账、扣减库存、创建订单等操作往往涉及多次写入。事务让这些写入在成功时一起提交，发生异常时一起回滚。

```text
开始事务
  → 校验库存仍可用
  → 创建订单
  → 扣减库存
提交事务
```

事务内尽量短：不要等待用户输入、远程接口或长时间计算。并发写入时，还需考虑隔离级别、唯一约束、版本字段和死锁重试策略。

## 常见错误：N+1 查询

列表接口慢，但单条查询明明很快——十有八九是 N+1。先查出 20 篇文章，再循环里逐条查每篇文章的作者：

```js
const articles = await db.query('SELECT * FROM articles LIMIT 20')
for (const a of articles) {
  a.author = await db.query('SELECT * FROM users WHERE id = ?', [a.author_id])
}
```

**症状**：详情页打开飞快，列表页却要等好几秒；慢查询日志里，`SELECT * FROM users WHERE id = ?` 这一条被调了几十上百次；本地测试数据少感觉不到，数据量一上来接口就超时。

**为什么错**：查询次数随列表长度线性增长——20 条文章就是 1 + 20 = 21 次查询，100 条就是 101 次。每次查询都有网络往返和解析开销，它们累加起来远超查询本身。

**正确做法**：一次性把所有作者按 id 集合批量取出，再在内存里组装：

```js
const articles = await db.query('SELECT * FROM articles LIMIT 20')
const authorIds = [...new Set(articles.map(a => a.author_id))]
const authors = await db.query('SELECT * FROM users WHERE id IN (?)', [authorIds])
const authorMap = new Map(authors.map(u => [u.id, u]))
articles.forEach(a => { a.author = authorMap.get(a.author_id) })
```

从 N+1 变成固定的 2 次查询，无论列表多长都不再膨胀。ORM 里用 `include`/`preload`/`with` 关联预加载，本质上做的也是这件事。

## 数据层检查表

- 查询只取当前页面真正需要的列。
- 关键唯一性由数据库约束兜底，不只依赖应用层判断。
- 事务边界与业务承诺一致，失败路径明确。
- 变更索引和表结构前，评估读写影响与回滚方案。

数据库不是“最后一层存储”，它也是业务正确性的重要防线。
