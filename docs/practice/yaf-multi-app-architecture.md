---
title: Yaf 多应用单体的边界与渐进治理
description: 从入口、应用、模块、共享模型、基础库与配置六个层次，拆解传统 PHP/Yaf 多应用单体的组织方式，并给出不中断交付的渐进治理路径。
---

# Yaf 多应用单体的边界与渐进治理

先说结论：**多应用单体不是等待被微服务“拯救”的失败架构。** 对一套长期演进、共享数据库和大量业务规则的 PHP 系统来说，它往往仍是成本最低的部署形态。真正决定系统是否可维护的，不是仓库里有几个 `application` 目录，而是入口差异能否被收拢、业务规则是否只有一个权威实现、共享库是否有清晰边界，以及配置和运行时依赖能否被验证。

治理这类系统时，最稳妥的路线通常不是推倒重来，而是依次完成四件事：

1. 把每个入口的职责压缩为“选择应用并启动”。
2. 把重复的启动逻辑收敛成公共内核，把应用差异改成显式配置或扩展点。
3. 把控制器中的业务编排迁入按业务能力组织的服务，把共享目录从“公共杂物间”变成有方向的依赖层。
4. 用契约测试、依赖规则和可观测性守住边界，再决定是否真的需要拆成独立服务。

> 本文所有目录、类名、配置项、路由和代码均为重新设计的演示内容，不对应任何真实项目；示例只表达工程方法。

> 为了突出职责，示例使用较紧凑的现代 PHP 写法。旧运行时可以改写为显式属性和构造器，边界设计与迁移顺序不受影响。

## 一、先理解“多应用单体”是什么

典型的 Yaf 多应用单体同时具备三种特征：

- 一个代码仓库承载管理端、开放接口、移动端接口、回调入口或定时任务等多个应用。
- 不同 Web 根目录拥有各自的前置入口，并通过 `setAppDirectory()` 或配置选择应用目录。
- 多个应用共享数据库访问层、业务模型、缓存、日志、模板能力和第三方适配器。

它既不是普通的“单入口 MVC”，也不是多个完全独立的服务。更准确的描述是：**多个协议边界，共用一套进程内业务能力和部署单元**。

```text
                         ┌──────────────────────────────┐
浏览器 / H5 / 小程序 ───▶│ public/*：协议入口与应用选择  │
第三方回调 / 内部任务 ──▶│ 只做最小启动，不承载业务规则  │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │ apps/*：各应用的控制器与视图   │
                         │ admin / portal / callback ... │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │ domain + application service │
                         │ 业务规则、用例编排、事务边界    │
                         └───────┬──────────────┬───────┘
                                 │              │
                    ┌────────────▼─────┐  ┌────▼──────────────┐
                    │ infrastructure   │  │ integrations      │
                    │ DB/缓存/日志/队列 │  │ 支付/消息/文件等适配 │
                    └──────────────────┘  └───────────────────┘
```

这种架构有很现实的优点：进程内调用简单、共享事务方便、部署链短、旧功能迁移成本低。它的问题也很集中：入口和启动代码容易复制，应用之间容易直接引用，控制器会逐步吞掉业务规则，共享目录会失去边界，最终“一处修改、处处担心”。

因此，第一步不是讨论拆不拆服务，而是建立一张能回答以下问题的地图：

- 哪些入口对外暴露？各自服务哪类调用方？
- 每个入口选择哪个应用目录、默认模块和插件集合？
- 哪些业务能力被多个应用复用？权威实现在哪里？
- 哪些代码是框架基础设施，哪些是业务规则，哪些只是外部系统适配？
- 哪些全局状态、配置和运行时目录会影响一次请求？

## 二、六层边界：每一层只回答一种问题

### 1. 入口层：这个请求从哪里进入

入口层是 Web Server 能直接访问的 `index.php`。它只应该负责：

- 确定仓库根目录与运行环境。
- 根据固定标识选择应用清单。
- 加载统一的前置启动器。
- 把请求交给 Yaf。

