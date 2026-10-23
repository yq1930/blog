---
title: 高一致性业务工作流：事务、幂等、并发与补偿
description: 用“在 ATM 取钱”讲清事务、幂等、条件更新、outbox 和补偿各自守住什么。以“提交一张演示单”为例，给出可以照着改的 PHP 代码，并修复连点生成两张单、并发超扣、回滚后仍提交、提交结果未知时换编号重做、外部超时当失败、撤销时删除原流水等问题。
---

# 高一致性业务工作流：事务、幂等、并发与补偿

::: info 关于示例
基于真实项目整理，代码已简化脱敏。文中的类名、表名、字段、业务编号、路由和状态均为教学示例，不对应真实系统。
:::

很多 PHP 接口不是“写一行数据”那么简单。一次提交可能同时要创建主单、保存明细、扣减余额、记录流水，最后还要通知外部系统。任何一步失败，都可能留下这样的烂摊子：

- 页面提示“失败”，数据库里其实已经成功了；
- 主单存在，明细却只保存了一半；
- 用户连点两下，生成了两张一模一样的单；
- 两个请求同时扣减，余额被扣成了负数；
- 第三方接口超时后重试，用户被扣了两次钱。

::: tip 读完这篇你会
- 用白话说清事务、幂等、outbox、补偿各自解决什么
- 让主单、明细、扣减、流水要么一起成功、要么一起撤销
- 让重复提交和客户端重试只产生一次结果，并发扣减不会超扣
- 正确处理“提交结果未知”和“外部调用超时”
- 用反向流水做撤销，并用测试主动覆盖这些故障
:::

## 1. 原理：在 ATM 上取钱

在 ATM 上取 500 元，银行要同时完成几件事：吐出现金、扣减余额、记一笔流水。这背后正好对应几个核心概念：

| 场景 | 概念 | 白话解释 |
| --- | --- | --- |
| 吐钞、扣款、记流水必须一起完成，不能钱吐了余额没扣 | **事务** | 把多次数据库写入捆成一组，要么全部成功，要么全部撤销 |
| 你按了一次“确认”，网络卡了又按一次，只能取一次钱 | **幂等** | 同一个请求重复提交多次，也只产生一次业务结果 |
| 两张卡同时从一个账户取钱，余额不能变成负数 | **条件更新 / 行锁** | 检查余额和扣减必须是一个不可分割的动作 |
| 取完钱要给你发短信，短信系统暂时故障也不能丢 | **outbox** | 先在本地数据库记一条“待发送任务”，提交后由后台程序发送 |
| 机器显示“交易超时”，不知道扣没扣钱 | **结果未知** | 先查流水确认，而不是马上再取一次 |
| 发现多扣了，银行会“冲正”退回，而不是删掉原记录 | **补偿** | 已经发生的动作不能删除，就再记一笔方向相反的动作抵消它 |

## 2. 一条典型的提交链路

1. 接收客户端生成的请求编号；
2. 检查相同的请求是否已经处理过；
3. 创建主单；
4. 循环保存多条明细；
5. 扣减某种可用资源；
6. 记录变化流水；
7. 通知另一个系统继续处理。

在真实的旧系统里，已经能看到一些正确的基础做法：先开启事务，任何一步保存失败就回滚，全部完成后提交；通过数据库锁，把同一来源、同一请求编号的并发提交排队处理。这些做法值得保留，但还要补齐边界。

先把最重要的四条业务保证写清楚：

| 业务保证 | 最直接的技术保护 |
| --- | --- |
| 同一请求只生成一次结果 | 幂等键 + 数据库唯一约束 |
| 主单、明细、扣减和流水一起成功 | 本地数据库事务 |
| 可用资源不能被扣成负数 | 条件更新或行锁 |
| 外部通知不因进程崩溃而丢失 | outbox + 重试 |

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

**数据库事务只保护本地数据库。** 短信、消息队列、支付或第三方 HTTP 都不受本地 `rollback()` 控制，所以要放到提交之后。

## 3. 坑一：连点两下，生成了两张单

**现象**：网络慢的时候，用户连点了两次提交，或者客户端超时后自动重试，数据库里出现了两张相同的单。

**原因**：代码里写了“先查询这个请求编号是否存在，不存在再插入”。两个请求同时到达，都查到“不存在”，然后都插入了。

**修复**：用**唯一索引**守住重复请求（表名和字段均为虚构）：

```sql
CREATE UNIQUE INDEX ux_demo_order_request
ON demo_order(source_key, operation_type, request_no);
```

应用代码里的“查询是否已存在”只用于返回友好的结果，**唯一索引才是并发情况下的最后防线**。

同一个幂等键还要保存一份**请求指纹**：把真正影响结果的参数做一次稳定的摘要。如果请求编号相同、指纹却不同，说明有人用同一个编号提交了不同的内容，应该返回“请求编号已被其他参数使用”，而不是复用旧结果：

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

