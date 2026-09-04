---
title: 高一致性业务工作流：事务、幂等、并发与补偿
description: 用一套可落地的方法组织储值、消费、库存、支付等高风险流程，明确本地事务、外部副作用、状态机、补偿、对账与可观测性边界。
---

# 高一致性业务工作流：事务、幂等、并发与补偿

> 基于真实项目整理，代码已简化脱敏。文中的类名、表名、字段、业务编号、路由和状态均为教学示例，不对应真实系统。

很多 PHP 接口不是“写一行数据”那么简单。一次提交可能同时创建主单、保存明细、扣减余额、记录流水，最后还要通知外部系统。其中任何一步失败，都可能留下“页面说失败，数据库其实成功了”或“主单存在，明细不完整”的问题。

解决它不需要先学一堆术语，先记住三个白话解释：

- **事务**：把多次数据库写入捆成一组，要么全部成功，要么全部撤销；
- **幂等**：同一个请求重复提交多次，也只产生一次业务结果；
- **outbox**：先在本地数据库记一条“待发送任务”，提交后再由后台程序通知外部系统。

## 读完能解决什么

读完本文，你可以为常见的高风险写接口补上这些保护：

- 主单和明细不会只成功一半；
- 用户连点、客户端重试不会生成两张单；
- 两个请求同时扣减资源时不会超扣；
- 数据库提交成功但 HTTP 响应丢失时，可以返回第一次结果；
- 外部接口超时后，不会简单地把“未知”当成“失败”；
- 取消或退款通过反向记录完成，原始流水仍可审计；
- 测试能主动覆盖重复、并发、回滚和崩溃点。

本文使用“提交一张演示单”为例，但方法同样适用于库存、次数、积分、审批和支付结果处理。

## 真实场景

一条典型提交链路会做这些事：

1. 接收客户端生成的请求编号；
2. 检查相同请求是否已经处理；
3. 创建主单；
4. 循环保存多条明细；
5. 扣减某种可用资源；
6. 记录变化流水；
7. 通知另一个系统继续处理。

在真实的旧系统中，经常可以看到正确的基础动作：先开启事务，任何一步保存失败就回滚，全部完成后提交。也能看到通过数据库锁，把同一个来源、同一个请求编号的并发提交串行处理。

这两个做法值得保留，但还需要补齐边界：

- 每个失败分支手写 `rollback()`，未来加分支时容易漏；
- “先查询、再插入”如果没有锁或唯一约束，两个请求仍可能同时通过；
- 事务中发送消息或调用 HTTP，会让数据库锁一直等待网络；
- 外部调用超时，不代表对方没有处理；
- 回滚以后如果仍继续 `commit()`，接口结果可能与真实数据不一致。

先定义四条最重要的业务保证：

| 业务保证 | 最直接的技术保护 |
| --- | --- |
| 同一请求只生成一次结果 | 幂等键 + 数据库唯一约束 |
| 主单、明细、扣减和流水一起成功 | 本地数据库事务 |
| 可用资源不能被扣成负数 | 条件更新或行锁 |
| 外部通知不因进程崩溃而丢失 | outbox + 重试 |

## 一张小流程图

```text
收到请求
   │
   ▼
检查幂等键 ── 已处理 ──▶ 返回第一次结果
   │ 未处理
   ▼
开启事务 → 锁定资源 → 写主单/明细/流水/outbox
   │
   ├── 任一步失败 ──▶ 回滚
   │
   └── 全部成功 ────▶ 提交 → 后台发送外部通知
```

数据库事务只保护本地数据库。短信、消息队列、支付或第三方 HTTP 都不受本地 `rollback()` 控制，所以应放到提交之后。

## 项目中可借鉴的简化代码

下面是一套刻意保持简单的 PHP 示例。

### 1. 用唯一索引守住重复请求

表名和字段均为虚构：

```sql
CREATE UNIQUE INDEX ux_demo_order_request
ON demo_order(source_key, operation_type, request_no);
```

