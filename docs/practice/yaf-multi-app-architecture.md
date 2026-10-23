---
title: Yaf 多应用单体的边界与渐进治理
description: 一个 PHP 仓库里有很多 public_* 和 application_*，新人不知道从哪里看起。用“商场的多个大门”讲清入口、Bootstrap、控制器、业务服务和共享代码各自负责什么，并按六步渐进整理，避开重复启动漏改、控制器复制规则、公共库变杂物间、写后立即读从库查不到等问题。
---

# Yaf 多应用单体的边界与渐进治理

::: info 关于示例
基于真实项目整理，代码已简化脱敏。文中的应用名、控制器名、模型名、路由、表字段和配置均为教学示例，不对应真实系统。
:::

“多应用单体”听起来很复杂，其实就是：**一个 PHP 仓库里放着多个网站或 API 入口，它们分别接待不同的客户端，但共用数据库、模型和公共代码。**

这类系统常见的困扰是：

- 仓库里有一堆 `public_*` 和 `application_*` 目录，新人不知道从哪里开始看；
- 多个入口复制了启动代码，改一个配置，总担心有哪里漏改了；
- 管理端和移动端各实现了一遍相同的业务，规则慢慢变得不一致；
- 控制器越来越长，查询、校验、写库、发通知全混在一起；
- `models` 和 `library` 变成了公共杂物间，谁都可以互相调用。

这类系统不一定要立刻拆成微服务。更现实的目标是，先让开发者看懂三件事：**请求从哪个入口进来、最终进入哪个应用、真正的业务规则放在哪里。**

::: tip 读完这篇你会
- 画出一次请求从入口到数据库经过的每一层
- 把重复的入口和 Bootstrap 代码收拢成一份
- 用业务服务避免多个控制器复制同一套规则
- 按“一次只移动一小块”的方式渐进整理，不停机、不重写
:::

## 1. 原理：商场的多个大门

把多应用单体想成一座商场：

- **入口**（`public_*/index.php`）是商场的不同大门：东门、西门、地下停车场入口。大门只负责把顾客引到对应的区域，**不在门口办理业务**；
- **应用目录**（`application_*`）是不同的区域：有的区域需要会员卡（Session 认证），有的区域凭工牌进出（Token），有的是送货通道（签名回调）；
- **Bootstrap** 是每个区域开门前的检查表：通电、开灯、检查收银机、安排保安；
- **业务服务**是商场统一的规章制度：不管顾客从哪个门进来，退货规则都是同一套；
- **模型和数据库**是仓库。

```text
浏览器 / H5 / 小程序
          │
          ▼
   public_x/index.php       只选择应用
          │
          ▼
   application_x            处理认证和响应格式
          │
          ▼
   业务服务                  保存唯一一份业务规则
          │
          ▼
   模型 / 数据库 / 外部适配器
```

这套组织方式有实际的好处：共用数据库事务很直接，老代码可以继续运行，部署链路比微服务短，公共业务不需要经过网络调用。问题通常不在“单体”本身，而在于**边界变模糊了**。

| 位置 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 入口 | 选择应用，启动 Yaf | 查询数据库、处理业务参数 |
| 控制器 | 接收参数、调用服务、返回响应 | 写一整套业务流程 |
| 业务服务 | 编排一次完整的业务动作 | 输出 JSON、读取 Session |
| 模型或仓储 | 查询和保存数据 | 决定 HTTP 返回格式 |
| 公共库 | 在多个应用中含义一致的能力 | 堆放所有“可能复用”的函数 |

核心思路只有一句话：**入口保留差异，业务规则集中复用，每次只移动一小块。**

## 2. 坑一：每个入口都复制了启动代码，改配置时漏改

**现象**：需要统一调整时区，改了五个入口文件，漏掉了第六个，结果回调接口记录的时间全部差了 8 小时。

**原因**：每个入口都复制了跨域、会话、时区和路径设置；每个应用的 `Bootstrap.php` 也只有少量差异，却各自维护着大段相同的代码。

**修复**：用一份清单说明每个应用，再让所有入口共用一个启动器。

**用入口清单说明每个应用**（下面的目录名都是示例）：

```php
<?php

// bootstrap/app_catalog.php
return array(
    'console' => array(
        'directory' => APP_ROOT . '/application_console',
    ),
    'mobile' => array(
        'directory' => APP_ROOT . '/application_mobile',
    ),
);
```

清单只保存非敏感信息。数据库口令、令牌和证书应该由部署环境注入，不能写进仓库。

**所有入口共用一个启动器**：

```php
<?php

// bootstrap/web.php
define('APP_ROOT', dirname(__DIR__));

function runYafApp($appName)
{
    $catalog = require APP_ROOT . '/bootstrap/app_catalog.php';

    if (!isset($catalog[$appName])) {
        throw new RuntimeException('Unknown application');
    }

    date_default_timezone_set('Asia/Shanghai');

    $app = new Yaf_Application(APP_ROOT . '/config/app.ini');
    $app->setAppDirectory($catalog[$appName]['directory']);
    $app->bootstrap()->run();
}
```