`canonicalize` 把关联数组的键排好序，保证同样的内容总能生成同样的摘要。不要把当前时间、随机追踪号这类每次都会变化的字段放进指纹。

**怎么避免再犯**：客户端超时重试时，必须**复用同一个** `request_no`。幂等键建议包含业务范围：`(source_key, operation_type, request_no)`。服务端保存请求指纹、处理状态、第一次生成的业务编号，以及可以安全重放的响应摘要。

## 4. 坑二：每个失败分支手写回滚，迟早会漏

**现象**：新增了一个校验分支，直接 `return false`，忘了回滚；或者回滚之后代码继续往下走，又执行了 `commit()`，接口返回的结果和数据库里的真实数据不一致。

**修复**：用统一的事务方法包住本地写入，**失败一律抛异常**，由事务方法负责回滚：

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

事务执行器把“业务异常”和“提交异常”分开处理：

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

这里的约定是：事务中的业务失败就抛异常并回滚；`commit()` 本身报错时，结果可能已经提交、也可能没有，所以**不能再假装回滚成功**，上层应该用原来的幂等键查询最终结果（见坑五）。

不要在事务闭包里返回一个 `false`，否则管理器可能把它当成正常的结果并提交。

## 5. 把完整的业务结果放进同一个事务

先校验输入：

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

这段代码最重要的不是类名，而是**顺序**：

1. 先占用或读取幂等键；
2. 再锁定要修改的资源；
3. 主单、明细、扣减、流水和 outbox 一起写；
4. 全部成功后才提交；
5. 外部通知不在这个事务里发送。

`claimOrLoad()` 必须由数据库锁、原子插入或数据库提供的 upsert 来实现，不能只是普通的“先查再插”。

事务里放：幂等记录、主单和明细、余额或库存的修改、业务流水、outbox 记录。事务外放：HTTP 请求、短信推送邮件、文件上传和报表生成、大量计算、等待用户操作。**事务越短，锁冲突和死锁通常越少。**

## 6. 坑三：两个请求同时扣减，余额变成了负数

**现象**：同一个账户的两个请求几乎同时到达，都读到“余额 5”，都扣了 3，最后余额是 -1。

**原因**：“读取余额 → 判断够不够 → 写回新余额”之间有空隙，两个请求都钻了进来。

**修复**：单行资源的扣减，直接用**条件更新**，把“检查”和“修改”合成一个原子动作：

```sql
UPDATE demo_account
SET available_units = available_units - :units
WHERE account_id = :account_id
  AND :units > 0
  AND available_units >= :units;
```

服务层先拒绝非正整数，SQL 再用 `:units > 0` 做最后一道防线。**受影响行数为 `0`，就表示参数无效、资源不足或记录不存在**。

如果必须读取多行后再计算，就用 `SELECT ... FOR UPDATE`（或当前数据库的等价行锁语法）。所有事务按**相同的顺序**锁资源，可以减少死锁。更多并发原理见 [并发与限流](/backend/concurrency)。

## 7. 坑四：在事务里调用第三方接口

**现象**：第三方接口偶尔变慢，下单接口跟着变慢，数据库连接被占满；第三方调用成功了，本地事务却回滚了，两边数据对不上。

**原因**：事务里调用网络接口，锁会一直等着网络返回；而且远端的操作不受本地 `rollback()` 控制。

**修复**：事务里只写一条 outbox 记录，提交之后由后台任务发送：

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

`stableKey()` 每次重试都返回**同一个**外部请求号。后台任务可能会重复执行，所以外部接收方也要按这个键去重。

## 8. 坑五：提交结果未知时，换了个新编号重做

**现象**：数据库提交时连接断开了，程序收到一个异常。代码以为失败了，生成一个新的请求编号又提交了一次，结果数据库里出现了两份。

**原因**：提交时连接断开，调用方只看到了异常，**数据库可能已经提交成功了**。

**修复**：不要换新的请求编号重做，而是用**原来的幂等键**去查询：

- 已经完成：返回第一次的结果；
- 仍在处理中：返回 `PROCESSING`；
- 明确不存在：才允许重新执行。

## 9. 坑六：外部调用超时，直接当成失败

**现象**：调用支付渠道超时了，代码把订单标记为“支付失败”，用户重新支付，结果被扣了两次钱。

**原因**：超时可能是请求根本没到，也可能是对方已经处理成功、只是响应在回来的路上丢了。**超时意味着“不知道”，而不是“失败”。**

**修复**：

```text
超时 → 保持待确认 → 用相同外部请求号查询
                    ├── 成功：更新为成功
                    ├── 明确失败：进入失败或补偿
                    └── 仍未知：退避重试或转人工
```