应用代码里的“查询是否存在”用于返回友好结果，唯一索引才是并发情况下的最后防线。同一个幂等键还要保存请求指纹，也就是把真正影响结果的参数做一次稳定摘要：

```php
function canonicalize($value)
{
    if (!is_array($value)) {
        return $value;
    }
    if ($value !== array_values($value)) {
        ksort($value);
    }
    foreach ($value as $key => $item) {
        $value[$key] = canonicalize($item);
    }
    return $value;
}

function makeFingerprint(array $command)
{
    $data = array(
        'account_id' => (string) $command['account_id'],
        'quantity' => (int) $command['quantity'],
        'items' => array_values($command['items']),
    );
    $json = json_encode(canonicalize($data));
    if ($json === false) {
        throw new RuntimeException('Cannot encode request fingerprint');
    }

    return hash('sha256', $json);
}
```

如果请求编号相同、指纹不同，应返回“请求编号已被其他参数使用”，不能复用旧结果。

### 2. 用统一事务方法包住本地写入

```php
<?php
function rollbackOrThrow($db, Throwable $workError)
{
    try {
        $rolledBack = $db->rollback();
    } catch (Throwable $rollbackError) {
        throw new RuntimeException(
            'Rollback failed: ' . $rollbackError->getMessage(),
            0,
            $workError
        );
    }
    if (!$rolledBack) {
        throw new RuntimeException('Rollback failed', 0, $workError);
    }
    throw $workError;
}
```

事务执行器把业务异常与提交异常分开处理：

```php
<?php
class CommitOutcomeUnknown extends RuntimeException {}

class TransactionRunner
{
    private $db;
    public function __construct($db)
    {
        $this->db = $db;
    }
    public function run(callable $work)
    {
        if (!$this->db->transaction()) {
            throw new RuntimeException('Cannot start transaction');
        }
        try {
            $result = $work();
        } catch (Throwable $e) {
            rollbackOrThrow($this->db, $e);
        }

        try {
            $committed = $this->db->commit();
        } catch (Throwable $e) {
            throw new CommitOutcomeUnknown('Commit result is unknown', 0, $e);
        }

        if (!$committed) {
            throw new CommitOutcomeUnknown('Commit result is unknown');
        }

        return $result;
    }
}
```

这里约定：事务中的业务失败就抛异常并回滚；`commit()` 自身报错时，结果可能已经提交，也可能没有提交，因此不能再假装回滚成功。上层应使用原幂等键查询最终结果。

不要在事务闭包中返回一个 `false`，否则管理器可能把它当成正常结果并提交。

### 3. 在同一事务中保存完整业务结果

```php
<?php
function normalizeDemoCommand(array $command)
{
    $quantity = filter_var($command['quantity'] ?? null, FILTER_VALIDATE_INT);
    if ($quantity === false || $quantity <= 0) {
        throw new DomainException('数量必须是正整数');
    }
    if (empty($command['items']) || !is_array($command['items'])) {
        throw new DomainException('明细不能为空');
    }
    $command['quantity'] = $quantity;
    return $command;
}
```

输入通过后，再进入事务编排：

```php
<?php
class SubmitDemoOrder
{
    private $tx, $requests, $accounts, $orders, $ledger, $outbox;
    public function submit(array $command)
    {
        $command = normalizeDemoCommand($command);
        $fingerprint = makeFingerprint($command);
        return $this->tx->run(function () use ($command, $fingerprint) {
            $request = $this->requests->claimOrLoad(
                $command['source_key'], $command['operation_type'],
                $command['request_no'], $fingerprint
            );
            if (!$request->hasSameFingerprint($fingerprint)) {
                throw new DomainException('请求编号与参数不匹配');
            }
            if ($request->isCompleted()) {
                return $request->result();
            }
            $account = $this->accounts->findForUpdate($command['account_id']);
            if ($account->available() < $command['quantity']) {
                throw new DomainException('可用资源不足');
            }
            $order = $this->orders->insertMain($command);
            foreach ($command['items'] as $index => $item) {
                $this->orders->insertDetail($order->id(), $index, $item);
            }
            $this->accounts->decrease($account->id(), $command['quantity']);
            $this->ledger->appendDecrease($order, $command['quantity']);
            $this->outbox->add('demo_order.created', $order->id());
            $result = array('order_no' => $order->number());
            $this->requests->complete($request->id(), $result);
            return $result;
        });
    }
}
```