跨域、会话、时区、错误显示、响应头等策略如果散落在多个入口里，迟早会出现“某个入口修了，另一个入口没修”的漂移。入口脚本应该薄到几乎不需要单独维护：

```php
<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/bootstrap/front.php';

run_web_application('backoffice');
```

`backoffice` 是演示标识。真正的目录、配置文件和插件列表由公共启动器查询，而不是让入口自行拼路径、设置一长串全局变量。

一个可测试的公共启动器可以长这样：

```php
<?php

function run_web_application(string $appName): void
{
    $root = dirname(__DIR__);
    $catalog = require $root . '/config/app_catalog.php';

    if (!isset($catalog[$appName])) {
        throw new RuntimeException('Unknown application');
    }

    $definition = $catalog[$appName];
    $runtime = RuntimeProfile::fromEnvironment($_SERVER);

    HttpPrelude::apply($definition->httpPolicy(), $runtime);

    $app = new Yaf_Application($runtime->configFile());
    $app->setAppDirectory($root . '/' . $definition->applicationDirectory());
    $app->bootstrap()->run();
}
```

这里的 `RuntimeProfile`、`HttpPrelude` 和应用清单都是示例抽象。关键不在类名，而在于：**变化点变成数据，公共步骤只有一份。**

入口层尤其不应做这些事：

- 查询数据库判断路由到哪个应用。
- 在预检请求里执行完整启动链。
- 写死主机路径、环境地址或密钥。
- 解析业务参数并直接调用模型。
- 为了某个应用临时修改全局错误策略。

### 2. 应用层：这组调用方需要哪些能力

一个应用目录通常对应一个稳定的协议或调用方边界，例如“内部管理界面”“面向用户的接口”“第三方回调”。它适合放置：

- 控制器和视图。
- 应用专属的认证插件。
- 输入映射、输出序列化与错误转换。
- 应用独有、尚未形成共享能力的薄适配代码。

应用边界不等于业务边界。管理端和移动端可能都要执行“提交业务单据”，它们的权限校验与响应格式不同，但核心规则应落到同一个应用服务。不要复制两套业务模型，再期待它们长期保持一致。

```text
AdminController ─┐
                 ├──▶ SubmitDocumentService ──▶ Domain / Repository
MobileController ┘

入口差异：身份来源、参数格式、返回格式
共享部分：状态校验、金额计算、事务、审计事件
```

### 3. 模块层：在一个大型应用内划分路由空间

Yaf 模块适合解决“大应用内部不同路由空间如何隔离”，例如后台应用里的运营、财务、系统设置等功能区。模块应以调用方能理解的能力边界命名，而不是按数据库或开发人员分组。

判断是否值得成为模块，可以问四个问题：

1. 它是否拥有稳定的路由前缀？
2. 它是否有相对独立的权限集合？
3. 它是否能由一组明确的回归用例覆盖？
4. 它的控制器是否主要调用同一组业务能力？

模块之间可以共享应用服务，但不应互相实例化控制器。控制器是协议适配器，不是复用单元。

### 4. 应用服务层：一次业务动作如何完成

应用服务承接“用例编排”：加载数据、执行策略、开启事务、持久化结果、记录待处理事件。它不关心请求来自哪个入口，也不直接输出 HTTP 响应。

```php
final class ApproveSubmission
{
    public function __construct(
        private SubmissionRepository $submissions,
        private AuthorizationPolicy $authorization,
        private TransactionManager $transactions,
        private EventOutbox $outbox,
    ) {}

    public function execute(ApproveCommand $command, Actor $actor): ApprovalResult
    {
        return $this->transactions->run(function () use ($command, $actor) {
            $submission = $this->submissions->getForUpdate($command->submissionId());
            $this->authorization->assertCanApprove($actor, $submission);

            $submission->approveAt($command->occurredAt());
            $this->submissions->save($submission);
            $this->outbox->append(DomainEvent::from($submission));

            return ApprovalResult::from($submission);
        });
    }
}
```

