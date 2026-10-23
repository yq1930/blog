---
title: 如何学习 PHP：从 0 到 1 做一个项目
description: 学了 PHP 语法却不知道怎么做项目？先讲清 PHP“每个请求从零开始”的运行原理和分阶段学习路线，再从空目录做一个迷你进销存 API，把路由、PDO、事务、错误处理、测试和部署走一遍，并整理白屏、== 比较、SQL 注入、超卖、浮点金额、时区、中文截断、Session 锁等新手最常踩的坑。
---

# 如何学习 PHP：从 0 到 1 做一个项目

很多人学 PHP 是这样卡住的：跟着教程写出了 `echo 'Hello World'`，学完了变量、数组和函数，然后——

- 不知道一个真正的项目该怎么分目录，代码该写在哪里；
- 页面一片空白，什么错误都看不到；
- 本地好好的，一上线就出问题，或者改了代码迟迟不生效；
- 时间差了 8 小时、中文变成乱码、金额少了 1 分钱，不知道从哪里查起。

语法只是工具。真正的门槛是：**知道一次请求从进来到返回经过了哪些步骤，每一步该由谁负责，哪里容易出错。** 这篇文章先讲清 PHP 的运行原理和学习路线，再从一个空目录开始，一步步做出一个能运行、能测试、能部署的小项目，并把新手最常踩的坑放在它们最容易出现的地方讲。

::: tip 读完这篇你会
- 理解 PHP“每个请求从零开始”的运行方式，以及它对写代码的影响
- 按五个阶段安排学习，知道每个阶段学到什么程度就够了
- 从空目录搭出一个分层清晰的 API 项目：路由、数据库、事务、错误处理、测试、部署
- 用预处理语句和条件更新，写出不怕 SQL 注入、不会超卖的数据代码
- 避开 `==` 比较、浮点金额、时区、中文截断、Session 锁等十几个常见的坑
:::

::: info 关于本文的代码
示例项目是为本文从零编写的，已在 PHP 8.4.7 上实际运行：每个接口都用 curl 调用过，2 个 PHPUnit 测试全部通过，文中注释里的“输出”都是实测结果（2026-10-23）。第 6 节的对照来自对一个真实的 PHP 多端业务系统的只读梳理，只记录目录结构和通用做法，不包含它的代码、配置和数据。
:::

## 1. 原理：PHP 是怎么跑起来的

学语法之前，最值得先弄懂的是 PHP 的运行方式。最常见的部署组合是 Nginx + PHP-FPM，一次请求是这样处理的：

```text
浏览器：GET /products
   │
   ▼
Nginx：静态文件直接返回，
       其余请求交给 PHP-FPM
   │
   ▼
PHP-FPM：派一个空闲的进程处理
   │
   ▼
执行 public/index.php：
 ① 加载代码（OPcache 有缓存）
 ② 读取配置、连接数据库
 ③ 路由 → 控制器 → 业务 → 数据库
 ④ 输出 JSON
 ⑤ 释放全部变量，等下一个请求
```

其中 OPcache 缓存的是代码的编译结果，有了它，每个请求就不用重新编译一遍 PHP 代码。

可以把 PHP-FPM 想成一家酒店：

- **每个请求都住进一间刚打扫好的客房。** 上一位客人留下的东西（变量、对象），下一位客人永远看不到；
- **退房就清空房间。** 一个请求里出了错、占了很多内存，请求结束后全部回收，不会拖累下一个请求；
- **房间数量有限**（进程池的大小，配置项 `pm.max_children`）。有客人赖着不走（慢请求），能接待的客人就少一位；房间全满时，新来的客人只能在大堂排队。

Node.js、Java 这类常驻进程的服务更像合租公寓：大家共用一个客厅（进程内存），谁在客厅里放了东西，后来的人都能看到。

这个区别直接影响你写代码的方式：

| 你会遇到的情况 | 原因 | 正确的做法 |
| --- | --- | --- |
| 上一个请求给全局变量赋了值，下一个请求读不到 | 请求结束，变量全部释放 | 跨请求的数据放 Session、数据库或 Redis |
| 一个接口很慢，整个网站都跟着变慢 | 慢请求占着进程，进程池被占满 | 外部调用设置超时，耗时的工作放进后台任务 |
| 线上改了代码，迟迟不生效 | OPcache 还在用旧的编译结果 | 部署后重载 PHP-FPM（见第 4 节） |

Swoole、FrankenPHP 的 worker 模式等常驻内存的运行方式会改变上面的规则。建议先把这种传统模式学扎实，再去了解它们。

## 2. 学习路线：分五个阶段

学 PHP 最常见的两个误区：一是一直看语法，迟迟不动手做东西；二是一上来就学框架，只会照着文档拼凑，出了问题不知道框架背后做了什么。更好的顺序是：**先手写一个小项目，再学框架。**

| 阶段 | 学什么 | 学到什么程度就够了 | 动手练习 |
| --- | --- | --- | --- |
| 0. 环境 | 安装 PHP 和 Composer，认识 `php.ini` | 说得出 `php -v`、`php -m`、`php --ini` 分别在查什么 | 用 `php -S` 跑一个显示当前时间的页面 |
| 1. 语法 | 变量和类型、数组、字符串、函数、类、命名空间、异常 | 能读懂一个 200 行左右的类 | 写一个计算购物车总价的函数，金额用整数“分” |
| 2. Web 基础 | HTTP 请求和响应、JSON、Cookie 和 Session | 讲得清一次请求从浏览器到 PHP 再返回的过程 | 写一个返回 JSON 的留言接口 |
| 3. 数据库 | SQL 基础、PDO 预处理、事务、索引 | 不写一行拼接的 SQL，知道什么时候需要事务 | 把留言存进 SQLite |
| 4. 工程化 | Composer 自动加载、分层、配置、日志、测试 | 能从空目录搭出第 3 节的项目 | 跟着第 3 节做一遍，再自己加一个“盘点”接口 |
| 5. 框架 | Laravel、Symfony、ThinkPHP 等，任选一个 | 说得出框架替你做了哪几件事 | 用框架把第 3 节的项目重写一遍，对比两份代码 |

**四个让你学得更快的习惯：**

1. **每个知识点都写成能运行的小程序。** 看十遍不如跑一遍，一个临时文件或一条 `php -r` 命令就够了；
2. **查官方手册的函数页面时，重点看“返回值”和“更新日志”。** 很多坑就藏在“失败时返回 `false`”和“从 8.0 开始行为改变”里；
3. **把错误信息读完。** PHP 的报错会写明哪个文件、哪一行、什么原因，大部分问题看报错就能定位；
4. **读别人的项目时，从入口文件开始，顺着一次请求往下读**，而不是按目录一个个打开。

