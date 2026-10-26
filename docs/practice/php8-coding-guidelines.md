---
title: PHP 8 升级后的编码规范与兼容检查
description: 从 PHP 7.3 迁移到 PHP 8.3 的常见问题出发，整理数组与对象、数值计算、函数调用、静默行为变化、弃用语法和数据库返回值的编码规则，并说明回滚期如何保持双版本兼容。
---

# PHP 8 升级后的编码规范与兼容检查

**PHP 8 迁移后的日常开发，要把输入类型、返回值和运算顺序写清楚。** 旧版本里一些“告警后继续执行”的写法，会变成异常；还有一些代码不报错，结果却已经变化。只修掉页面上的 500，不能证明迁移完成。

本文围绕 PHP 7.3 迁移到 PHP 8.3 的维护场景，将常见问题归纳成可执行的编码规则。回滚窗口内，同一份代码还要能在 PHP 7.3 下运行，因此示例使用两个版本共有的语法。

## 先区分三类兼容问题

| 类别 | 典型现象 | 检查重点 |
| --- | --- | --- |
| 直接失败 | `TypeError`、`ValueError`、`Error` 或编译错误 | 参数类型、函数签名、已移除语法 |
| 静默变化 | 请求成功，状态判断、金额或日期结果不同 | 运算顺序、比较规则和业务结果 |
| 弃用告警 | 目前还能执行，但出现 `Deprecated` | 清理旧写法，避免继续新增 |

错误日志主要帮助发现第一类问题。第二类必须核对输入和预期输出；第三类即使没有显示到页面上，也需要在测试环境保留可追踪的记录。

## 1 数组和对象在使用前确定类型

### 数组变量在分支之前初始化

集合的默认值应是 `[]`。不要用 `''` 同时表示“没有数据”和“还没赋值”，也不要让变量只在部分分支中得到赋值。

```php
$extraItems = [];

if ($includeExtra) {
    $extraItems = ['demo'];
}

$items = array_merge($items, $extraItems);
```

`in_array()` 的第二个参数必须是数组，`array_merge()`、`array_column()`、`array_reduce()` 等也都有各自的类型要求。查询或接口返回值可能是 `false`、`null` 或字符串时，要先处理失败分支，再交给数组函数。

### count 只用于数组或 Countable 对象

