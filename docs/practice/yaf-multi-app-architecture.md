---
title: Yaf 多应用单体的边界与渐进治理
description: 从入口、应用、模块、共享模型、基础库与配置六个层次，拆解传统 PHP/Yaf 多应用单体的组织方式，并给出不中断交付的渐进治理路径。
---

# Yaf 多应用单体的边界与渐进治理

> 基于真实项目整理，代码已简化脱敏。文中的应用名、控制器名、模型名、路由、表字段和配置均为教学示例，不对应真实系统。

“多应用单体”听起来复杂，其实就是：**一个 PHP 仓库里放着多个网站或 API 入口，它们分别接待不同客户端，但共用数据库、模型和公共代码。**

这类系统不一定要立刻拆成微服务。

更现实的目标是先让开发者看得懂三件事：

- 请求从哪个入口进来；
- 最终进入哪个应用；
- 真正的业务规则放在哪里。

## 读完能解决什么

读完本文，你可以处理下面这些常见问题：

- 一个仓库有很多 `public_*` 和 `application_*`，新人不知道从哪里开始看；
- 多个入口复制了启动代码，改一个配置要担心漏改；
- 管理端、移动端都实现了一遍相同业务，结果规则逐渐不一致；
- 控制器越来越长，查询、校验、写库、通知混在一起；
- `models` 和 `library` 变成公共杂物间，谁都可以互相调用；
- 团队想治理旧系统，却担心一次重构影响所有客户端。

本文给出的做法不要求停机重写，也不要求先引入新框架。

核心思路只有一句话：**入口保留差异，业务规则集中复用，改造一次只移动一小块。**

## 真实场景

在一个长期维护的 Yaf 项目中，常见结构是这样的：

- 管理后台有自己的 Web 入口；
- 移动 H5 有自己的 API 入口；
- 小程序、企业应用或合作方也有各自入口；
- 每个入口选择一个独立的 `application` 目录；
- 多个应用共同使用数据库封装、共享模型和公共业务库；
- 不同应用的 `Bootstrap.php` 又分别初始化配置、模板、缓存、数据库和插件。

这套组织方式有实际好处：

- 共用一套数据库事务很直接；
- 老代码可以继续运行；
- 部署链路比微服务短；
- 公共业务不需要经过网络调用。

问题通常不是“单体”本身，而是边界变模糊：

1. 每个入口都复制跨域、会话、时区和路径设置；
2. 每个应用的启动文件只有少量差异，却维护着大段相同代码；
3. 控制器直接调用多个模型，业务规则被复制到不同客户端；
4. 公共库直接读取 Session、请求参数和全局变量，无法单独测试；
5. 修改一个共享方法时，很难判断会影响哪些入口。

先别急着拆服务。

把一次请求的路径画出来，通常就能找到最值得先改的地方。

## 一张小流程图

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

判断代码应该放在哪里，可以记住这个简单分工：

| 位置 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 入口 | 选择应用并启动 Yaf | 查询数据库、处理业务参数 |
| 控制器 | 接收参数、调用服务、返回响应 | 写一整套业务流程 |
| 业务服务 | 编排一次完整业务动作 | 输出 JSON、读取 Session |
| 模型或仓储 | 查询和保存数据 | 决定 HTTP 返回格式 |
| 公共库 | 多个应用含义一致的能力 | 堆放所有“可能复用”的函数 |

## 项目中可借鉴的简化代码

下面先给出一个可直接照着改的最小版本。

### 1. 用入口清单说明每个应用

将“应用标识和目录的对应关系”放在一个清单中，下面的目录名全部是示例：

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

清单只保存非敏感信息。数据库口令、令牌和证书仍应由部署环境注入，不能写进仓库。

### 2. 让所有入口共用一份启动器

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

于是移动端入口只剩两行核心代码：

```php
<?php

require dirname(__DIR__) . '/bootstrap/web.php';
runYafApp('mobile');
```

另一个入口只需要把 `mobile` 改为 `console`。

入口中不要出现业务查询，也不要硬编码服务器磁盘路径。

### 3. 把重复的 Bootstrap 初始化收进父类

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

应用自己的 `Bootstrap.php` 只写差异：

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

如果一个入口不需要模板或 Session，就不要为了“统一”强行初始化。公共父类负责共同步骤，子类明确声明差异，已经足够。

### 4. 用业务服务避免多个控制器复制规则

控制器只做协议转换，业务服务不读取 Yaf 请求，也不直接输出 JSON：

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

管理端和移动端可以有不同控制器、登录方式和响应格式，但共同调用这一个服务。

## 逐步实现

### 第一步：先做入口地图，不改代码

建立一张小表：

| 入口代号 | 调用方 | 应用目录 | 认证方式 | 是否需要模板 |
| --- | --- | --- | --- | --- |
| console | 内部浏览器 | `application_console` | Session | 是 |
| mobile | 移动客户端 | `application_mobile` | Token | 否 |
| callback | 外部回调 | `application_callback` | 签名 | 否 |

这里只记录示例代号，不要把真实域名、口令或内部路由放进公开文档。

然后逐个确认：

- Web Server 的根目录指向哪个 `public_*`；
- 入口有没有调用 `setAppDirectory()`；
- 应用加载了哪些插件；
- 哪些启动步骤是完全相同的；
- 哪些业务模型被多个应用同时调用。