于是移动端的入口只剩两行核心代码：

```php
<?php

require dirname(__DIR__) . '/bootstrap/web.php';
runYafApp('mobile');
```

另一个入口只需要把 `mobile` 改成 `console`。入口里不要出现业务查询，也不要写死服务器的磁盘路径。

**把重复的 Bootstrap 初始化收进父类**：

```php
<?php

abstract class CommonBootstrap extends Yaf_Bootstrap_Abstract
{
    protected $config;

    public function _initConfig()
    {
        $this->config = Yaf_Application::app()->getConfig();
        Yaf_Registry::set('config', $this->config);
    }

    public function _initDatabase()
    {
        $factory = new DemoDatabaseFactory($this->config->database);
        Yaf_Registry::set('database', $factory->create());
    }

    public function _initPlugins(Yaf_Dispatcher $dispatcher)
    {
        foreach ($this->plugins() as $plugin) {
            $dispatcher->registerPlugin($plugin);
        }
    }

    protected function plugins()
    {
        return array();
    }
}
```

每个应用自己的 `Bootstrap.php` 只写差异：

```php
<?php

class Bootstrap extends CommonBootstrap
{
    protected function plugins()
    {
        return array(
            new DemoLoginPlugin(),
        );
    }
}
```

如果某个入口不需要模板或 Session，就不要为了“统一”而强行初始化。公共父类负责共同的步骤，子类明确声明差异，这就足够了。

**怎么避免再犯**：不要把差异全部塞进公共启动器里写成一个巨大的 `if`，那只是把复制粘贴搬了个地方。简单的差异放在清单里，行为上的差异交给插件或子类。

## 3. 坑二：管理端和移动端各写了一套规则

**现象**：同一个“创建订单”的校验规则，管理端控制器里写了一份，移动端控制器里又写了一份。后来移动端改了规则，管理端没改，两边创建出的订单标准不一致。

**原因**：业务规则写在控制器里，而控制器是绑定在某个应用、某种协议上的，换一个入口就只能复制。更糟的情况是控制器之间互相调用，把协议层和业务层绑死在一起。

**修复**：控制器只做协议转换；业务服务不读取 Yaf 的请求对象，也不直接输出 JSON：

```php
<?php

class DemoOrderController extends Yaf_Controller_Abstract
{
    public function createAction()
    {
        $input = array(
            'request_no' => $this->getRequest()->getPost('request_no'),
            'items' => $this->getRequest()->getPost('items'),
        );
        $result = $this->service()->create($input, $this->currentActor());
        $this->getResponse()->setBody(json_encode($result));
        return false;
    }
}

class CreateDemoOrderService
{
    private $orders;

    public function __construct($orders)
    {
        $this->orders = $orders;
    }

    public function create(array $input, $actor)
    {
        DemoOrderInput::validate($input);
        return $this->orders->create($input, $actor->id());
    }
}
```

管理端和移动端可以有不同的控制器、登录方式和响应格式，但调用的是同一个服务。业务服务的输入是普通数组或命令对象，而不是 `Yaf_Request`，这样它才能同时被 Web 请求、命令行任务和测试使用。

## 4. 坑三：公共库变成了杂物间

**现象**：`library/Common.php` 有几千行，里面既有金额计算，也有某个页面专用的字段转换，还直接读取 Session 和请求参数。谁都不敢改，因为不知道会影响哪些入口。

**修复**：一段代码进入共享层之前，至少回答三个问题：

1. 它在多个应用中，表达的是**同一个**业务含义吗？
2. 它是否不依赖某个应用专属的 Session、Header 或页面？
3. 修改它时，能否用独立的测试证明没有破坏原来的行为？

三个都回答“是”，才适合共享。只给移动端做字段转换的代码，留在移动端应用里；真正通用的资格判断、金额计算和状态规则，才进入公共服务。公共服务需要的“当前操作人”“业务范围”，要**显式地作为参数传入**，而不是在内部读取全局变量。

调用方向保持单向：

```text
控制器 → 业务服务 → 模型或仓储 → 数据库
                    → 外部系统适配器
```

不要让公共模型反过来调用控制器，也不要让应用 A 直接加载应用 B 的控制器或视图。发现这类调用时，提取出双方真正需要的最小业务方法。

## 5. 坑四：刚写进去的数据，马上查询却查不到

**现象**：提交订单后立即跳转到订单详情，偶尔提示“订单不存在”，刷新一下又有了。

**原因**：数据库配置了主从复制，写操作走主库、读操作走从库。从库同步主库的数据有一点延迟，写完立刻去从库读，就可能读不到。

**修复**：关键的“写后立即读”场景，读取也走写连接（主库）；或者让写接口直接返回写入后的结果，前端不再立即查询。

## 6. 渐进整理的六个步骤

### 第一步：先画入口地图，不改代码