示例刻意没有 `$_POST`、`Yaf_Registry`、JSON 输出或第三方 SDK。这样同一个用例能被不同控制器、命令行任务或补偿任务复用，也能在不启动完整 Web 环境时测试。

### 5. 领域与共享模型层：规则的权威实现在哪里

传统 Yaf 项目常把所有可复用代码都叫“Model”，但其中至少混合了四类职责：

| 类型 | 负责什么 | 不应负责什么 |
| --- | --- | --- |
| 领域对象 / 策略 | 状态转换、资格判断、计算规则 | HTTP、SQL 拼接、SDK 调用 |
| 应用服务 | 用例编排、事务边界、事件记录 | 视图渲染、全局会话读取 |
| 仓储 / 查询对象 | 持久化与查询映射 | 决定业务是否允许发生 |
| 基础设施适配器 | 数据库、缓存、消息、外部系统 | 跨领域业务编排 |

共享代码的标准不应是“两个地方调用过”，而应是：

- 术语和行为在所有调用方中含义一致。
- 它有明确维护者和稳定接口。
- 它只依赖比自己更底层的抽象。
- 改动能够通过独立测试证明兼容。

如果同名概念在两个应用里的规则不同，强行共用一个带大量 `if ($app === ...)` 的方法，比复制一个很薄的适配器更糟。共享的是稳定内核，不是所有相似代码。

### 6. 基础设施与集成层：技术细节在哪里变化

数据库驱动、缓存实现、日志、模板、文件系统和第三方 SDK 都属于变化频繁的边缘。对上层暴露小而稳定的端口：

```php
interface NotificationPort
{
    public function enqueue(Notification $notification): void;
}

interface SequencePort
{
    public function next(DocumentKind $kind, Scope $scope): DocumentNumber;
}
```

应用服务依赖接口，具体适配器在启动阶段装配。这样替换 SDK、调整数据库连接或增加测试替身时，不必修改业务规则。

## 三、一份更可控的目录蓝图

不必一次迁移成“完美目录”。先定义目标方向，再让新代码按目标结构落位：

```text
project/
├── public/
│   ├── backoffice/index.php
│   ├── member/index.php
│   └── callback/index.php
├── apps/
│   ├── Backoffice/
│   │   ├── Bootstrap.php
│   │   ├── controllers/
│   │   ├── plugins/
│   │   └── views/
│   ├── MemberApi/
│   └── CallbackApi/
├── src/
│   ├── Application/        # 用例编排、命令、查询
│   ├── Domain/             # 领域对象、策略、值对象
│   ├── Infrastructure/     # DB、缓存、日志、队列实现
│   └── Integration/        # 外部系统适配器
├── bootstrap/
│   ├── front.php           # Web 公共启动器
│   ├── console.php         # CLI 公共启动器
│   └── container.php       # 依赖装配
├── config/
│   ├── defaults.php
│   └── app_catalog.php
├── runtime/                # 部署时创建，不纳入版本控制
└── tests/
    ├── Unit/
    ├── Integration/
    ├── Contract/
    └── Architecture/
```

旧的 `application/models` 与 `library` 可以继续存在。迁移期用兼容门面把旧调用转给新服务，不需要大爆炸式搬家：

```php
final class LegacySubmissionFacade
{
    public function approve(array $legacyInput): array
    {
        $command = ApproveCommandMapper::fromLegacy($legacyInput);
        $result = ServiceLocatorBridge::approvalService()->execute(
            $command,
            RequestActorBridge::current()
        );

        return LegacyResultMapper::from($result);
    }
}
```

这是过渡代码，不是最终目标。给它加上 `@deprecated`、调用日志和删除条件，才能避免“临时桥接”永久存在。

## 四、把启动流程从复制粘贴变成组合

### 启动流程的合理顺序

一次请求的启动链可以明确为：

```text
读取最小环境信息
  ↓
选择应用定义
  ↓
验证配置（缺项立即失败）
  ↓
建立日志与请求标识
  ↓
装配数据库、缓存等基础设施
  ↓
注册应用专属插件
  ↓
分发请求
  ↓
统一异常映射与访问日志
```