完成这一步后，新人就能顺着请求路径读代码。

### 第二步：把入口减到最薄

先提取时区、基础响应头、配置路径和 Yaf 创建过程。

一次只迁移一个入口，并对比迁移前后的：

- 状态码；
- 响应头；
- Session 行为；
- 默认模块和控制器；
- 异常返回。

不要在同一次改动里顺便换路由、改响应字段和升级框架。

### 第三步：合并 Bootstrap 的共同部分

把多个 `Bootstrap.php` 放在一起比较。

先提取完全相同且没有业务含义的部分，例如：

- 配置加载；
- 数据库连接装配；
- 日志初始化；
- 公共命名空间注册；
- 统一异常入口。

模板、认证、权限等通常存在应用差异，应由子类或清单声明。

判断标准不是“代码很像”，而是“规则是否真的相同”。

### 第四步：从一条重复业务开始收口

选择一个风险较低的动作，例如“查询一份演示单据”。

迁移顺序建议如下：

1. 为现有返回写回归测试；
2. 新建一个业务服务；
3. 先让一个控制器调用它；
4. 验证稳定后，再接入第二个控制器；
5. 最后删除两处旧的重复规则。

业务服务的输入应是普通数组或命令对象，不应是 `Yaf_Request`。

这样它才能被 Web、命令行任务和测试共同使用。

### 第五步：给共享代码和依赖方向定规则

一段代码进入共享层前，至少回答三个问题：

1. 在多个应用中，它表达的是同一个业务含义吗？
2. 它是否不依赖某个应用专属的 Session、Header 或页面？
3. 修改它时，能否用独立测试证明没有破坏原行为？

都回答“是”，才适合共享。只负责移动端字段转换的代码留在移动端应用里；真正共同的资格判断、金额计算和状态规则才进入公共服务。调用方向保持单向：

```text
控制器 → 业务服务 → 模型或仓储 → 数据库
                    → 外部系统适配器
```

不要让公共模型反过来调用控制器，也不要让应用 A 直接加载应用 B 的控制器或视图。发现这类调用时，提取双方真正需要的最小业务方法。

### 第六步：移出环境配置，再按小切片迁移

配置至少分成三类：

- 可公开默认值：放配置样例；
- 不同环境的值：由部署环境提供；
- 密钥和凭据：只从安全配置读取。

路径使用项目根目录和 `DIRECTORY_SEPARATOR` 组合，不在入口、控制器或公共库中写死某台服务器的磁盘目录。

完成配置整理后，每次只迁移一个“从入口到数据库的完整小功能”，例如：

```text
移动端查询 → 控制器 → 查询服务 → 模型
```

不要一次把所有控制器、所有模型和目录全部改名。每个切片保留旧接口契约，验证通过后再继续下一个。

## 常见坑

| 坑 | 会发生什么 | 修正方式 |
| --- | --- | --- |
| 公共启动器里写巨大的 `if` | 只是把复制粘贴搬了位置 | 清单存简单差异，插件承接行为差异 |
| 控制器之间互相调用 | 协议层和业务层绑死 | 提取普通 PHP 服务供双方调用 |
| 所有代码都放进 `Common` | 影响范围不可判断 | 按业务能力命名和拆分 |
| 公共服务读取全局变量 | 依赖隐藏，测试困难 | 显式传入操作人和业务范围 |
| 写完主库立刻读从库 | 复制延迟造成“查不到” | 关键写后读使用写连接 |
| 重构同时改接口 | 回归原因难定位 | 先改组织，保持契约不变 |
| 目录大就拆微服务 | 新增网络与运维复杂度 | 先理清边界，再判断是否独立部署 |

## 测试/检查清单

### 入口测试

- [ ] 每个公开入口都能启动正确的应用目录；
- [ ] `OPTIONS` 等预检请求不会误进业务控制器；
- [ ] 未登录或签名错误时，返回仍与旧版本一致；
- [ ] 异常响应不会暴露绝对路径、SQL 或配置；
- [ ] CLI 任务不会初始化不需要的页面模板和 Session。

### Bootstrap 测试

- [ ] 缺少必填配置时能立即失败，并留下安全日志；
- [ ] 各应用只注册自己需要的插件；
- [ ] 数据库、缓存和日志只初始化一次；
- [ ] 调试开关不会在正式环境输出堆栈；
- [ ] Windows 与 Linux 测试环境中的路径都能正确组合。

### 业务边界测试

- [ ] 同一业务由不同入口调用时，得到相同的业务结果；
- [ ] 控制器测试只关心参数和响应映射；
- [ ] 业务服务测试不需要构造 `Yaf_Request`；
- [ ] 公共规则不直接读取 Session、Cookie 或 Header；
- [ ] 应用目录之间没有直接加载控制器或视图。

### 发布前检查

- [ ] 本次只迁移一个入口或一条业务切片；
- [ ] 路由、请求字段和响应字段没有意外改变；
- [ ] 新旧实现都有可比较的回归用例；
- [ ] 日志能看出请求进入了哪个应用和业务服务；
- [ ] 可以按单个入口回退，而不是只能回退整个系统。

最后再记住一句话：**多应用单体最先要治理的不是目录数量，而是重复启动、重复规则和反向依赖。**
做到入口可识别、控制器够薄、共享规则只有一份，即使仍然部署为一个单体，也会比盲目拆服务更容易维护。
