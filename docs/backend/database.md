---
title: 数据库索引与事务
description: 用“电话簿”理解索引和最左前缀原则，用 EXPLAIN 验证查询，并修复索引失效、N+1 查询、深分页变慢、应用层判重仍有重复数据、长事务和死锁等常见数据库问题。
---

# 数据库索引与事务

数据库相关的问题，往往是“上线时好好的，数据多了就出事”：

- 列表页随着数据增长越来越慢，加了索引也没用；
- 详情页很快，列表页却要等好几秒；
- 代码里明明先查了“用户名是否存在”，数据库里还是出现了两个同名用户；
- 偶尔出现 `Deadlock found when trying to get lock` 报错。

这篇用两个核心工具来解决这些问题：**索引**让数据找得快，**事务**让一组修改保持一致。示例以 MySQL 为主，原理对其他关系型数据库同样适用。

::: tip 读完这篇你会
- 用“电话簿”理解索引和最左前缀原则
- 用 `EXPLAIN` 看懂一条查询有没有用上索引
- 解决 N+1、深分页、重复数据、长事务和死锁等问题
:::

## 1. 原理：索引就是一本排好序的电话簿

没有索引时，数据库查找数据就像在一堆没排序的名片里找人：只能一张张翻（全表扫描）。索引就是把数据按某个字段**排好序**存一份目录，查找时可以快速定位。

**组合索引**更像一本电话簿：先按姓排序，姓相同的再按名排序。

```text
索引 (last_name, first_name)

王 · 芳
王 · 磊
张 · 伟
张 · 静
```

这本电话簿：

- 找“姓张的人” —— 很快，直接翻到“张”；
- 找“张伟” —— 很快，先找“张”，再在里面找“伟”；
- 找“名叫伟的人” —— **没法用**，因为“伟”分散在各个姓下面，只能从头翻到尾。

这就是**最左前缀原则**：组合索引只能从最左边的字段开始连续使用。设计组合索引时，一般把**等值查询的字段放前面，范围查询和排序的字段放后面**：

```sql
SELECT id, title, created_at
FROM articles
WHERE author_id = ? AND status = ?
ORDER BY created_at DESC
LIMIT 20;

-- 对应的索引：两个等值条件在前，排序字段在后
CREATE INDEX idx_articles_author_status_created
  ON articles (author_id, status, created_at);
```

索引不是越多越好：每个索引都占用空间，每次写入数据都要同步更新所有相关索引。只为真实存在的查询建索引。

## 2. 用 EXPLAIN 验证，而不是猜

在查询前面加上 `EXPLAIN`，数据库会告诉你它打算怎么执行：

```sql
EXPLAIN SELECT id, title FROM articles WHERE author_id = 42 AND status = 'published';
```

重点看这几列：

| 列 | 关注什么 |
| --- | --- |
| `type` | `ALL` 表示全表扫描，通常是问题所在；`ref`、`range`、`const` 较好 |
| `key` | 实际使用的索引，`NULL` 表示没用上索引 |
| `rows` | 预计要扫描的行数，远大于返回的行数说明索引不够好 |
| `Extra` | `Using filesort`（额外排序）、`Using temporary`（临时表）通常意味着可以优化 |

一定要用**接近真实数据量**的数据测试。表里只有一百行时，数据库可能认为全表扫描更快而不用索引，测试结果没有参考价值。

## 3. 坑一：明明建了索引，查询还是很慢

**现象**：`phone` 字段有索引，但按手机号查用户还是全表扫描；按日期查订单也一样。

**原因**：以下写法会让索引失效，因为数据库没法直接在“排好序的目录”里查找：

```sql
-- ❌ 在索引字段上使用函数：目录里存的是原值，不是计算后的值
SELECT * FROM orders WHERE DATE(created_at) = '2026-10-23';
-- ✅ 改成范围查询
SELECT * FROM orders WHERE created_at >= '2026-10-23' AND created_at < '2026-10-24';

-- ❌ 隐式类型转换：phone 是字符串，却用数字去比较
SELECT * FROM users WHERE phone = 13800000000;
-- ✅ 类型一致
SELECT * FROM users WHERE phone = '13800000000';

-- ❌ 以通配符开头的模糊查询：不知道从目录的哪里开始找
SELECT * FROM articles WHERE title LIKE '%缓存%';
-- ✅ 前缀匹配可以用索引；真正的全文搜索交给全文索引或搜索引擎
SELECT * FROM articles WHERE title LIKE '缓存%';
```

其他常见情况：跳过了组合索引最左边的字段；`OR` 连接的条件中有字段没有索引。

**怎么避免再犯**：新增或修改查询时，用 `EXPLAIN` 看一眼 `key` 和 `rows`；开启慢查询日志，定期查看。

## 4. 坑二：N+1 查询，列表越长越慢

**现象**：文章列表页要等好几秒，但单独查一篇文章很快；慢查询日志里，同一条 `SELECT * FROM users WHERE id = ?` 出现了几十上百次。

```js
const articles = await db.query('SELECT * FROM articles LIMIT 20')
for (const article of articles) {
  // ❌ 每篇文章查一次作者：1 次 + 20 次 = 21 次查询
  article.author = await db.query('SELECT * FROM users WHERE id = ?', [article.author_id])
}
```

**原因**：查询次数随列表长度线性增长。每次查询都有网络往返、解析、执行的开销，单次很快，累加起来就很慢。

**修复**：把需要的作者一次性查出来，在内存里组装：