两个细节很重要。

第一，**日志和请求标识要早于大部分初始化**。否则连接数据库失败时，系统连一条可关联日志都留不下。

第二，**配置错误要快速失败**。缺少数据库地址或运行时目录不可写时，不要带着半残状态处理请求。

### 公共内核与应用扩展点

多个 `Bootstrap.php` 出现大段相同方法时，可先提取无业务含义的公共父类：

```php
abstract class CommonBootstrap extends Yaf_Bootstrap_Abstract
{
    protected ServiceContainer $services;

    final public function _initRuntime(): void
    {
        $this->services = ContainerFactory::build(AppIdentity::current());
    }

    final public function _initObservability(Yaf_Dispatcher $dispatcher): void
    {
        $dispatcher->registerPlugin(
            new RequestTracePlugin($this->services->logger())
        );
    }

    final public function _initDatabase(): void
    {
        $this->services->database()->assertReachableConfiguration();
    }

    protected function applicationPlugins(): array
    {
        return [];
    }

    final public function _initApplicationPlugins(Yaf_Dispatcher $dispatcher): void
    {
        foreach ($this->applicationPlugins() as $plugin) {
            $dispatcher->registerPlugin($plugin);
        }
    }
}
```

子应用只声明差异：

```php
final class Bootstrap extends CommonBootstrap
{
    protected function applicationPlugins(): array
    {
        return [
            $this->services->authenticationPlugin(),
            $this->services->authorizationPlugin(),
        ];
    }
}
```

提取时不要一口气改写所有行为。先通过“字符级相似”找出重复块，再用启动契约测试记录现状，最后逐项收拢。对于确有差异的会话、模板或认证策略，用配置描述，不要塞进父类的应用名判断。

## 五、配置治理：配置不是一个巨大数组

### 配置应有四层来源

推荐按从稳定到易变的顺序合并：

```text
代码默认值
  < 部署环境配置
  < 应用专属配置
  < 进程环境中的敏感值
```

“后者覆盖前者”必须是显式规则。每项配置还应有类型、是否必需、允许范围和是否敏感等元数据。

```php
final readonly class DatabaseSettings
{
    private function __construct(
        public Dsn $dsn,
        public SensitiveValue $password,
        public PositiveDuration $timeout,
    ) {}

    public static function from(array $input): self
    {
        return new self(
            Dsn::parse(Required::string($input, 'DATABASE_DSN')),
            Required::secret($input, 'DATABASE_PASSWORD'),
            PositiveDuration::fromString($input['DATABASE_TIMEOUT'] ?? 'short')
        );
    }
}
```

示例没有展示任何真实地址或凭据。生产凭据只能由部署系统注入；仓库里的配置样例应使用明显无效的占位符。

### 把路径当作配置能力，而不是字符串常量

传统系统常同时面对 Linux 开发环境与 Windows 部署环境。直接拼接盘符、反斜杠或相对路径，会让迁移和测试变得脆弱。下面的值对象只接受绝对根目录，并且只允许追加一个安全的相对目录名；它不会裁掉 Unix 根目录、Windows 盘符根或 UNC 根的分隔符：