`count()` 和 `sizeof()` 接受数组及实现了 `Countable` 的对象，普通对象不在此列。PHP 8 对不合法的类型抛出 `TypeError`。[count 官方说明](https://www.php.net/manual/en/function.count.php)

如果只是判断单条查询有没有结果，应按查询契约判断 `null` 或 `false`，不需要统计“这一行有几个字段”。`empty()` 可以用于允许空值的场景，但它也把 `0`、`'0'`、`false` 当作空；普通对象的存在也不代表它含有业务数据。

### JSON 的数组访问和对象访问保持一致

要按键名访问，就解码为数组，并验证 JSON 和数据结构：

```php
$payload = json_decode($responseBody, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)) {
    throw new UnexpectedValueException('响应必须是有效的 JSON 集合');
}

if (!array_key_exists('status', $payload)) {
    throw new UnexpectedValueException('响应缺少 status 字段');
}

$status = $payload['status'];
```

如果保留对象，则使用 `$payload->status`。对象属性判断可以用 `isset()` 或 `property_exists()`：前者把值为 `null` 也视为不存在，后者检查属性是否存在。`array_key_exists()` 用于数组，不能拿来检查对象。

同样要避免把尚未解码的 JSON 字符串按键名读取，以及把一条记录误当成记录集合再次遍历。

### 给属性赋值前先创建对象

准备写入对象属性时，在所有相关分支之前初始化对象：

```php
$result = new stdClass();
$result->items = [];

if ($hasItems) {
    $result->items = $items;
}
```

不要先设为 `''`，再期待 `$result->items = ...` 自动变成对象。自定义类应提前声明属性；PHP 8.2 对一般自定义类新增动态属性的行为发出弃用告警，`stdClass` 等例外另有规则。[动态属性说明](https://www.php.net/manual/en/migration82.deprecated.php)

## 2 数值计算先校验再转换

### 转换要发生在运算之前

`intval($page - 1)` 会先执行减法，再转换结果。若 `$page` 是空串或不合法的字符串，错误已经发生。

输入需要先按业务范围校验，再参与计算。例如分页要求正整数：

```php
$page = filter_var($rawPage, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1, 'max_range' => 10000]
]);

if ($page === false) {
    throw new InvalidArgumentException('页码不合法');
}

$offset = ($page - 1) * $pageSize;
```

对已经验证的数值，可以显式使用 `(int)` 或 `(float)`。但 `(int)'invalid'` 得到 `0`，并不会替你报告输入错误。金额、数量、时间戳为空时，是拒绝、缺省还是跳过，也要有明确的业务约定。

累加变量从 `0` 开始；`number_format()`、`round()` 和 `date()` 等函数的入参要满足各自要求，不能直接传入可能为空串的字段。

### 除数和空集合都有业务边界

除法先判断除数。若“数量必须为正”，就验证 `> 0`；若负数在业务中合法，就不能用正数判断代替非零判断。除数为零时，是报错还是返回默认值，应由业务决定。

`max()`、`min()`、`array_rand()` 不能接收空数组；`str_repeat()` 的重复次数也不能是负数。默认值必须有明确含义，避免把“无数据”伪装成一个真实结果。

### BCMath 使用规范十进制字符串

BCMath 的操作数使用十进制字符串。浮点数转字符串时可能变成科学计数法，导致参数不合法；浮点数已经发生的精度损失，也无法靠后续转换恢复。[BCMath 官方说明](https://www.php.net/manual/en/book.bc.php)

```php
$quantity = '250';
$factor = '0.000004';
$score = bcmul($quantity, $factor, 10);
```

因此不要直接把浮点字面量交给 `bcmul()`。金额等精度敏感的数据，应从输入、存储到计算都保持约定的小数格式，并单独校验小数位数和取值范围。

## 3 函数调用和类定义遵守明确契约

许多看似零散的兼容错误，都能归到“调用与定义不一致”。排查时可按下表检查：

| 检查项 | 编码要求 |
| --- | --- |
| 回调参数 | 传有效函数、闭包或可调用对象，说明文字不能当回调 |
| 参数类型和个数 | 字符串函数不传数组；复杂嵌套调用先拆开，核对括号和参数位置 |
| 静态调用 | 非静态方法通过实例调用；确实不依赖实例状态时才考虑改为静态方法 |
| 构造函数 | 使用 `__construct()`，不依赖与类同名的方法初始化 |
| 继承方法 | 子类签名兼容父类，包括参数、默认值、类型、返回类型和可见性 |
| 常量和变量 | 字符串加引号，变量带 `$`，常量在使用前定义，检查 `true`、`exit` 拼写 |

PHP 8 不再把与类同名的方法当作构造函数。这个变化可能没有报错，却使对象的初始化步骤完全没有执行，尤其需要检查旧 SDK。[PHP 8.0 不兼容变更](https://www.php.net/manual/en/migration80.incompatible.php)

`@` 也不能作为兼容方案。`@count($value)` 不会吞掉 `TypeError`，给已移除的函数加 `@` 也不会让它恢复存在。应修正类型或调用本身。

### 数据库错误模式要显式设置

PDO 从 PHP 8.0 起默认使用异常错误模式，mysqli 从 PHP 8.1 起默认启用会抛异常的报告模式。旧代码若只判断 `false`，可能接不到原来预期的失败结果。[PDO 变更](https://www.php.net/manual/en/migration80.incompatible.php)、[mysqli 变更](https://www.php.net/manual/en/migration81.incompatible.php)

新代码应明确选择错误模式，并在合适的边界处理异常。迁移期确实需要保留静默模式时，必须继续检查每次操作的返回值和错误信息；不要把全局关闭异常当成修复的终点。

事务提交以后再出现响应格式、常量拼写等错误，还会造成“数据库成功，客户端收到失败”。回归时要核对实际业务状态，不能只看 HTTP 状态码，也不能直接重试写操作。

## 4 不报错的行为变化更需要结果核对

### 状态比较统一类型并使用严格判断

PHP 7.3 中，`0 == 'invalid'` 为 `true`；PHP 8 中为 `false`。非严格的 `in_array()` 也会受数字与字符串比较规则影响。

对于来自外部的状态码，可以先规定它必须是字符串，再做严格白名单判断：

```php
if (!is_string($status) || !in_array($status, ['draft', 'ready'], true)) {
    throw new InvalidArgumentException('状态不合法');
}
```

不要为了“兼容”直接把所有输入强转成整数，否则无效文本也可能被归入数值 `0` 对应的合法状态。

### 拼接和算术分开写

PHP 8 调整了字符串拼接 `.` 与加减运算的相对优先级。混在同一个表达式里，即使能执行，含义也可能不同。[运算符优先级](https://www.php.net/manual/en/language.operators.precedence.php)

```php
$delta = $targetDay - $currentDay;
$modifier = ($delta >= 0 ? '+' : '') . $delta . ' days';
$timestamp = strtotime($modifier, $baseTimestamp);
```

先算差值，再拼日期表达式，比依赖隐式结合顺序更容易核对。

### 嵌套三元按业务含义拆开

没有括号的多层完整三元表达式，在 PHP 8 中会编译失败。加括号时也不能只复刻旧版的左结合顺序，否则可能把旧逻辑错误保留下来。多分支可以直接写成 `if / elseif / else`：

```php
if ($state === 'draft') {
    $label = '待处理';
} elseif ($state === 'ready') {
    $label = '可执行';
} else {
    $label = '未知';
}
```

另外，`substr()` 某些过去返回 `false` 的情况改为返回空字符串，相关分支需要重新核对。JSON 中浮点数的输出还受 `serialize_precision` 配置影响，不能把两个环境的格式差异全归因于 PHP 版本。[JSON 编码说明](https://www.php.net/manual/en/function.json-encode.php)

## 5 已移除和弃用的写法分开处理

### 已移除项先消除加载和调用障碍

| 旧写法 | 迁移方向 |
| --- | --- |
| `each()` | 改为 `foreach`，依赖内部指针时另行核对迭代行为 |
| `create_function()` | 改为闭包，确认变量捕获和作用域 |
| `get_magic_quotes_gpc()` | 删除过时判断；输入校验和 SQL 参数化仍需保留 |
| 无参数的 `mktime()` | 需要当前时间戳时使用 `time()` |
| `$text{0}`、`(real)$value` | 改为 `$text[0]`、`(float)$value` |
| `implode($items, ',')` | 使用 `implode(',', $items)` |
| `ereg()`、`split()`、`mysql_*` | 迁移到对应正则或数据库 API，并核对语义 |
| `money_format()` | 按地区与格式要求选择实现；`number_format()` 不是完整等价替换 |
| `mcrypt_*` | 制定加密迁移方案，验证历史密文；不能只替换成 OpenSSL 函数名 |

这些移除发生在不同版本，不能统称为“PHP 8 才移除”。统一使用 `<?php` 开标签，避免代码能否执行取决于 `short_open_tag` 配置。

### 弃用项在日常维护中逐步清理

常见项包括 `${name}` 插值、必选参数放在可选参数之后、向内置函数的非空标量参数传 `null`、普通类动态属性，以及 `utf8_encode()`、`utf8_decode()`、`strftime()` 等旧函数。[PHP 8.1 弃用说明](https://www.php.net/manual/en/migration81.deprecated.php)、[PHP 8.2 弃用说明](https://www.php.net/manual/en/migration82.deprecated.php)

相应地，使用 `{$name}`，整理参数顺序并同步调用方，声明属性，并确认原始字符编码、时区和地区格式。`switch` 中想退出当前分支使用 `break`；只有确实要进入外层循环下一轮时，才使用相应层级的 `continue`。

实现 `ArrayAccess`、`Iterator` 等内部接口时，应逐个核对方法的返回类型要求。需要兼容旧版且暂时无法声明兼容返回类型时，`#[\ReturnTypeWillChange]` 可作为过渡措施。弃用告警的未来处理时间要逐项查看官方说明，不能一概断言所有项目都将在某个大版本变成错误。

## 6 数据访问层和兼容层属于项目约定

### 区分无数据与查询失败

历史封装常见的契约是：单行查询无数据返回 `null`、失败返回 `false`；列表查询无数据返回 `[]`、失败返回 `false`；分页方法返回对象，列表在它的数据属性中。也有封装把存储过程失败统一转成空数组。

这些都是项目实现，PHP 本身没有规定。使用之前先查清返回值，尤其不要对分页对象本身调用 `count()`。

`$items = $queryResult ?: [];` 能把假值转成空数组，但会丢失失败与空结果的区别，而且无法排除非空字符串等错误类型。核心流程更适合明确处理：

```php
if ($queryResult === false) {
    throw new RuntimeException('列表查询失败');
}

if (!is_array($queryResult)) {
    throw new UnexpectedValueException('列表返回值类型不合法');
}

$items = $queryResult;
```

只有允许降级的展示逻辑，才适合在记录失败后转为空列表。聚合查询返回的 `false` 也不能直接转为 `0` 并当成真实统计结果。

### 兼容层用于存量收敛

集中封装旧行为，可以降低迁移期逐处修补的成本；新代码仍应传入正确类型，并明确失败语义。若兼容函数可能返回 `null`，下一步就不能未经检查交给原生数组函数。整条调用链的返回值要一致。

修复还应遵循业务原意。旧版因为错误参数导致条件恒真时，不应为了维持这个意外结果而直接改成 `if (true)`。会改变实际业务结果的修复，要在提交说明和回归范围中写明。

配置常量也应由项目统一入口提供，使用前核对是否定义；兼容层的默认常量不能掩盖必要配置缺失。

## 7 回滚窗口内按两个版本验证

只要还可能回到 PHP 7.3，新增代码就不能使用旧版不支持的语法或函数。除 `match`、`?->`、命名参数、联合类型、属性提升、`enum`、`readonly` 等 PHP 8 特性外，也要注意 PHP 7.4 才引入的箭头函数和类型属性。

`str_contains()`、`str_starts_with()`、`str_ends_with()`、`array_is_list()` 等函数，同样不能直接用在需要兼容 PHP 7.3 的代码里。新语法可能让文件加载失败，新函数则可能到执行对应分支时才失败。

属性标注若作为兼容措施使用，应单行、单独占一行，让旧版把整行视为 `#` 注释；不要把方法声明写在同一行。

语法检查应分别使用明确的二进制路径。以下为示例目录：

```powershell
& 'C:\runtime\php73\php.exe' -l '.\src\Example.php'
& 'C:\runtime\php83\php.exe' -l '.\src\Example.php'
```

`php -l` 只做语法检查，不能证明扩展齐全、继承关系在实际加载时兼容，或业务结果正确。回归还要覆盖空列表、查询失败、缺字段、无效数字、零除数、旧 SDK 初始化，以及事务已提交但响应失败等路径。

验证应在隔离的开发或测试环境中完成；回滚环境也需要独立满足安全要求。双版本兼容只解决代码能否运行，不能代替旧运行时的安全维护。

## 提交前检查清单

- [ ] 集合默认值为 `[]`，所有分支都有明确返回值。
- [ ] 数组函数、对象属性和 JSON 访问方式与实际类型一致。
- [ ] 输入先按格式和范围校验，再转换和运算。
- [ ] 零除数、空集合及缺失字段都有明确的处理方式。
- [ ] BCMath 接收规范十进制字符串。
- [ ] 回调、构造函数、静态调用和继承签名符合定义。
- [ ] 比较使用约定类型，拼接、算术和多分支表达式含义明确。
- [ ] 无数据、操作失败和允许降级三种情况没有混淆。
- [ ] 已移除调用已清理，没有通过 `@` 或关闭日志掩盖问题。
- [ ] 回滚期内两套运行时的语法检查和关键行为回归均已完成。

## 延伸阅读

- [PHP 严重漏洞处置与升级](/practice/php-critical-vulnerability-response)：运行时安全修复、Windows 扩展与迁移验证。
- [旧系统的渐进改造](/practice/legacy-modernization-roadmap)：如何划分持续改造的范围。
- [SQL 批处理与结果集](/practice/sql-batch-result-contract)：数据库执行结果如何传到页面。
- [如何学习 PHP](/backend/php-from-zero)：从请求、PDO 到事务的基础实践。