```js
const articles = await db.query('SELECT * FROM articles LIMIT 20')
const authorIds = [...new Set(articles.map((a) => a.author_id))]
const authors = await db.query('SELECT * FROM users WHERE id IN (?)', [authorIds])
const authorById = new Map(authors.map((u) => [u.id, u]))
articles.forEach((a) => {
  a.author = authorById.get(a.author_id)
})
// 无论列表多长，都只有 2 次查询
```

使用 ORM 时，用它提供的预加载功能（`include`、`with`、`preload` 等），本质上做的是同样的事。

## 5. 坑三：越往后翻页越慢

**现象**：后台列表翻到第 5000 页时，一个查询要好几秒。

```sql
SELECT * FROM logs ORDER BY id DESC LIMIT 20 OFFSET 100000;
```

**原因**：`OFFSET 100000` 意味着数据库要先找出前 100020 行，再丢掉前 100000 行。页码越大，丢弃的越多。

**修复**：用“上一页最后一条的位置”来查下一页（游标分页 / keyset 分页）：

```sql
-- 上一页最后一条记录的 id 是 873452
SELECT * FROM logs WHERE id < 873452 ORDER BY id DESC LIMIT 20;
```

它能直接利用索引定位，无论翻到多深都一样快。代价是不能直接跳到“第 5000 页”，适合“下一页”“加载更多”这类交互。

## 6. 坑四：先查了“是否存在”，还是出现了重复数据

**现象**：注册时代码先查询“用户名是否已存在”，不存在才插入。但数据库里还是出现了两个同名用户。

```js
const exists = await db.query('SELECT 1 FROM users WHERE username = ?', [name])
if (!exists.length) {
  await db.query('INSERT INTO users (username) VALUES (?)', [name]) // ❌ 两个请求可能同时走到这里
}
```

**原因**：两个请求同时到达，都查询到“不存在”，然后都插入了。“查询”和“插入”之间存在空隙，并发请求可以同时钻进来。

**修复**：让数据库来保证唯一性。加上唯一约束，插入冲突时处理错误即可：

```sql
ALTER TABLE users ADD UNIQUE KEY uk_users_username (username);
```

```js
try {
  await db.query('INSERT INTO users (username) VALUES (?)', [name])
} catch (err) {
  if (err.code === 'ER_DUP_ENTRY') throw new ConflictError('用户名已被占用')
  throw err
}
```

**怎么避免再犯**：所有“必须唯一”的业务规则（用户名、手机号、订单号、幂等键），都用数据库唯一约束兜底，应用层的检查只用于提前给出友好提示。

## 7. 事务：一组修改，要么都成功，要么都不发生

转账、下单这类操作涉及多次写入，事务保证它们作为一个整体生效：

```text
开始事务
  → 扣减库存（库存不足则失败）
  → 创建订单
  → 记录流水
提交事务（任何一步失败都回滚，前面的修改全部撤销）
```

### 坑五：长事务拖慢整个系统

**现象**：某个接口偶尔很慢，同时其他操作同一批数据的接口也跟着变慢，出现锁等待超时 `Lock wait timeout exceeded`。

**原因**：事务里做了慢操作（调用外部接口、处理文件、循环处理大量数据），事务长时间不提交，它锁住的行一直无法被其他事务修改。

**修复**：事务尽量短，只包含必要的数据库写入；外部调用移到事务外（见 [服务边界与业务编排](/backend/service-design)）；大批量数据分批处理，每批一个事务。

### 坑六：偶发死锁

**现象**：日志里偶尔出现 `Deadlock found when trying to get lock; try restarting transaction`。

**原因**：两个事务以**相反的顺序**锁定资源：事务 A 先锁行 1 再锁行 2，事务 B 先锁行 2 再锁行 1，于是互相等待对方释放。数据库检测到后会回滚其中一个。

**修复**：

- 多行加锁时**按固定顺序**操作（比如按 ID 从小到大）；
- 事务尽量短，减少锁的持有时间；
- 对死锁错误做有限次数的自动重试（被回滚的事务重新执行一次通常就能成功）。

## 排查思路

1. **慢查询**：开启慢查询日志，找到最慢、最频繁的语句，用 `EXPLAIN` 分析；检查是否命中了上面列出的索引失效写法。
2. **列表慢**：数一下一次请求执行了多少条 SQL（ORM 通常可以开启 SQL 日志），排查 N+1。
3. **锁等待和死锁**：MySQL 中执行 `SHOW ENGINE INNODB STATUS`，查看最近一次死锁涉及的两个事务和语句；查询 `information_schema.innodb_trx` 找出长时间未提交的事务。
4. **重复数据**：检查对应字段是否有唯一约束。

## 检查清单

- [ ] 索引根据真实查询设计，遵循最左前缀原则
- [ ] 新增查询用 `EXPLAIN` 验证过，测试数据量接近生产
- [ ] 查询条件中没有对索引字段使用函数或隐式类型转换
- [ ] 列表接口没有 N+1 查询，只查询需要的列
- [ ] 深分页场景使用游标分页
- [ ] 唯一性由数据库唯一约束保证
- [ ] 事务短小，不包含外部调用；多行加锁顺序一致

## 延伸阅读

- [并发与限流](/backend/concurrency)：隔离级别、乐观锁和超卖问题
- [缓存策略与一致性](/backend/cache)：数据库扛不住时的读优化
- [SQL 批处理与结果集](/practice/sql-batch-result-contract)：批量 SQL 的真实踩坑