```php
final class RuntimePaths
{
    private string $base;

    public function __construct(string $base)
    {
        $this->assertAbsolute($base);
        $this->base = $base;
    }

    public function cache(): string
    {
        return $this->child('cache');
    }

    private function child(string $name): string
    {
        if (
            $name === '' ||
            $name === '.' ||
            $name === '..' ||
            strpbrk($name, '/\\') !== false
        ) {
            throw new InvalidArgumentException('Child name must be one safe segment');
        }

        $hasTrailingSeparator =
            str_ends_with($this->base, '/') ||
            str_ends_with($this->base, '\\');

        return $this->base
            . ($hasTrailingSeparator ? '' : $this->preferredSeparator())
            . $name;
    }

    private function preferredSeparator(): string
    {
        $containsSlash = str_contains($this->base, '/');
        $containsBackslash = str_contains($this->base, '\\');

        if ($containsBackslash && !$containsSlash) {
            return '\\';
        }

        if ($containsSlash) {
            return '/';
        }

        return DIRECTORY_SEPARATOR;
    }

    private function assertAbsolute(string $path): void
    {
        $isUnixRooted = str_starts_with($path, '/');
        $isDriveRooted = strlen($path) >= 3
            && ctype_alpha($path[0])
            && $path[1] === ':'
            && ($path[2] === '/' || $path[2] === '\\');
        $hasUncPrefix = strlen($path) >= 2
            && $path[0] === '\\'
            && $path[1] === '\\';
        $uncSegments = $hasUncPrefix
            ? array_values(array_filter(
                explode('/', str_replace('\\', '/', substr($path, 2))),
                static fn (string $segment) => $segment !== ''
            ))
            : [];
        $isUncRooted = $hasUncPrefix && count($uncSegments) >= 2;

        if (!$isUnixRooted && !$isDriveRooted && !$isUncRooted) {
            throw new InvalidArgumentException('Runtime base must be absolute');
        }
    }
}
```

例如 `/` 会得到 `/cache`，盘符根和 UNC 共享根也会保留原有根与分隔符语义。示例只负责安全追加单段目录，不试图实现通用路径规范化；部署适配器仍要验证根目录真实存在、可写、容量可接受。不要等到业务流程中途才发现文件无法落盘。

### 不要把可变请求上下文放进全局注册表

Yaf 注册表适合保存进程级、不可变或只读的基础设施引用。当前用户、租户、门店或请求参数属于请求上下文，散落的全局读取会让依赖不可见，也会让 CLI 和单元测试难以复用。

可先引入一个显式的 `RequestContext`：

```php
final readonly class RequestContext
{
    public function __construct(
        public RequestId $requestId,
        public Actor $actor,
        public Scope $scope,
        public ClientKind $clientKind,
    ) {}
}
```

迁移初期由插件从旧会话构造它，控制器再显式传给应用服务。等调用点完成迁移后，再删除业务代码对全局注册表的直接读取。

## 六、共享目录最危险的不是“大”，而是依赖没有方向

### 先画出允许的依赖

```text
controllers / console commands
              │
              ▼
      application services
              │
              ▼
            domain
              ▲
              │ 实现接口
 infrastructure / integrations
```

规则是：

- 领域层不依赖 Yaf、数据库驱动、缓存或第三方 SDK。
- 应用服务可以依赖领域接口，但不依赖具体控制器。
- 基础设施实现领域端口，可以依赖框架和 SDK。
- 一个应用不能直接 `require` 另一个应用目录里的控制器或模型。

跨应用直接引用通常意味着“真正共享的能力还没有被命名”。处理步骤是：

1. 找到被引用代码里真正需要的最小行为。
2. 在共享层定义一个以业务语言命名的接口。
3. 把实现迁入共享层，或在原位置用适配器实现接口。
4. 让调用方只依赖接口。
5. 用契约测试确保新旧入口行为一致。

### 按共同变化拆分，不按文件类型拆分

一个几千行的“公共模型”通常混合了查询、状态变更、第三方调用和格式转换。不要机械地拆成更多 `Helper`；应沿一次业务能力的共同变化拆开：

```text
原来：CommonModel
  ├── 查询资格
  ├── 修改账户
  ├── 生成单号
  ├── 发送通知
  └── 拼响应数组

目标：
  EligibilityPolicy       资格规则
  AccountRepository       持久化端口
  DocumentNumberPort      编号端口
  NotificationPort        通知端口
  SubmitDocumentService   用例编排
  HttpResponseMapper      协议映射
```

拆分的价值不是文件变小，而是规则可以单独测试、外部能力可以替换、事务边界可以被看见。

## 七、控制器要薄，但不能只剩“万能模型调用”

一个合格的控制器通常只做五步：

1. 读取并验证协议输入。
2. 从认证插件获得请求上下文。
3. 把输入映射成命令或查询对象。
4. 调用一个应用服务。
5. 把结果或异常映射成稳定响应。