| 入口代号 | 调用方 | 应用目录 | 认证方式 | 是否需要模板 |
| --- | --- | --- | --- | --- |
| console | 内部浏览器 | `application_console` | Session | 是 |
| mobile | 移动客户端 | `application_mobile` | Token | 否 |
| callback | 外部回调 | `application_callback` | 签名 | 否 |

这里只记录示例代号，不要把真实的域名、口令或内部路由放进公开文档。然后逐个确认：Web 服务器的根目录指向哪个 `public_*`、入口有没有调用 `setAppDirectory()`、应用加载了哪些插件、哪些启动步骤完全相同、哪些模型被多个应用同时调用。完成这一步，新人就能顺着请求路径读代码了。

### 第二步：把入口减到最薄

先提取时区、基础响应头、配置路径和 Yaf 的创建过程。**一次只迁移一个入口**，并对比迁移前后的状态码、响应头、Session 行为、默认模块和控制器、异常返回。不要在同一次改动里顺便改路由、改响应字段或升级框架。

### 第三步：合并 Bootstrap 的共同部分

先提取完全相同、且没有业务含义的部分：配置加载、数据库连接装配、日志初始化、公共命名空间注册、统一的异常入口。模板、认证、权限等通常存在应用差异，由子类或清单声明。判断标准不是“代码看起来很像”，而是“规则是否真的相同”。

### 第四步：从一条重复的业务开始收口

选一个风险较低的动作，比如“查询一份演示单据”：

1. 为现有的返回结果写回归测试；
2. 新建一个业务服务；
3. 先让一个控制器调用它；
4. 验证稳定后，再接入第二个控制器；
5. 最后删除两处旧的重复规则。

### 第五步：给共享代码和依赖方向定规则

按第 4 节的三个问题和单向调用规则执行，并在代码评审中检查。

### 第六步：移出环境配置，再按小切片迁移

配置至少分成三类：可以公开的默认值放在配置样例里；不同环境的值由部署环境提供；密钥和凭据只从安全配置中读取。路径用项目根目录和 `DIRECTORY_SEPARATOR` 组合，不在入口、控制器或公共库里写死某台服务器的磁盘目录。

之后每次只迁移一个“从入口到数据库的完整小功能”，比如：

```text
移动端查询 → 控制器 → 查询服务 → 模型
```

不要一次把所有控制器、模型和目录全部改名。每个切片都保留旧的接口契约，验证通过后再继续下一个。

## 7. 坑五：目录太大，就想拆成微服务

**现象**：觉得仓库太大、太乱，决定把某个模块拆成独立服务。拆完之后多了网络超时、重试、分布式一致性、独立部署和监控，原来的混乱却没有减少。

**修复**：先在单体内部把边界理清楚：入口可识别、控制器足够薄、共享规则只有一份。即使仍然部署成一个单体，也会比盲目拆服务更容易维护。等某个模块确实需要独立扩容或独立发布时，再沿着已经清晰的边界拆出去。

## 排查思路：一个请求的问题怎么定位

1. 根据请求的域名和路径，确认进入的是哪个 `public_*` 入口；
2. 看入口选择了哪个应用目录、这个应用的 Bootstrap 加载了哪些插件；
3. 找到对应的控制器和它调用的业务服务；
4. 在日志里确认请求进入了哪个应用、哪个业务服务（日志里应该记录这些信息）；
5. 涉及“刚写入就查不到”时，检查读请求走的是主库还是从库。

## 检查清单

**入口**

- [ ] 每个公开入口都能启动正确的应用目录
- [ ] `OPTIONS` 等预检请求不会误进业务控制器
- [ ] 未登录或签名错误时，返回结果与旧版本一致
- [ ] 异常响应不会暴露绝对路径、SQL 或配置
- [ ] 命令行任务不会初始化不需要的页面模板和 Session

**Bootstrap**

- [ ] 缺少必填配置时立即失败，并留下安全的日志
- [ ] 各应用只注册自己需要的插件
- [ ] 数据库、缓存和日志只初始化一次
- [ ] 调试开关不会在正式环境输出堆栈
- [ ] Windows 和 Linux 测试环境中的路径都能正确组合

**业务边界**

- [ ] 同一业务由不同入口调用时，得到相同的业务结果
- [ ] 业务服务的测试不需要构造 `Yaf_Request`
- [ ] 公共规则不直接读取 Session、Cookie 或 Header
- [ ] 应用目录之间没有直接加载控制器或视图

**发布前**

- [ ] 本次只迁移一个入口或一条业务切片
- [ ] 路由、请求字段和响应字段没有意外改变
- [ ] 新旧实现都有可以比较的回归用例
- [ ] 可以按单个入口回退，而不是只能回退整个系统

## 延伸阅读

- [多端系统全景图](/practice/full-stack-system-map)：一次需求会经过哪些层
- [旧系统渐进改造](/practice/legacy-modernization-roadmap)：改造的整体路线
- [后端服务如何组织](/backend/overview)：控制器与业务服务的分工
- [如何学习 PHP：从 0 到 1 做一个项目](/backend/php-from-zero)：先用一个小项目打好 PHP 基础
