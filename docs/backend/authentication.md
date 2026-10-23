---
title: 认证、授权与会话
description: 用“酒店前台、房卡、门禁”讲清认证、会话和授权的区别，并修复越权查看他人数据、只在前端隐藏按钮、JWT 退出登录后仍有效、权限变更不生效、密码明文或 MD5 存储、token 存放不当等安全问题。
---

# 认证、授权与会话

“登录”这件事，背后其实是三个不同的问题。把它们混在一起实现，很容易出现这样的漏洞：

- 用户把 URL 里的 `userId=1` 改成 `userId=2`，就看到了别人的订单；
- 前端隐藏了“删除”按钮，但普通用户直接调接口照样能删；
- 用户点了“退出登录”，偷走的 token 却还能继续用好几天；
- 管理员把某人的权限撤销了，他却还能继续操作。

这些都是真实、常见、而且后果严重的问题。

::: tip 读完这篇你会
- 分清认证、授权、会话各自解决什么问题
- 在服务端建立可信的身份，在每个业务操作上做权限判断
- 设计可以撤销、可以过期的会话，安全地存储密码和凭据
:::

## 1. 原理：前台、房卡和门禁

住酒店的过程，正好对应这三个概念：

| 概念 | 酒店里 | 系统里 |
| --- | --- | --- |
| **认证**（Authentication）：你是谁 | 前台核对身份证 | 校验账号密码、短信验证码、第三方登录 |
| **会话**（Session）：身份怎么延续 | 前台给你一张房卡，之后刷卡就行，不用每次出示身份证 | Cookie 中的会话 ID，或者 token |
| **授权**（Authorization）：你能做什么 | 房卡只能打开你的房间和健身房，打不开别人的房间 | 判断这个身份能不能对这个资源做这个操作 |

关键在于：**每一道门都要刷卡验证**。登录成功（拿到房卡）不代表可以进任何房间，每个读取、修改、删除操作都要重新判断“这个人能不能操作这个东西”。

## 2. 两种常见的会话方式

| | 服务端会话（Session） | 无状态 token（如 JWT） |
| --- | --- | --- |
| 客户端保存 | 一个随机的会话 ID | 一段带签名的 token，里面包含用户信息 |
| 服务端保存 | 会话数据（内存、Redis、数据库） | 一般不保存，靠验证签名确认真伪 |
| 能否立即撤销 | 能，删掉服务端的会话即可 | 不能直接撤销，要额外设计（见坑三） |
| 多台服务器 | 需要共享会话存储 | 天然支持 |

没有绝对的好坏。需要随时踢人下线、权限经常变化的系统，服务端会话更简单；多服务、跨域调用的系统，token 更方便，但要处理好撤销和过期。

## 3. 坑一：信任客户端传来的用户 ID（越权访问）

**现象**：用户 A 把请求里的 `?userId=1001` 改成 `?userId=1002`，就看到了用户 B 的全部订单。攻击者写个脚本把 ID 从 1 遍历到 100000，就能拖走全部用户数据。这类漏洞不会报错，也不会触发告警，往往到数据泄露才被发现。这类问题叫 **IDOR**（不安全的直接对象引用）。

```js
// ❌ userId 来自请求参数，客户端可以随意修改
app.get('/orders', async (req, res) => {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = ?', [req.query.userId])
  res.json(orders)
})
```

**原因**：把客户端能控制的值当成了身份。这相当于让用户自己说“我是谁”。

**修复**：身份只能来自服务端验证过的会话或 token；访问具体资源时，还要检查资源的归属：

```js
// ✅ 身份来自已验证的会话
app.get('/orders', async (req, res) => {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = ?', [req.user.id])
  res.json(orders)
})

// ✅ 按 ID 查询单个资源时，同时校验归属
app.get('/orders/:id', async (req, res) => {
  const order = await orderRepo.findById(req.params.id)
  if (!order || order.userId !== req.user.id) {
    return res.status(404).json({ code: 'NOT_FOUND' }) // 不让对方知道这个订单是否存在
  }
  res.json(order)
})
```

**怎么避免再犯**：准备两个测试账号，用 A 的登录态去访问 B 的每一个资源 ID（订单、地址、文件、消息），所有接口都应该被拒绝。把这类检查写进自动化测试。

## 4. 坑二：只在前端隐藏了按钮

**现象**：普通用户看不到“删除用户”按钮，但有人在浏览器开发者工具里直接发送了删除请求，成功了。

**原因**：权限判断只做在了界面上。前端的一切都可以被用户修改和绕过，接口才是真正的边界。

**修复**：前端隐藏按钮是为了体验，**服务端必须对每个接口独立做权限判断**。权限规则写成集中的策略函数，避免每个接口各写一版、逐渐不一致：