```php
final class SubmissionController extends Yaf_Controller_Abstract
{
    public function approveAction(): bool
    {
        $input = ApproveHttpInput::from($this->getRequest());
        $context = $this->requestContext();

        try {
            $result = $this->approvalService()->execute(
                $input->toCommand(),
                $context->actor
            );

            $this->json(ApprovalResponse::success($result));
        } catch (BusinessRuleViolation $error) {
            $this->json(ApprovalResponse::rejected($error));
        }

        return false;
    }
}
```

“薄”并不意味着把所有参数原样传进一个万能模型。命令对象需要明确表达业务意图，避免十几个位置参数和含义不明的布尔值。

## 八、认证、授权和错误处理要按应用区分、按内核统一

### 认证是应用差异，授权是业务规则的一部分

不同入口可能使用 Cookie、令牌、签名或可信网络身份。认证插件负责把这些协议凭证转换为统一的 `Actor`，不应该在业务服务里判断某个 Header 或 Session 键。

授权包含两层：

- 粗粒度：这个应用或角色能否访问该路由，可在插件或控制器前置阶段拒绝。
- 细粒度：当前操作人能否修改这个具体业务对象，应由策略对象结合对象状态判断。

只做第一层会产生“有菜单权限就能改所有数据”的漏洞；只做第二层则会在每个用例里重复基础校验。

### 统一错误语义，不强求所有入口同一响应格式

领域层抛出稳定的错误类型：输入无效、状态冲突、权限不足、资源不存在、依赖暂不可用。各应用根据自己的协议映射成 JSON、页面或回调确认响应。

```text
Domain error: StateConflict
  ├── 管理端 API  → HTTP 冲突状态 + 可展示消息
  ├── 移动端 API  → 稳定业务码 + 刷新建议
  └── 回调入口    → 按第三方协议返回确认或重试信号
```

这样既保留应用差异，又避免各控制器随意发明错误含义。

## 九、渐进治理路线：每一步都可上线、可回滚

### 阶段一：盘点，不改行为

建立四张清单：

| 清单 | 至少记录什么 |
| --- | --- |
| 入口清单 | 调用方、应用目录、默认模块、会话策略、跨域策略 |
| 启动清单 | 配置、数据库、缓存、模板、插件、异常处理 |
| 共享依赖清单 | 调用方、被调用目录、依赖方向、维护者 |
| 高风险用例清单 | 事务、金额/库存、外部调用、回调、补偿 |

先补入口烟雾测试和关键访问日志。没有现状保护就重构启动代码，风险很难评估。

### 阶段二：收拢入口与启动内核

- 让入口只保留应用标识。
- 将重复 HTTP 前置处理移动到公共启动器。
- 将数据库、缓存、日志的装配集中管理。
- 用应用清单表达差异。
- 对每个入口执行相同的启动契约测试。

这一阶段只调整组织方式，不改业务返回。

### 阶段三：切断跨应用引用

从调用最频繁、变化最少的一条共享能力开始：定义端口、迁移实现、保留旧门面、增加契约测试。不要先挑最复杂的结算流程练手。

可以在 CI 中加入简单的架构规则：

```bash
#!/usr/bin/env bash

set -euo pipefail

if rg "apps/(Backoffice|MemberApi)/" apps/CallbackApi --glob '*.php'; then
  echo "应用目录之间禁止直接依赖"
  exit 1
fi
```

目录名只是演示。更成熟时可用 AST 工具检查命名空间依赖，减少文本匹配误报。

### 阶段四：按垂直切片迁移业务规则

选择一个边界清晰、风险可控的用例：

```text
旧控制器
  ↓ 先调用兼容门面
新应用服务
  ↓
领域策略 + 新仓储适配器
  ↓
沿用原数据库与发布方式
```

每完成一个切片，就删除对应控制器里的业务判断，并记录旧方法调用量。只有调用量归零且观察期无回退，才删除兼容代码。

### 阶段五：再评估拆服务