这段代码最重要的不是类名，而是顺序：

1. 先占用或读取幂等键；
2. 再锁定要修改的资源；
3. 主单、明细、扣减、流水和 outbox 一起写；
4. 全部成功后才提交；
5. 外部通知不在这个事务里发送。

`claimOrLoad()` 必须由数据库锁、原子插入或数据库提供的 upsert 实现，不能只是普通的“先查再插”。

### 4. 提交后发送 outbox

```php
<?php
foreach ($outbox->takePending(50) as $event) {
    try {
        $client->send($event->stableKey(), $event->payload());
        $outbox->markSent($event->id());
    } catch (TemporaryException $e) {
        $outbox->scheduleRetry($event->id());
    }
}
```

`stableKey()` 每次重试都返回同一个外部请求号。后台任务可能重复执行，所以外部接收方也应按这个键去重。

## 逐步实现

### 第一步：把业务保证写成可检查的句子

不要先写代码，先回答：

- 同一请求最多生成几张有效单？
- 哪几张表必须一起成功？
- 资源允许的最小值是多少？
- 外部结果未知时，页面应该显示什么？
- 取消以后是否必须保留原流水？

每句话都要能对应到唯一约束、事务、条件更新或测试。

### 第二步：设计稳定的幂等键

幂等键建议包含业务范围：

```text
(source_key, operation_type, request_no)
```

客户端超时重试时必须复用同一个 `request_no`。

服务端保存：

- 请求指纹；
- 当前处理状态；
- 第一次生成的业务编号；
- 可安全重放的响应摘要。

不要把当前时间、随机追踪号等每次都会变化的字段放进请求指纹。

### 第三步：画出真正的事务边界

事务内放：

- 幂等记录；
- 主单和明细；
- 余额、次数或库存修改；
- 业务流水；
- outbox 记录。

事务外放：

- HTTP 请求；
- 短信、推送和邮件；
- 文件上传或报表生成；
- 大量计算；
- 等待用户操作。

事务越短，锁冲突和死锁通常越少。

### 第四步：让“检查并修改”成为一个原子动作

单行资源扣减可以直接使用条件更新：

```sql
UPDATE demo_account
SET available_units = available_units - :units
WHERE account_id = :account_id
  AND :units > 0
  AND available_units >= :units;
```

服务层先拒绝非正整数，SQL 再用 `:units > 0` 做最后防线。受影响行数为 `0` 就表示参数无效、资源不足或记录不存在。

如果必须读取多行后计算，使用 `SELECT ... FOR UPDATE` 或当前数据库等价的行锁语法。

所有事务按相同顺序锁资源，能减少死锁概率。

### 第五步：正确处理提交结果未知

数据库提交时连接断开，调用方看到的只是异常，数据库可能已经提交。

此时不要换一个新请求编号再做一次。

应使用原幂等键查询：

- 已完成：返回第一次结果；
- 仍处理中：返回 `PROCESSING`；
- 明确不存在：才允许重新执行。

### 第六步：把外部超时当成“未知”

外部 HTTP 超时可能是请求没到，也可能是对方已成功但响应丢了。

稳妥流程是：

```text
超时 → 保持待确认 → 用相同外部请求号查询
                    ├── 成功：更新为成功
                    ├── 明确失败：进入失败或补偿
                    └── 仍未知：退避重试或转人工
```

不要在超时后立即生成新的外部请求号再次扣款或扣资源。

### 第七步：用反向流水补偿，再对账

补偿就是：已经发生的动作不能直接删除时，再记录一个方向相反的动作把结果抵消。

例如原流水是 `DECREASE 3`，补偿流水记录 `INCREASE 3`，并保存原操作编号。

补偿本身也要有唯一键，例如：