**版本怎么选：** 新项目直接用官方仍在主动维护的版本。写作时（2026 年 10 月），PHP 8.4 和 8.5 处于主动支持期；8.2、8.3 只提供安全修复，其中 8.2 将在 2026 年底停止维护；7.x 早已停止维护。以官方的 [Supported Versions](https://www.php.net/supported-versions.php) 页面为准。维护老项目时，先用 `php -v` 确认它跑在哪个版本上——同一行代码在 7.x 和 8.x 上的结果可能不同（见第 5 节的 `==` 比较）。

### 语法速览：和其他语言不一样的地方

学过 JavaScript 或 Java 的话，下面这段代码基本涵盖了 PHP 和它们不一样的地方：

```php
<?php

declare(strict_types=1);                         // 严格类型：参数类型不对就报错，不会悄悄转换

$name = '水杯';                                   // 变量以 $ 开头
$price = 1999;                                    // 金额用整数“分”保存
$product = ['sku' => 'CUP-001', 'stock' => 5];    // 数组：既能当列表，也能当键值对

echo "{$name} 的库存是 {$product['stock']}\n";    // 双引号里可以直接写变量
echo '单引号里不解析 $name' . "\n";                // 字符串拼接用 .，不是 +

function formatPrice(int $cents): string          // 参数和返回值都可以声明类型
{
    return number_format($cents / 100, 2) . ' 元';
}

$discount = $product['discount'] ?? 0;            // 键不存在时取默认值，不会报警告
$label = match (true) {                           // match 是严格比较，比 switch 安全
    $product['stock'] === 0 => '缺货',
    $product['stock'] < 10 => '库存紧张',
    default => '有货',
};

echo formatPrice($price), ' ', $label, "\n";

// 输出：
// 水杯 的库存是 5
// 单引号里不解析 $name
// 19.99 元 库存紧张
```

两点特别提醒：

- PHP 只有一种数组，它其实是**有序的字典**：既能用 0、1、2 当下标，也能用字符串当键。第 5 节“列表变成对象”的坑就是这么来的；
- `declare(strict_types=1)` 只对当前文件生效，管的是函数参数和返回值的类型转换，**不影响 `==` 的比较规则**。

## 3. 从 0 到 1：做一个迷你进销存 API

下面从一个空目录开始，做一个“迷你进销存”接口：管理商品，记录入库和出库，并且保证库存不会被卖成负数。它很小，但包含了后端项目最核心的几件事：路由、参数校验、数据库、事务、错误处理和测试。

### 3.1 先想清楚要做什么

| 接口 | 作用 | 可能的失败 |
| --- | --- | --- |
| `GET /products` | 商品列表 | — |
| `POST /products` | 新建商品 | SKU 重复、参数不合法 |
| `POST /products/{id}/stock-in` | 入库 | 商品不存在、参数不合法 |
| `POST /products/{id}/stock-out` | 出库 | 商品不存在、库存不足、参数不合法 |
| `GET /products/{id}/movements` | 查看库存流水 | 商品不存在 |

所有接口都返回同一种结构，调用方只看 `code` 就能判断成功还是失败：

```text
成功：{"code":"OK","data":{...},"requestId":"..."}
失败：{"code":"INSUFFICIENT_STOCK","message":"库存不足","requestId":"..."}
```

`requestId` 是每个请求唯一的编号，用户反馈问题时报出它，就能在日志里找到这次请求。**先想清楚会怎么失败，比先写成功的代码更重要**——表里的每一种失败，后面都会对应一个错误码和 HTTP 状态码。

### 3.2 搭目录：一个入口，四层分工

第一步只要能跑起来就好：

```bash
mkdir -p mini-inventory/public && cd mini-inventory
echo '<?php echo json_encode(["hello" => "PHP"]);' > public/index.php
php -S 127.0.0.1:8000 -t public
```

浏览器打开 `http://127.0.0.1:8000`，看到 `{"hello":"PHP"}`，说明环境没问题。接下来把它长成这样：

```text
mini-inventory/
├── composer.json            依赖和自动加载配置
├── config/config.php        配置：只从环境变量读取
├── database/schema.sql      建表语句
├── public/index.php         唯一入口，Web 服务器只暴露 public 目录
├── src/
│   ├── Http/                路由、读取 JSON、参数校验
│   ├── Controller/          取参数 → 调用 Service → 交回结果
│   ├── Service/             业务规则和事务
│   ├── Repository/          只写 SQL
│   ├── Database.php         创建数据库连接
│   └── BusinessException.php
├── tests/                   自动化测试
└── var/                     SQLite 数据库文件，不提交到 Git
```

为什么这样分层，见 [后端服务如何组织](/backend/overview)。这里只强调一点：**所有请求都先经过 `public/index.php`**，时区、错误处理、请求 ID 这些公共逻辑只写一次；Web 服务器的根目录只指向 `public`，`config` 和 `src` 里的代码和配置就不会被直接下载。

`composer.json` 声明了依赖和自动加载规则：

```json
{
    "name": "demo/mini-inventory",
    "description": "从 0 到 1 学 PHP 的示例项目：迷你进销存 API",
    "type": "project",
    "require": {
        "php": ">=8.3",
        "ext-mbstring": "*",
        "ext-pdo": "*"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    }
}
```

`"App\\": "src/"` 的意思是：类 `App\Service\StockService` 会自动从 `src/Service/StockService.php` 加载，不用再写一堆 `require`。写好后执行一次 `composer dump-autoload`，生成 `vendor/autoload.php`。

### 3.3 第一步：设计数据表

```sql
-- 商品：库存直接存在商品表上，CHECK 约束兜底，库存永远不会变成负数
CREATE TABLE products (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    sku   TEXT    NOT NULL UNIQUE,
    name  TEXT    NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

-- 库存流水：每一次入库、出库都留一条记录，方便对账
CREATE TABLE stock_movements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products (id),
    change_qty INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE INDEX idx_movements_product ON stock_movements (product_id, id);
```

- 每一次入库、出库都写一条流水，对账时能查清每一件货的来龙去脉；
- `UNIQUE` 和 `CHECK (stock >= 0)` 是数据库层面的最后一道防线：就算代码写错了，数据库也不会接受重复的 SKU 和负数库存。（MySQL 从 8.0.16 开始才真正执行 `CHECK` 约束。）

创建数据库文件：

```bash
mkdir -p var
php -r '$pdo = new PDO("sqlite:var/app.sqlite"); $pdo->exec(file_get_contents("database/schema.sql"));'
```

这里用 SQLite，是因为它就是一个文件，不用安装数据库服务，学习时最省事。换成 MySQL 时，`AUTOINCREMENT` 改成 `AUTO_INCREMENT`，`TEXT` 改成合适长度的 `VARCHAR`，表的字符集用 `utf8mb4`。

### 3.4 第二步：连接数据库

配置只从环境变量读取。本地什么都不设置，就用 SQLite 文件；线上通过环境变量换成 MySQL，**代码一行不用改，数据库口令也不会出现在代码仓库里**：

```php
<?php

declare(strict_types=1);

// 配置只从环境变量读取；没设置时，使用适合本地学习的默认值
return [
    'timezone' => getenv('APP_TIMEZONE') ?: 'Asia/Shanghai',
    'db' => [
        'dsn' => getenv('DB_DSN') ?: 'sqlite:' . dirname(__DIR__) . '/var/app.sqlite',
        'user' => getenv('DB_USER') ?: null,
        'password' => getenv('DB_PASSWORD') ?: null,
    ],
];
```

```php
<?php

declare(strict_types=1);

namespace App;

use PDO;

final class Database
{
    /** @param array{dsn: string, user: ?string, password: ?string} $config */
    public static function connect(array $config): PDO
    {
        $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,       // SQL 出错直接抛异常
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,  // 查询结果是关联数组
        ]);

        if (str_starts_with($config['dsn'], 'mysql:')) {
            $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false); // 用 MySQL 原生预处理
        }
        if (str_starts_with($config['dsn'], 'sqlite:')) {
            $pdo->exec('PRAGMA foreign_keys = ON');                // SQLite 默认不检查外键
        }

        return $pdo;
    }
}
```

- `ERRMODE_EXCEPTION`：SQL 出错时抛出异常。PHP 8 起默认就是这样，写出来是为了让读代码的人一眼看清；在旧版本里不设置的话，很多错误只会悄悄返回 `false`；
- 连接 MySQL 时关闭“模拟预处理”，让数据库自己处理参数；DSN 里写上字符集，例如 `mysql:host=127.0.0.1;dbname=inventory;charset=utf8mb4`，否则中文可能乱码；
- SQLite 默认不检查外键，要手动打开。

### 3.5 第三步：Repository 只管 SQL

Repository 只负责读写数据库，不做任何业务判断：

```php
<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

/** 只负责读写数据库，不做业务判断 */
final class ProductRepository
{
    public function __construct(private PDO $pdo) {}

    public function all(int $limit = 100): array
    {
        $stmt = $this->pdo->prepare('SELECT id, sku, name, stock FROM products ORDER BY id LIMIT ?');
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, sku, name, stock FROM products WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->fetch() ?: null;
    }

    public function create(string $sku, string $name): int
    {
        $stmt = $this->pdo->prepare('INSERT INTO products (sku, name, stock) VALUES (?, ?, 0)');
        $stmt->execute([$sku, $name]);

        return (int) $this->pdo->lastInsertId();
    }

    public function increaseStock(int $id, int $quantity): bool
    {
        $stmt = $this->pdo->prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        $stmt->execute([$quantity, $id]);

        return $stmt->rowCount() === 1;
    }

    /** 库存够才扣减，判断和扣减在同一条 SQL 里完成；返回 false 表示没扣成 */
    public function decreaseStock(int $id, int $quantity): bool
    {
        $stmt = $this->pdo->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
        $stmt->execute([$quantity, $id, $quantity]);

        return $stmt->rowCount() === 1;
    }

    public function addMovement(int $productId, int $change, string $reason): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO stock_movements (product_id, change_qty, reason, created_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$productId, $change, $reason, date('Y-m-d H:i:s')]);
    }

    public function movements(int $productId, int $limit = 50): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, change_qty, reason, created_at FROM stock_movements
             WHERE product_id = ? ORDER BY id DESC LIMIT ?'
        );
        $stmt->bindValue(1, $productId, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
```

- 所有 SQL 都用 `?` 占位，值通过 `execute([...])` 单独传进去；
- `execute([...])` 传入的值一律当作字符串处理。`LIMIT` 这种必须是整数的位置，用 `bindValue(..., PDO::PARAM_INT)` 明确告诉驱动类型；
- `decreaseStock` 把“库存够不够”和“扣减”写在同一条 SQL 里，这是防超卖的关键，下一步细说。

::: warning 踩坑：用户输入直接拼进 SQL
**现象**：按 SKU 查询商品的接口，有人传入 `x' OR '1'='1`，结果返回了所有商品。

**原因**：用户输入被直接拼进了 SQL，输入里的单引号改变了 SQL 的结构，`OR '1'='1'` 让条件永远成立：

```php
// 危险：输入里的单引号把字符串提前结束了
$sql = "SELECT * FROM products WHERE sku = '" . $_GET['sku'] . "'";
```

**修复**：用预处理语句，SQL 的结构和数据分开交给数据库，输入再怎么写，也只是一个普通的值。实测同样的输入，拼接写法查出了表里全部 2 行，预处理写法查出 0 行：

```php
$stmt = $pdo->prepare('SELECT * FROM products WHERE sku = ?');
$stmt->execute([$_GET['sku']]);
```

`IN (...)` 查询按元素个数生成占位符：

```php
$placeholders = implode(',', array_fill(0, count($skus), '?')); // 例如 "?,?,?"
$stmt = $pdo->prepare("SELECT * FROM products WHERE sku IN ($placeholders)");
$stmt->execute(array_values($skus));
```

**怎么避免再犯**：代码评审时，重点看 SQL 字符串里有没有 `.` 拼接或 `"...$变量..."` 插值；表名、排序字段这类不能用占位符的地方，只允许从白名单里取值，例如 `in_array($sort, ['id', 'stock'], true)`。
:::

### 3.6 第四步：Service 写业务规则

先定义“业务失败”。参数不对、商品不存在、库存不足，都是**预期之内**的失败，用一个带错误码的异常表达：

```php
<?php

declare(strict_types=1);

namespace App;

use RuntimeException;

/** 业务上“预期之内”的失败：参数不对、商品不存在、库存不足……都带一个错误码 */
final class BusinessException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
```

业务规则全部写在 Service 里：

```php
<?php

declare(strict_types=1);

namespace App\Service;

use App\BusinessException;
use App\Repository\ProductRepository;
use PDO;
use PDOException;
use Throwable;

/** 业务规则都在这里：它不知道请求从哪来，也不关心结果怎么输出 */
final class StockService
{
    public function __construct(
        private PDO $pdo,
        private ProductRepository $products,
    ) {}

    public function listProducts(): array
    {
        return $this->products->all();
    }

    public function createProduct(string $sku, string $name): array
    {
        try {
            $id = $this->products->create($sku, $name);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { // 违反唯一约束：SKU 重复
                throw new BusinessException('SKU_EXISTS', 'SKU 已存在');
            }
            throw $e;
        }

        return $this->requireProduct($id);
    }

    public function stockIn(int $productId, int $quantity, string $reason): array
    {
        return $this->transaction(function () use ($productId, $quantity, $reason) {
            if (!$this->products->increaseStock($productId, $quantity)) {
                throw new BusinessException('NOT_FOUND', '商品不存在');
            }
            $this->products->addMovement($productId, $quantity, $reason);

            return $this->requireProduct($productId);
        });
    }

    public function stockOut(int $productId, int $quantity, string $reason): array
    {
        return $this->transaction(function () use ($productId, $quantity, $reason) {
            $this->requireProduct($productId);
            if (!$this->products->decreaseStock($productId, $quantity)) {
                throw new BusinessException('INSUFFICIENT_STOCK', '库存不足');
            }
            $this->products->addMovement($productId, -$quantity, $reason);

            return $this->requireProduct($productId);
        });
    }

    public function movements(int $productId): array
    {
        $this->requireProduct($productId);

        return $this->products->movements($productId);
    }

    private function requireProduct(int $id): array
    {
        return $this->products->find($id)
            ?? throw new BusinessException('NOT_FOUND', '商品不存在');
    }

    /** 要么全部成功，要么全部撤销：扣库存和写流水必须一起成功 */
    private function transaction(callable $work): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $work();
            $this->pdo->commit();

            return $result;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
```

- Service 不知道请求从哪里来（HTTP、命令行脚本还是测试），也不关心结果怎么输出，所以它能被各种入口复用，测试起来也最简单；
- **扣库存和写流水放在同一个事务里**：如果扣完库存、写流水时数据库断开，没有事务就会出现“库存少了，却查不到去向”；
- `createProduct` 没有先查“SKU 是否已存在”再插入，而是直接插入，让唯一索引拦住重复。先查后插在并发时会失效：两个请求可能同时查到“不存在”。

::: warning 踩坑：最后一件商品被卖了两次
**现象**：只剩 1 件库存，两个顾客几乎同时下单，都显示成功，库存变成了 -1。

**原因**：“先查库存、再扣减”是两个步骤，两个请求可能交错执行：

1. 请求 A 查询库存，得到 1；
2. 请求 B 查询库存，也得到 1；
3. 请求 A 判断 1 ≥ 1，扣减，库存变成 0；
4. 请求 B 也判断 1 ≥ 1，扣减，库存变成 -1。

PHP-FPM 用多个进程同时处理请求，这种交错在线上迟早会发生，只是概率问题。

**修复**：把判断和扣减放进同一条 SQL，再看影响的行数：

```sql
UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?
```

影响 1 行，说明库存够、已经扣好；影响 0 行，说明库存不够，什么都没改。数据库会让同一行的更新排队执行：第二个请求等第一个完成后再判断条件，看到的已经是扣减后的库存。

**怎么避免再犯**：凡是“检查余量再扣减”的场景（库存、余额、优惠券次数），都用条件更新并检查影响行数，数据库再用 `CHECK` 约束兜底。规则复杂、必须先查再改时，在事务里用 `SELECT ... FOR UPDATE` 锁住这一行。详见 [数据库索引与事务](/backend/database) 和 [并发与限流](/backend/concurrency)。
:::

### 3.7 第五步：参数校验、路由和控制器

参数校验只检查**格式**：字段有没有、类型对不对、长度合不合适。“库存够不够”是业务规则，留给 Service：

```php
<?php

declare(strict_types=1);

namespace App\Http;

use App\BusinessException;

/** 只检查“格式”：有没有、类型对不对、长度合不合适。业务规则交给 Service。 */
final class Input
{
    public static function string(array $data, string $key, int $maxLength): string
    {
        $value = $data[$key] ?? null;
        if (!is_string($value) || trim($value) === '') {
            throw new BusinessException('VALIDATION_FAILED', "{$key} 不能为空");
        }

        $value = trim($value);
        if (mb_strlen($value) > $maxLength) { // 按“字”计算长度，一个汉字算 1 个
            throw new BusinessException('VALIDATION_FAILED', "{$key} 不能超过 {$maxLength} 个字");
        }

        return $value;
    }

    public static function positiveInt(array $data, string $key, int $max = 100000): int
    {
        $value = $data[$key] ?? null;
        if (!is_int($value) || $value < 1 || $value > $max) {
            throw new BusinessException('VALIDATION_FAILED', "{$key} 必须是 1 到 {$max} 之间的整数");
        }

        return $value;
    }
}
```

- 长度用 `mb_strlen` 计算：`strlen('演示水杯')` 得到的是 12（字节数），`mb_strlen` 才是 4；
- `positiveInt` 只接受 JSON 里的整数，`"5"`（字符串）、`5.5`、`true` 都会被拒绝。不去“猜”调用方的意思，规则才清楚。

路由负责把“方法 + 路径”交给对应的处理函数。路径存在但方法不对，返回 405；路径不存在，返回 404：

::: details 展开 src/Http/Router.php
```php
<?php

declare(strict_types=1);

namespace App\Http;

use App\BusinessException;

final class Router
{
    /** @var list<array{string, string, callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        // /products/{id}/stock-in  →  #^/products/(?<id>\d+)/stock-in$#
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?<$1>\d+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function dispatch(string $method, string $path): mixed
    {
        $pathExists = false;

        foreach ($this->routes as [$routeMethod, $regex, $handler]) {
            if (preg_match($regex, $path, $matches) !== 1) {
                continue;
            }
            $pathExists = true;
            if ($routeMethod !== $method) {
                continue;
            }
            // 只保留命名分组，例如 ['id' => '3']，再转成整数
            $params = array_map('intval', array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY));

            return $handler($params);
        }

        throw $pathExists
            ? new BusinessException('METHOD_NOT_ALLOWED', '请求方法不支持')
            : new BusinessException('NOT_FOUND', '接口不存在');
    }
}
```
:::

读取请求体、输出 JSON 的小工具：

::: details 展开 src/Http/Json.php
```php
<?php

declare(strict_types=1);

namespace App\Http;

use App\BusinessException;
use JsonException;

final class Json
{
    /** 读取 JSON 请求体，返回关联数组 */
    public static function readBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new BusinessException('VALIDATION_FAILED', '请求体不是合法的 JSON');
        }

        if (!is_array($data)) {
            throw new BusinessException('VALIDATION_FAILED', '请求体必须是 JSON 对象');
        }

        return $data;
    }

    public static function send(int $status, array $payload): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
```
:::

控制器只做三件事：取参数、调用 Service、交回结果。它很“薄”，没有任何业务判断：

```php
<?php

declare(strict_types=1);

namespace App\Controller;

use App\Http\Input;
use App\Service\StockService;

/** 控制器只做三件事：取参数、调用 Service、把结果交回去 */
final class ProductController
{
    public function __construct(private StockService $stock) {}

    public function list(): array
    {
        return $this->stock->listProducts();
    }

    public function create(array $body): array
    {
        return $this->stock->createProduct(
            Input::string($body, 'sku', 32),
            Input::string($body, 'name', 50),
        );
    }

    public function stockIn(int $id, array $body): array
    {
        return $this->stock->stockIn(
            $id,
            Input::positiveInt($body, 'quantity'),
            Input::string($body, 'reason', 50),
        );
    }

    public function stockOut(int $id, array $body): array
    {
        return $this->stock->stockOut(
            $id,
            Input::positiveInt($body, 'quantity'),
            Input::string($body, 'reason', 50),
        );
    }

    public function movements(int $id): array
    {
        return $this->stock->movements($id);
    }
}
```

### 3.8 第六步：唯一入口和统一错误处理

最后把所有零件在入口装起来：

```php
<?php

declare(strict_types=1);

use App\BusinessException;
use App\Controller\ProductController;
use App\Database;
use App\Http\Json;
use App\Http\Router;
use App\Repository\ProductRepository;
use App\Service\StockService;

require dirname(__DIR__) . '/vendor/autoload.php';

$config = require dirname(__DIR__) . '/config/config.php';
date_default_timezone_set($config['timezone']); // 时区只在这一个地方设置

$requestId = bin2hex(random_bytes(8)); // 每个请求一个 ID，日志和响应里都带上

// 业务错误码 → HTTP 状态码
$statusMap = [
    'VALIDATION_FAILED' => 422,
    'NOT_FOUND' => 404,
    'METHOD_NOT_ALLOWED' => 405,
    'SKU_EXISTS' => 409,
    'INSUFFICIENT_STOCK' => 409,
];

try {
    $pdo = Database::connect($config['db']);
    $controller = new ProductController(new StockService($pdo, new ProductRepository($pdo)));

    $router = new Router();
    $router->add('GET', '/products', fn () => $controller->list());
    $router->add('POST', '/products', fn () => $controller->create(Json::readBody()));
    $router->add('POST', '/products/{id}/stock-in', fn (array $p) => $controller->stockIn($p['id'], Json::readBody()));
    $router->add('POST', '/products/{id}/stock-out', fn (array $p) => $controller->stockOut($p['id'], Json::readBody()));
    $router->add('GET', '/products/{id}/movements', fn (array $p) => $controller->movements($p['id']));

    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $data = $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);

    Json::send(200, ['code' => 'OK', 'data' => $data, 'requestId' => $requestId]);
} catch (BusinessException $e) {
    Json::send($statusMap[$e->errorCode] ?? 400, [
        'code' => $e->errorCode,
        'message' => $e->getMessage(),
        'requestId' => $requestId,
    ]);
} catch (Throwable $e) {
    // 真正的原因只写进日志；返回给用户的内容不暴露 SQL、路径和堆栈
    error_log(sprintf('[%s] %s: %s at %s:%d', $requestId, $e::class, $e->getMessage(), $e->getFile(), $e->getLine()));
    Json::send(500, ['code' => 'INTERNAL_ERROR', 'message' => '服务器开小差了，请稍后再试', 'requestId' => $requestId]);
}
```

异常分成两类处理：

- `BusinessException` 是预期之内的失败，把错误码和提示返回给调用方，HTTP 状态码由 `$statusMap` 决定；
- 其他异常都是程序问题。**细节只写进日志，返回给用户的只有一句通用提示和 requestId。** 实测把数据库换成一个没有建表的空库，接口返回 `{"code":"INTERNAL_ERROR","message":"服务器开小差了，请稍后再试","requestId":"856a0cbbcc185d6f"}`，而日志里是 `[856a0cbbcc185d6f] PDOException: SQLSTATE[HY000]: General error: 1 no such table: products at ...`——按 requestId 一搜就能找到。

::: warning 踩坑：页面一片空白，什么错误都没有
**现象**：页面一片空白，或者只输出了一半；浏览器开发者工具里能看到状态码 500，页面上却没有任何错误信息。

**原因**：生产环境（正确地）关闭了 `display_errors`，致命错误不会显示在页面上。实测关闭 `display_errors` 后调用一个不存在的函数：响应只有 500 状态码和出错前已经输出的内容，完整的错误信息（哪个文件、哪一行）都写进了错误日志。

**修复**：

- 开发环境打开错误显示：`display_errors = On`、`error_reporting = E_ALL`；
- 生产环境关闭显示、打开日志：`display_errors = Off`、`log_errors = On`，并设置 `error_log` 的路径；
- 遇到白屏先查日志：PHP 的错误日志、PHP-FPM 的日志、Nginx 的 error.log；怀疑语法写错了，用 `php -l 文件名` 检查。

**怎么避免再犯**：像上面的入口文件一样，在最外层接住所有异常，记录日志并返回带 requestId 的 JSON。用户反馈问题时报出 requestId，就能直接找到对应的日志。
:::

### 3.9 第七步：跑起来

```bash
php -S 127.0.0.1:8000 -t public
```

`php -S` 是 PHP 自带的开发服务器，只用于本地开发，不要用在生产环境。另开一个终端，用 curl 调用接口（下面的输出都是实测结果）：

```bash
# 新建商品
curl -s -X POST http://127.0.0.1:8000/products \
  -H 'Content-Type: application/json' -d '{"sku":"CUP-001","name":"演示水杯"}'
# {"code":"OK","data":{"id":1,"sku":"CUP-001","name":"演示水杯","stock":0},"requestId":"ea25e2268d2191af"}

# 入库 5 件
curl -s -X POST http://127.0.0.1:8000/products/1/stock-in \
  -H 'Content-Type: application/json' -d '{"quantity":5,"reason":"采购入库"}'
# {"code":"OK","data":{"id":1,"sku":"CUP-001","name":"演示水杯","stock":5},"requestId":"732e550c9727381c"}

# 出库 6 件：库存不够，HTTP 状态码 409
curl -s -X POST http://127.0.0.1:8000/products/1/stock-out \
  -H 'Content-Type: application/json' -d '{"quantity":6,"reason":"销售出库"}'
# {"code":"INSUFFICIENT_STOCK","message":"库存不足","requestId":"841d9bcc49c1b6ea"}

# 出库 2 件
curl -s -X POST http://127.0.0.1:8000/products/1/stock-out \
  -H 'Content-Type: application/json' -d '{"quantity":2,"reason":"销售出库"}'
# {"code":"OK","data":{"id":1,"sku":"CUP-001","name":"演示水杯","stock":3},"requestId":"512d7a2caec0ad51"}

# 查看流水，最新的在前面；失败的那次出库没有留下记录
curl -s http://127.0.0.1:8000/products/1/movements
# {"code":"OK","data":[{"id":2,"change_qty":-2,"reason":"销售出库","created_at":"2026-10-23 16:46:24"},{"id":1,"change_qty":5,"reason":"采购入库","created_at":"2026-10-23 16:46:24"}],"requestId":"c5fe8a36740cbc64"}
```

Windows 的命令提示符不支持这种单引号写法，可以改用 PowerShell、Git Bash，或者 Postman 之类的工具。各种失败的情况也逐个试过：

| 请求 | HTTP 状态码 | code |
| --- | --- | --- |
| 重复的 SKU | 409 | `SKU_EXISTS` |
| `sku` 为空 | 422 | `VALIDATION_FAILED` |
| `quantity` 传了字符串 `"5"` | 422 | `VALIDATION_FAILED` |
| 请求体不是合法的 JSON | 422 | `VALIDATION_FAILED` |
| 商品不存在：`POST /products/99/stock-in` | 404 | `NOT_FOUND` |
| 路径不存在：`GET /nope` | 404 | `NOT_FOUND` |
| 方法不对：`DELETE /products` | 405 | `METHOD_NOT_ALLOWED` |

### 3.10 第八步：写测试

手动调接口只能证明“现在是好的”，测试能保证“以后改代码也不会改坏”。安装 PHPUnit（PHPUnit 12 需要 PHP 8.3 及以上）：

```bash
composer require --dev phpunit/phpunit
```

测试直接调用 Service，用内存里的 SQLite，每个测试都是一个全新的数据库，不用启动 Web 服务器：

```php
<?php

declare(strict_types=1);

use App\BusinessException;
use App\Database;
use App\Repository\ProductRepository;
use App\Service\StockService;
use PHPUnit\Framework\TestCase;

final class StockServiceTest extends TestCase
{
    private StockService $service;

    protected function setUp(): void
    {
        // 每个测试都用一个全新的内存数据库，互不干扰
        $pdo = Database::connect(['dsn' => 'sqlite::memory:', 'user' => null, 'password' => null]);
        $pdo->exec((string) file_get_contents(__DIR__ . '/../database/schema.sql'));
        $this->service = new StockService($pdo, new ProductRepository($pdo));
    }

    public function testStockOutFailsWhenStockIsNotEnough(): void
    {
        $cup = $this->service->createProduct('CUP-001', '演示水杯');
        $this->service->stockIn($cup['id'], 5, '采购入库');

        try {
            $this->service->stockOut($cup['id'], 6, '销售出库');
            $this->fail('库存不足时应该抛出异常');
        } catch (BusinessException $e) {
            $this->assertSame('INSUFFICIENT_STOCK', $e->errorCode);
        }

        $this->assertSame(5, $this->service->listProducts()[0]['stock']); // 库存没有被改动
        $this->assertCount(1, $this->service->movements($cup['id']));     // 只有那一条入库流水
    }

    public function testDuplicateSkuIsRejected(): void
    {
        $this->service->createProduct('CUP-001', '演示水杯');

        $this->expectException(BusinessException::class);
        $this->expectExceptionMessage('SKU 已存在');
        $this->service->createProduct('CUP-001', '另一个水杯');
    }
}
```

```bash
vendor/bin/phpunit tests
# OK (2 tests, 5 assertions)
```

**优先测试失败的路径。** 成功的路径手动调一次就能看到；“库存不足时库存没变、也没多出流水”这种事，只有测试会每次都替你检查。

## 4. 部署上线：从“能跑”到“能用”

上线的步骤：

1. 服务器安装 Nginx、PHP-FPM 和需要的扩展（这个项目用 MySQL 时需要 `pdo_mysql` 和 `mbstring`），用 `php -m` 和 `php-fpm -m` 分别确认，有的系统上命令叫 `php-fpm8.4`；
2. 上传代码后执行 `composer install --no-dev --optimize-autoloader`：不安装测试依赖，并生成更快的类加载映射；
3. 按下面三段配置 Nginx、PHP-FPM 和 php.ini，执行建表 SQL；
4. 重载 PHP-FPM 和 Nginx。

**Nginx：只暴露 `public` 目录，只执行入口文件。**

```nginx
server {
    listen 80;
    server_name api.example.test;
    root /var/www/mini-inventory/public;            # 只把 public 目录暴露出去

    location / {
        try_files $uri /index.php$is_args$args;     # 不是真实存在的文件，就交给入口
    }

    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock; # 按服务器上的实际路径修改
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        internal;                                   # 不允许直接访问 /index.php
    }

    location ~ \.php$ {
        return 404;                                 # 除了入口，其他 PHP 文件一律不执行
    }
}
```

**PHP-FPM：把环境变量传给 PHP。**

```ini
; PHP-FPM 进程池配置，例如 /etc/php/8.4/fpm/pool.d/www.conf（路径因系统而异）
; clear_env 默认为 yes：系统的环境变量不会传给 PHP，需要的变量要在这里逐个声明
env[DB_DSN] = "mysql:host=127.0.0.1;dbname=inventory;charset=utf8mb4"
; 口令从 PHP-FPM 服务自己的环境变量里取，不写进配置文件
env[DB_USER] = $DB_USER
env[DB_PASSWORD] = $DB_PASSWORD
```

**php.ini：生产环境的关键配置。**

```ini
; 命令行和 PHP-FPM 可能各读一份 php.ini，两份都要改
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log
date.timezone = Asia/Shanghai
opcache.enable = 1
; 不再检查文件是否修改：性能更好，但每次部署后必须重载 PHP-FPM
opcache.validate_timestamps = 0
```

Nginx 和 PHP-FPM 这两段配置，都在本地用 `nginx -t`、`php-fpm -t` 检查过语法。

::: warning 踩坑：本地好好的，一上线就不对
**现象**：本地测试全部通过，部署到服务器后却出现各种怪事：改了代码不生效；明明设置了环境变量，`getenv()` 却返回 `false`；命令行执行脚本正常，网页访问却提示缺少扩展。

**原因**：

| 现象 | 原因 |
| --- | --- |
| 改了代码不生效 | `opcache.validate_timestamps = 0` 时，OPcache 不再检查文件变化，一直用旧的编译结果 |
| `getenv()` 返回 `false` | PHP-FPM 的 `clear_env` 默认是 yes，系统环境变量不会传给 PHP 进程 |
| 命令行正常、网页报错 | 命令行的 `php` 和 `php-fpm` 可能读的是不同的 php.ini，甚至是不同版本的 PHP |

**修复**：部署脚本的最后一步重载 PHP-FPM（例如 `sudo systemctl reload php8.4-fpm`，服务名因系统而异）；在进程池配置里用 `env[...]` 声明需要的变量；用 `php --ini` 查看命令行加载的配置文件，网页环境可以临时放一个调用 `phpinfo()` 的页面查看——看完立刻删除，它会暴露服务器信息。

**怎么避免再犯**：把“重载 PHP-FPM”写进部署脚本，而不是靠人记。排查环境问题时，第一步先确认“到底是哪个 PHP、读的是哪个 php.ini”。同时维护多个项目的电脑上，经常装着好几个 PHP：命令行里的 `php` 可能是老项目用的 7.x，新装的 8.x 却不在 PATH 里。
:::

## 5. PHP 语言层面最常踩的坑

下面这些坑和框架无关，几乎每个 PHP 开发者都遇到过。每段代码的输出都在 PHP 8.4 上实测过。

### 坑 1：`==` 比较出了意外

**现象**：订单状态 `0` 表示“待支付”。前端没传 `status` 时，`$status` 是 `null`，`$status == 0` 却成立，接口把请求当成了“查询待支付订单”。

**原因**：`==` 会先转换类型再比较：

```php
var_dump(null == 0);                  // true
var_dump('1e3' == '1000');            // true：两个“数字字符串”按数值比较
var_dump(in_array('1e1', ['10']));    // true：in_array 默认也是宽松比较
var_dump('abc' == 0);                 // PHP 8 是 false，PHP 7 是 true
```

`switch` 用的也是宽松比较：`$status` 为 `null` 时会进入 `case 0`；`match` 是严格比较，会走到 `default`。

**修复**：比较一律用 `===`；`in_array`、`array_search` 传第三个参数 `true`；多分支判断用 `match` 代替 `switch`。

**怎么避免再犯**：用代码检查工具禁止宽松比较（例如 PHP-CS-Fixer 的 `strict_comparison` 规则）。从 PHP 7 升级到 8 时，重点回归涉及宽松比较的代码——实测 `'abc' == 0` 和 `in_array('abc', [0])` 在 PHP 7.3 上都是 `true`，在 8.4 上都是 `false`。

### 坑 2：接口返回的列表，有时变成了对象

**现象**：前端报错 `list.map is not a function`。一查接口，平时返回的是 `[3,7]`，这次返回了 `{"0":3,"2":7}`。

**原因**：PHP 数组是有序的字典。只有键恰好是从 0 开始的连续整数时，`json_encode` 才把它输出成 JSON 数组；经过 `array_filter`、`unset` 之后键不连续了，就会被输出成对象：

```php
$ids = [3, 0, 7];
echo json_encode(array_filter($ids));                 // {"0":3,"2":7}
echo json_encode(array_values(array_filter($ids)));   // [3,7]
```

**修复**：返回列表之前用 `array_values()` 重新编号。

**怎么避免再犯**：在测试里检查返回的列表是不是真正的列表。PHP 8.1 起可以用 `array_is_list()` 判断一个数组的键是不是从 0 开始连续编号的。

### 坑 3：金额少了 1 分钱

**现象**：商品价格 19.99 元，换算成“分”存进数据库，结果存成了 1998。

**原因**：浮点数没法精确表示大多数小数，`19.99 * 100` 实际上是 `1998.9999999999998`，`intval` 会直接截掉小数部分：

```php
var_dump(0.1 + 0.2 == 0.3);         // false
echo intval(19.99 * 100);            // 1998
echo (int) round(19.99 * 100);       // 1999
echo bcmul('19.99', '100', 0);       // 1999：bcmath 用字符串做十进制运算
```

**修复**：金额在系统里一律用整数“分”保存和计算，只在显示时换算成元；必须做小数运算时用 bcmath；从“元”换算成“分”时，先 `round` 再转整数。

**怎么避免再犯**：数据库的金额字段用整数或 `DECIMAL`，不要用 `FLOAT`、`DOUBLE`；代码评审时留意金额变量上的 `* 100` 和 `/ 100`。

### 坑 4：时间差了 8 小时

**现象**：数据库里的下单时间比实际早了 8 小时；或者 PHP 写入的时间是对的，数据库自动生成的时间却不对。

**原因**：系统里至少有三个“钟”：PHP 的时区、数据库的时区、服务器系统的时区。没有配置 `date.timezone` 时，PHP 默认使用 UTC（实测 `date_default_timezone_get()` 返回 `UTC`），比北京时间晚 8 小时；SQLite 的 `CURRENT_TIMESTAMP` 也总是 UTC 时间。

**修复**：在 php.ini 里设置 `date.timezone = Asia/Shanghai`（命令行和 PHP-FPM 的配置文件都要设置），或者像示例项目那样，在唯一的入口里设置一次；时间统一由 PHP 生成后写入数据库，不和数据库的默认时间混用。

**怎么避免再犯**：时区只在一个地方配置；接口返回带时区的时间，例如 `2026-10-23T16:46:24+08:00`（`DateTimeInterface::ATOM` 格式），前端不用猜。

### 坑 5：中文截断后，接口返回了空白

**现象**：列表接口把标题截成前几个字。某些数据的接口突然返回空白，也没有任何报错。

**原因**：`strlen`、`substr` 按字节计算，一个汉字在 UTF-8 里占 3 个字节。截到汉字中间，字符串就不再是合法的 UTF-8，`json_encode` 遇到它会直接返回 `false`：

```php
$title = '你好世界';
echo strlen($title), ' ', mb_strlen($title);    // 12 4
$short = substr($title, 0, 4);                   // 截到了第二个汉字的中间
var_dump(json_encode(['title' => $short]));      // bool(false)
echo json_last_error_msg();                      // Malformed UTF-8 characters, possibly incorrectly encoded
echo json_encode(['title' => mb_substr($title, 0, 2)], JSON_UNESCAPED_UNICODE); // {"title":"你好"}
```

`echo false` 什么也不输出，于是接口返回了空白。

**修复**：处理中文用 `mb_` 开头的函数（`mb_strlen`、`mb_substr`）；`json_encode` 加上 `JSON_THROW_ON_ERROR`，失败时抛出异常，而不是悄悄返回 `false`；再加上 `JSON_UNESCAPED_UNICODE`，中文就不会被转义成 `\u4f60\u597d` 这样的形式，排查时一眼能看懂。

**怎么避免再犯**：统一封装 JSON 输出（像示例项目的 `Json::send`）；MySQL 的表和连接都用 `utf8mb4`——MySQL 里的 `utf8` 最多只支持 3 字节的字符，存不了 emoji。

### 坑 6：`foreach` 引用改坏了数组

**现象**：循环了两次之后，数组最后一个元素的值莫名其妙被改了。

```php
$prices = [10, 20, 30];
foreach ($prices as &$price) {   // 用引用，把每个价格翻倍
    $price *= 2;
}
foreach ($prices as $price) {    // 只是想再遍历一次
}
echo json_encode($prices);       // [20,40,40]：最后一个元素被改了
```

**原因**：第一个循环结束后，`$price` 仍然是数组最后一个元素的引用。第二个循环每次给 `$price` 赋值，其实都在改最后一个元素。

**修复**：引用循环结束后立刻 `unset($price)`；或者干脆不用引用，写成 `$prices[$i] = $price * 2`，或者用 `array_map`。

**怎么避免再犯**：团队约定不在 `foreach` 里使用引用。

### 坑 7：Cannot modify header information

**现象**：本地正常，线上日志里出现 `Cannot modify header information - headers already sent by (output started at xxx.php:1)`，接口返回的 `Content-Type` 变成了 `text/html`。

**原因**：`header()` 必须在任何输出之前调用。`<?php` 前面的空格或空行、文件开头的 UTF-8 BOM、被引入的文件结尾 `?>` 后面多出的换行，都算“输出”。PHP 自带的 php.ini 模板默认开启了 4096 字节的输出缓冲（`output_buffering`），这些输出先进了缓冲区，问题被掩盖；线上关闭了缓冲，或者输出超过了缓冲区大小，问题就暴露出来。实测同一个文件：开着缓冲时一切正常，关掉缓冲后立刻出现这条警告。

**修复**：报错信息里的 `output started at 文件:行号`，就是多余输出的位置；纯 PHP 文件省略结尾的 `?>`；文件保存为不带 BOM 的 UTF-8。

**怎么避免再犯**：遵守 PER 代码规范（只包含 PHP 代码的文件必须省略结尾的 `?>`），编辑器统一设置为不带 BOM 的 UTF-8。

## 6. 对照真实项目：小项目长大以后

::: info 关于对照
以下内容来自对一个真实的 PHP 多端业务系统的只读梳理（2026-10-23）。它基于 Yaf 框架，有 12 个 `public_*` 入口和对应的 `application_*` 应用目录。这里只记录目录结构和通用做法，不涉及它的业务代码、配置和数据。
:::

把第 3 节的小项目和一个运行多年的真实项目放在一起看：

| 示例项目里的做法 | 真实项目长大以后 | 带来的问题 |
| --- | --- | --- |
| 一个 `public/index.php`，时区只设置一次 | 12 个入口，每个都各自启动 Session、设置一遍时区 | 改一个公共设置要改 12 处，漏改一处就出问题 |
| 只有需要登录状态的地方才用 Session | 每个入口的开头都调用了 `session_start()` | 同一个用户的并发请求会排队，见下面的坑 |
| 一份 `composer.json` 管理全部依赖 | 公共库目录有一份 `composer.json`，另有两个第三方 SDK 各自带着自己的 `vendor` 目录 | 同一个库可能装了好几份，升级和排查漏洞时要逐个检查 |

这些都不是“PHP 不行”，而是项目长大的过程中，没有及时调整边界。

::: warning 踩坑：同一个用户的请求为什么在排队
**现象**：页面同时发出几个接口请求，其中一个比较慢（比如导出报表）。结果其他本来很快的接口也跟着变慢，看起来像在“排队”。

**原因**：在默认的文件存储方式下，`session_start()` 会给当前用户的 Session 文件加锁，直到脚本结束或者调用 `session_write_close()` 才释放（见 [PHP 手册](https://www.php.net/manual/zh/function.session-write-close.php)）。同一个浏览器带着同一个 Session ID 发来的请求，只能一个接一个地执行。入口文件一开头就 `session_start()`，等于让每个请求都去排这个队。

**修复**：

- 不需要 Session 的请求（回调、公开接口）不要启动 Session；
- 需要 Session 的请求，读完数据立刻 `session_write_close()`，再去做耗时的工作：

```php
session_start();
$userId = $_SESSION['user_id'] ?? null;  // 先把需要的数据读出来
session_write_close();                   // 立刻释放锁，后面的慢操作不再挡住这个用户的其他请求

$report = buildSlowReport($userId);
```

- 给 App、小程序用的接口改用 Token 认证，见 [认证、授权与会话](/backend/authentication)。

**怎么避免再犯**：不要把 `session_start()` 写在“所有请求都会执行”的入口文件里，只在需要登录状态的地方调用。
:::

想看这类系统怎样一步步整理，可以接着读 [Yaf 多应用单体的边界与渐进治理](/practice/yaf-multi-app-architecture) 和 [旧系统怎么改：不推倒重来的渐进式路线](/practice/legacy-modernization-roadmap)。

## 排查思路

PHP 接口出了问题，按这个顺序查，大部分问题在前三步就能定位：

1. **看状态码和响应体**：500 先去查日志；4xx 看返回的错误码和提示；
2. **看日志**：PHP 的错误日志、PHP-FPM 的日志、Nginx 的 error.log，有 requestId 就按 requestId 搜；
3. **确认环境**：用 `php -v`、`php -m`、`php --ini` 查看命令行的版本、扩展和配置文件；网页环境用临时的 `phpinfo()` 页面核对，看完立刻删除；
4. **缩小范围**：用 `php -l` 检查语法；在关键位置用 `error_log(json_encode($data))` 打点，或者用 Xdebug 下断点；
5. **查数据**：把 SQL 和参数打印出来，放到数据库里单独执行，看结果是否符合预期；
6. **改了不生效**：先确认改的文件就是正在运行的那一份（多入口的项目尤其要注意），再检查 OPcache 和浏览器、CDN 的缓存。

## 检查清单

**写代码时**

- [ ] 文件开头写 `declare(strict_types=1)`，比较一律用 `===`
- [ ] SQL 全部使用预处理语句，表名、排序字段只从白名单里取
- [ ] 扣库存、扣余额用条件更新并检查影响行数，相关的写操作放进同一个事务
- [ ] 金额用整数“分”，中文用 `mb_` 函数处理，返回列表前用 `array_values()` 重新编号
- [ ] 业务失败用错误码表达；程序异常只写日志，对外只返回通用提示和 requestId

**上线前**

- [ ] Web 服务器的根目录只指向 `public`，除了入口文件，不执行其他 PHP 文件
- [ ] 生产环境关闭 `display_errors`、打开 `log_errors`，并确认日志真的能写入
- [ ] 命令行和 PHP-FPM 的 php.ini 都设置了 `date.timezone`
- [ ] 数据库口令通过环境变量注入，不写进代码仓库
- [ ] 部署脚本的最后一步会重载 PHP-FPM，让 OPcache 加载新代码
- [ ] 不需要 Session 的请求不启动 Session

## 延伸阅读

- [后端服务如何组织](/backend/overview)：控制器、业务服务和数据层怎么分工
- [数据库索引与事务](/backend/database)：事务和锁的更多细节
- [错误处理与请求追踪](/backend/error-handling)：错误码设计和 requestId
- [Yaf 多应用单体的边界与渐进治理](/practice/yaf-multi-app-architecture)：真实的多入口 PHP 项目怎样整理
- [PHP 官方手册（中文）](https://www.php.net/manual/zh/)：查函数时重点看返回值和更新日志
- [PHP The Right Way](https://phptherightway.com/)：社区整理的 PHP 最佳实践
- [Composer 文档](https://getcomposer.org/doc/)、[PHPUnit 文档](https://docs.phpunit.de/)
- [PER 代码规范](https://www.php-fig.org/per/coding-style/)：PHP 社区通用的代码风格