当某个能力已经具备独立接口、独立测试、明确数据所有权和稳定运维需求时，拆服务才是部署边界变化，而不是代码整理的替代品。

## 十、什么时候继续单体，什么时候拆出去

| 信号 | 更适合留在单体 | 可以考虑独立部署 |
| --- | --- | --- |
| 数据一致性 | 依赖大量本地事务与联表查询 | 数据所有权已清晰，可事件协作 |
| 发布节奏 | 与其他能力经常共同变化 | 发布频率和团队节奏明显独立 |
| 资源需求 | 负载形态接近 | CPU、内存或弹性需求显著不同 |
| 故障隔离 | 进程内失败影响可控 | 某依赖经常拖垮整站且可降级 |
| 接口成熟度 | 仍在频繁改动内部模型 | 契约稳定、有消费者测试 |
| 运维能力 | 监控和自动化尚不完善 | 能承担发现、追踪、重试、告警 |

如果只是目录很大、类很多，先做模块化单体。微服务会把函数调用变成网络调用，同时引入超时、重试、幂等、版本兼容和分布式观测；边界没理清之前拆出去，只是把耦合搬到线上。

## 十一、常见反例与修正

### 反例一：每个入口复制一份启动脚本

**后果**：跨域策略、错误显示、时区、会话和安全头逐渐不一致。

**修正**：入口只声明应用标识；公共启动器统一执行；应用清单表达差异。

### 反例二：多个 `Bootstrap.php` 通过复制保持“独立”

**后果**：数据库或缓存初始化改动需要多处同步，漏改只能在特定入口触发。

**修正**：抽取公共内核，子应用只提供插件、视图和协议策略等扩展点；先用契约测试锁住现状。

### 反例三：一个应用直接加载另一个应用的模型

**后果**：应用无法独立理解，加载顺序和隐式全局变量成为运行条件。

**修正**：提取最小共享端口与实现；过渡期保留门面；禁止新增反向依赖。

### 反例四：把所有共享代码都塞进 `Common` 或 `Tools`

**后果**：方法没有共同概念，任何改动都可能影响所有入口，测试只能启动完整系统。

**修正**：按业务能力和变化原因命名；区分纯规则、用例编排、持久化和外部适配。

### 反例五：业务服务到处读取全局注册表

**后果**：依赖不可见，后台、回调、CLI 和测试环境得到不同结果。

**修正**：插件构造 `RequestContext`，控制器显式传递；注册表只保留基础设施桥接并逐步退出。

### 反例六：用读库结果做关键写入判断

**后果**：复制延迟使刚写入的数据不可见，重复提交或状态校验出现竞态。

**修正**：事务内与写后关键读取固定走主连接；普通查询才允许读副本；由仓储接口显式表达一致性要求。

### 反例七：重构时顺便改路由、响应与数据库

**后果**：回归来源无法定位，任何问题都只能整体回退。

**修正**：结构迁移与行为变化分批；使用旧接口到新实现的适配层；一次发布只改变一个主要变量。

## 十二、测试策略：验证边界，而不只验证方法

### 1. 入口烟雾测试

每个入口至少覆盖：

- 健康检查能启动正确应用。
- 未认证请求被正确拒绝。
- 预检请求不会进入业务控制器。
- 异常不会泄露堆栈、路径或配置。
- 请求标识会出现在响应和日志中。

### 2. 启动契约测试

把应用清单作为数据驱动测试：

```php
foreach (AppCatalog::all() as $definition) {
    it('has a valid runtime contract', function () use ($definition) {
        expect($definition->applicationDirectory())->toBeReadableDirectory();
        expect($definition->requiredSettings())->toBeSatisfiedBy(TestEnvironment::safe());
        expect($definition->plugins())->toContainOnlyKnownPluginTypes();
    });
}
```

### 3. 应用服务单元测试

使用内存仓储和假时钟，覆盖状态规则、权限、事件与失败分支。测试名描述业务结果，不描述内部调用。

### 4. 仓储集成测试

使用真实数据库引擎验证事务、唯一约束、锁和字段映射。不要用与生产数据库语义不同的内存数据库替代关键并发测试。