```text
(original_operation_id, compensation_type)
```

这样重复点击“撤销”也不会返还两次。定时任务还应查找长时间停留在 `PROCESSING` 或 `PENDING_EXTERNAL` 的记录，使用稳定外部请求号查询事实，再通过正常业务方法推进状态。无法自动判断时转人工，不能直接批量改成成功。

## 常见坑

| 坑 | 后果 | 修正方式 |
| --- | --- | --- |
| 查到不存在后直接插入 | 并发时生成重复数据 | 唯一索引 + 锁或原子插入 |
| 先读余额再无条件覆盖 | 请求互相覆盖 | 条件更新或事务行锁 |
| 每个失败分支手动回滚 | 新增早退后容易漏回滚 | 统一事务方法，失败抛异常 |
| 回滚后仍执行提交 | 返回结果与数据不一致 | 失败立即抛出，停止后续流程 |
| 事务里调用第三方 | 长时间持锁且无法回滚远端 | 提交 outbox 后再调用 |
| 把超时直接标为失败 | 可能重复外部副作用 | 先用相同请求号查询事实 |
| 撤销时删除原流水 | 审计链断裂 | 追加关联原操作的反向流水 |
| 所有异常都自动重试 | 放大业务或编程错误 | 只重试明确的短暂故障 |
| 只靠分布式锁 | 锁失效后仍可能重复 | 数据库唯一性和条件兜底 |

## 测试/检查清单

### 最小测试矩阵

| 场景 | 应断言什么 |
| --- | --- |
| 正常提交 | 主单、明细、扣减、流水全部存在 |
| 明细保存失败 | 所有本地写入全部回滚 |
| 同键重复请求 | 返回同一业务编号，只产生一次效果 |
| 同键不同参数 | 返回幂等冲突，不修改数据 |
| 两个请求同时扣减 | 最终资源不小于允许下限 |
| 提交后响应丢失 | 重试能取回第一次结果 |
| 外部调用超时 | 状态保持待确认，不重复调用新编号 |
| 重复补偿 | 只生成一份反向业务效果 |

### 数据库检查

- [ ] 幂等键有符合业务范围的唯一索引；
- [ ] 主单、明细、资源和流水使用同一个数据库事务；
- [ ] 关键扣减使用条件更新或行锁；
- [ ] 事务内的关键查询不会误走读库；
- [ ] 所有事务按稳定顺序获取锁；
- [ ] 回滚、提交失败和死锁都有明确日志。

### 代码检查

- [ ] 事务闭包正常返回才代表成功；
- [ ] 失败路径抛异常，不在中间随意 `return false`；
- [ ] 控制器不负责拼完整事务流程；
- [ ] 请求指纹只包含影响业务结果的字段；
- [ ] 日志不记录令牌、签名、隐私数据和完整请求体；
- [ ] 外部请求始终使用稳定的幂等键。

### 故障检查

- [ ] 在主单写入后抛异常，确认主单被回滚；
- [ ] 在最后一条明细后抛异常，确认明细和扣减都回滚；
- [ ] 模拟提交成功但响应丢失，确认同键重试安全；
- [ ] 模拟外部已成功但本地超时，确认不会重复副作用；
- [ ] 模拟 outbox 任务执行两次，确认结果仍只有一次；
- [ ] 模拟补偿执行两次，确认资源只返还一次。

### 上线前检查

- [ ] 页面能区分“失败”和“处理中”；
- [ ] 有按业务操作编号查询状态的入口；
- [ ] 能监控处理中记录的数量和最长停留时间；
- [ ] outbox 有重试间隔、最大恢复窗口和人工处理方式；
- [ ] 取消、退款或冲正保留原操作关联；
- [ ] 回滚方案不会删除已有审计流水。

高一致性不是保证系统永远不失败，而是保证失败后仍能回答：**已经写入了什么、能不能安全重试、下一步应该继续还是补偿。**

先把事务、幂等键和数据库约束做好，再逐步加入 outbox、对账和补偿，旧 PHP 系统也能获得清晰、可恢复的业务流程。