不要在超时后立即生成新的外部请求号，再次扣款或扣资源。页面上要能区分“失败”和“处理中”。

## 10. 坑七：撤销时删除了原来的流水

**现象**：用户撤销订单后，原来的扣减流水被删除了。后来对账时发现资源数量对不上，却找不到任何记录说明发生过什么。

**修复**：用**反向流水**补偿。原流水是 `DECREASE 3`，补偿时追加一条 `INCREASE 3`，并记录原操作的编号。原始流水保留，审计链条完整。

补偿本身也要有唯一键，比如：

```text
(original_operation_id, compensation_type)
```

这样重复点击“撤销”，也不会返还两次。

定时任务还要查找长时间停留在 `PROCESSING` 或 `PENDING_EXTERNAL` 状态的记录，用稳定的外部请求号查询事实，再通过正常的业务方法推进状态。无法自动判断的转人工处理，**不能直接批量改成成功**。

## 11. 常见坑速查

| 坑 | 后果 | 修正方式 |
| --- | --- | --- |
| 查到不存在后直接插入 | 并发时生成重复数据 | 唯一索引 + 锁或原子插入 |
| 先读余额再无条件覆盖 | 请求互相覆盖 | 条件更新或事务行锁 |
| 每个失败分支手动回滚 | 新增提前返回后容易漏回滚 | 统一事务方法，失败抛异常 |
| 回滚后仍执行提交 | 返回结果与数据不一致 | 失败立即抛出，停止后续流程 |
| 事务里调用第三方 | 长时间持锁，且无法回滚远端 | 提交 outbox 后再调用 |
| 把超时直接标为失败 | 可能重复外部副作用 | 先用相同请求号查询事实 |
| 撤销时删除原流水 | 审计链断裂 | 追加关联原操作的反向流水 |
| 所有异常都自动重试 | 放大业务错误或编程错误 | 只重试明确的短暂故障 |
| 只靠分布式锁 | 锁失效后仍可能重复 | 数据库唯一性和条件兜底 |

## 测试与检查清单

**最小测试矩阵**

| 场景 | 应该断言什么 |
| --- | --- |
| 正常提交 | 主单、明细、扣减、流水全部存在 |
| 明细保存失败 | 所有本地写入全部回滚 |
| 同一个键重复请求 | 返回同一个业务编号，只产生一次效果 |
| 同一个键不同参数 | 返回幂等冲突，不修改数据 |
| 两个请求同时扣减 | 最终资源不小于允许的下限 |
| 提交后响应丢失 | 重试能取回第一次的结果 |
| 外部调用超时 | 状态保持待确认，不用新编号重复调用 |
| 重复补偿 | 只产生一份反向的业务效果 |

**数据库**

- [ ] 幂等键有符合业务范围的唯一索引
- [ ] 主单、明细、资源和流水使用同一个数据库事务
- [ ] 关键扣减使用条件更新或行锁
- [ ] 事务内的关键查询不会误走读库
- [ ] 所有事务按稳定的顺序获取锁
- [ ] 回滚、提交失败和死锁都有明确的日志

**代码**

- [ ] 事务闭包正常返回才代表成功，失败路径抛异常
- [ ] 控制器不负责拼装完整的事务流程
- [ ] 请求指纹只包含影响业务结果的字段
- [ ] 日志不记录令牌、签名、隐私数据和完整的请求体
- [ ] 外部请求始终使用稳定的幂等键

**故障演练**

- [ ] 在主单写入后抛异常，确认主单被回滚
- [ ] 在最后一条明细后抛异常，确认明细和扣减都回滚
- [ ] 模拟提交成功但响应丢失，确认同键重试是安全的
- [ ] 模拟外部已成功但本地超时，确认不会重复副作用
- [ ] 模拟 outbox 任务执行两次，确认结果只有一次
- [ ] 模拟补偿执行两次，确认资源只返还一次

**上线前**

- [ ] 页面能区分“失败”和“处理中”
- [ ] 有按业务操作编号查询状态的入口
- [ ] 能监控处理中记录的数量和最长停留时间
- [ ] outbox 有重试间隔、最大恢复窗口和人工处理方式
- [ ] 取消、退款或冲正保留了与原操作的关联
- [ ] 回滚方案不会删除已有的审计流水

高一致性不是保证系统永远不失败，而是保证失败之后仍然能回答：**已经写入了什么？能不能安全重试？下一步应该继续还是补偿？** 先把事务、幂等键和数据库约束做好，再逐步加入 outbox、对账和补偿，旧的 PHP 系统也能拥有清晰、可恢复的业务流程。

## 延伸阅读

- [消息队列与异步任务](/backend/message-queue)：outbox 之后的可靠投递
- [并发与限流](/backend/concurrency)：竞态与条件更新
- [跨端 API 契约](/practice/cross-client-api-contract)：客户端怎样传递幂等键