### 5. 多入口契约测试

对同一个共享用例，从不同应用入口发送各自协议格式，断言它们最终产生相同领域结果，同时保留各自响应约定。

### 6. 架构测试

持续检查：

- 领域命名空间不能依赖 Yaf 或具体 SDK。
- 应用目录不能彼此引用。
- 控制器不能直接开启事务或构造第三方客户端。
- 新代码不能读取禁止的全局请求状态。

### 7. 部署前验证

在目标操作系统或等价容器中检查路径分隔、文件权限、扩展版本、时区、字符集、缓存目录和配置注入。开发机能启动不代表部署机的运行时契约成立。

## 十三、可观测性要能区分“哪个入口、哪条用例、哪个版本”

至少记录这些安全字段：

```json
{
  "request_id": "generated-request-id",
  "application": "backoffice",
  "module": "operations",
  "use_case": "submission.approve",
  "result": "rejected",
  "error_code": "STATE_CONFLICT",
  "duration_ms": "measured-value",
  "release": "build-identifier"
}
```

不要记录密码、令牌、证件、完整手机号、支付凭证或未经筛选的请求体。业务对象标识如果敏感，可以记录不可逆摘要或内部追踪标识。

建议按入口和用例观察：请求量、错误率、延迟分位、数据库耗时、缓存命中、外部依赖耗时。只有全站总错误率，无法发现“某个小入口已经完全不可用”。

## 十四、落地检查清单

### 入口与启动

- [ ] 每个公开入口都有明确所有者、调用方和应用标识。
- [ ] 入口脚本不包含业务查询和业务参数解析。
- [ ] HTTP 前置策略由公共启动器管理。
- [ ] 公共启动顺序固定，并有失败即停的配置校验。
- [ ] 应用差异通过清单或扩展点表达，不靠复制整份启动代码。
- [ ] CLI 与 Web 的启动链明确区分，不初始化无关能力。

### 应用与模块

- [ ] 应用按协议或调用方边界划分，模块按稳定路由与权限边界划分。
- [ ] 控制器只负责协议适配，不保存核心规则。
- [ ] 模块之间不调用控制器。
- [ ] 不同入口复用同一业务能力时，只有一个权威实现。

### 共享代码

- [ ] 共享目录中的每个包都有明确职责与依赖方向。
- [ ] 应用目录之间没有直接 `require` 或实例化。
- [ ] 领域规则不依赖 Yaf、SQL、缓存或第三方 SDK。
- [ ] 旧门面有调用量、删除条件和负责人。
- [ ] 新增依赖能够被架构测试检查。

### 配置与运行时

- [ ] 配置来源、覆盖顺序、类型和必填项明确。
- [ ] 密钥和凭据由部署环境注入，不进入仓库或日志。
- [ ] 路径不写死操作系统盘符，运行时目录部署时创建。
- [ ] 关键写后读和事务内查询不会误走读副本。
- [ ] 每个入口的错误显示、时区、字符集和会话策略可验证。

### 质量与演进

- [ ] 入口烟雾测试覆盖全部对外应用。
- [ ] 公共启动器有契约测试。
- [ ] 共享用例有单元测试和仓储集成测试。
- [ ] 重构发布一次只改变一个主要变量，并有回退路径。
- [ ] 是否拆服务由数据所有权、故障隔离和发布节奏决定，而不是由目录大小决定。

## 结语

传统 PHP/Yaf 系统真正珍贵的资产，通常不是某个框架写法，而是多年积累的业务规则和兼容行为。治理的目标不是把旧目录全部换成新名词，而是让这些规则有稳定归属，让入口差异可见，让共享依赖有方向，让每次改动的影响范围能够被测试和日志证明。

当入口只负责启动、控制器只负责协议、应用服务承接用例、领域层保存规则、基础设施隐藏技术细节时，多应用单体依然可以是一个清晰、可靠、低成本的架构。到了某个能力确实需要独立部署的那一天，它也已经具备可以安全拆出的边界。