```js
const policies = {
  'article:update': (actor, article) => actor.role === 'admin' || article.authorId === actor.id,
  'user:delete': (actor) => actor.role === 'admin'
}

function authorize(actor, action, resource) {
  if (!policies[action]?.(actor, resource)) {
    throw new ForbiddenError(`无权执行 ${action}`)
  }
}

// 在业务服务里使用
async function updateArticle(actor, id, changes) {
  const article = await articleRepo.findById(id)
  authorize(actor, 'article:update', article)
  return articleRepo.update(id, changes)
}
```

## 5. 坑三：退出登录了，token 还能用

**现象**：用户发现账号异常，赶紧退出登录并修改了密码。但之前被盗的 token 在接下来的好几天里依然可以正常调用接口。

**原因**：JWT 是“自包含”的：服务端只验证签名和过期时间，不查任何存储。只要没过期，它就一直有效。如果有效期设得很长（比如 30 天），被盗的 token 就能用 30 天。

**修复**：

- **access token 有效期设短**（比如 15 分钟），配合有效期较长、存储在服务端可撤销的 **refresh token** 换取新的 access token；
- **退出登录、修改密码、禁用账号时**，撤销该用户的 refresh token；
- 需要立即生效时，可以在用户记录上维护一个“token 版本号”，签发时写进 token，验证时比对，修改密码后版本号加一，所有旧 token 立即失效。

## 6. 坑四：权限已经撤销，用户却还能操作

**现象**：管理员把某员工从“财务”角色中移除，但他在接下来的几个小时里还能导出财务报表。

**原因**：角色信息在登录时被写进了 token 或会话缓存。权限变了，但旧的 token 里还是旧角色。

**修复**：敏感操作（导出数据、修改金额、管理用户）在执行时从数据库读取最新的权限，而不是信任 token 里携带的角色；或者在权限变更时，让该用户的会话失效、强制重新登录。

## 7. 坑五：密码用明文或 MD5 存储

**现象**：数据库被拖库后，攻击者在很短时间内还原出了大部分用户的密码，并拿去其他网站“撞库”。

**原因**：密码明文存储，或者只做了 MD5、SHA1 这类**快速**哈希。快速哈希每秒可以计算数十亿次，配合常见密码字典，很快就能被反推出来。

**修复**：使用专门为密码设计的、**故意很慢**并且自带随机盐的算法，如 Argon2、bcrypt、scrypt：

```js
import bcrypt from 'bcrypt'

const hash = await bcrypt.hash(plainPassword, 12)      // 注册时：12 是计算成本
const ok = await bcrypt.compare(inputPassword, hash)   // 登录时：比对
```

同时：密码、验证码、token 永远不写进日志；登录失败的提示不要区分“用户不存在”和“密码错误”；对登录接口做频率限制。

## 8. 坑六：token 放在哪里

| 存放位置 | 风险 | 应对 |
| --- | --- | --- |
| `localStorage` | 页面一旦存在 XSS 漏洞，脚本可以直接读走 token | 严格防范 XSS（见 [浏览器与 DOM 操作](/web/JavaScript/browser)） |
| Cookie（带 `HttpOnly`） | JS 读不到，XSS 偷不走；但浏览器会自动携带，要防范 CSRF | 设置 `Secure`、`SameSite=Lax/Strict`，敏感操作加 CSRF 校验 |

浏览器端的网页应用，推荐用带 `HttpOnly`、`Secure`、`SameSite` 的 Cookie 保存会话凭据。小程序、App 等没有 Cookie 机制的环境，使用平台提供的安全存储。

## 排查思路

1. **越权测试**：用两个账号互相访问对方的资源 ID，所有接口都应被拒绝。
2. **审计日志**：敏感操作记录“谁、在什么时间、对哪个资源、做了什么、结果如何”，出了问题可以追溯。
3. **会话问题**：确认退出、改密、禁用后，旧的凭据是否立即失效；检查 token 的有效期是否过长。
4. **定期检查**：用户表里的密码字段格式（是否为 bcrypt/Argon2 的哈希格式）、日志中是否出现了 token 或密码。

## 检查清单

- [ ] 身份只来自服务端验证过的会话或 token，不信任请求参数里的身份字段
- [ ] 每个接口在服务端独立做权限判断，访问单个资源时校验归属
- [ ] 权限规则集中在策略函数或权限服务中
- [ ] access token 有效期短，退出、改密、禁用时能撤销会话
- [ ] 敏感操作读取最新权限
- [ ] 密码使用 Argon2 / bcrypt 存储，日志中没有密码和 token
- [ ] 网页端凭据存放在 `HttpOnly` + `Secure` + `SameSite` Cookie 中

## 延伸阅读

- [Axios 请求层](/web/vue/axios)：前端如何处理 401 和刷新 token
- [错误处理与请求追踪](/backend/error-handling)：401 和 403 的错误语义
- [PHP 严重漏洞处置与升级](/practice/php-critical-vulnerability-response)：安全事件的应急处理
