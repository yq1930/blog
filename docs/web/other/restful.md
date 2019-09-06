# Restful接口风格

一、什么是Restful风格

REST是REpresentational State Transfer的缩写（一般中文翻译为表述性状态转移），REST 是一种体系结构，而 HTTP 是一种包含了 REST 架构属性的协议。
简单地说，REST 就是将资源的状态以适合客户端或服务端的形式从服务端转移到客户端（或者反过来）。在 REST 中，资源通过 URL 进行识别和定位，然后通过行为(即 HTTP 方法)来定义 REST 来完成怎样的功能。

二、范例说明

CRUD 动作 | HTTP 方法
---- | ---
Create | POST
Read |  GET
Update | PUT 或 PATCH
Delete | DELETE

上表简单表述了Http的各种方法对应的CRUD动作，我们以“用户-文章-回复”这样的模型来举例说明Restful风格的url应该怎样设计。

1. 新增数据

**传统风格url**：<br />
新增用户的页面，get请求

**/addUser** <br />
实际新增用户的业务逻辑，post请求

**/doAddUser** <br />
Restful风格url：
新增用户的页面，get请求

**/users/new** <br />
新增用户的业务逻辑，post请求

**/users** <br />
优劣对比：乍一看两者差不多，反而Restful风格的url有点迷糊，不能直接看出想干什么。

2. 读取数据

**传统风格url**：<br />
获得用户信息，get请求

**/getUser?id=1** <br />
获取用户列表，get请求

**/getUserList** <br />
Restful风格url：
获得用户信息，get请求

**/users/1** <br />
获取用户列表，get请求

**/users** <br />
优劣对比：感觉都可以，Restful风格的url好像长度更短些

3. 更新数据

传统风格url：

**进入更新用户的页面，get请求** <br />
/updateUser?id=1

**实际处理更新用户信息的操作，post请求** <br />
/doUpdateUser?id=1

**Restful风格url**：<br />
进入更新用户的页面，get请求
/users/1/edit

**实际处理更新用户信息的操作，put请求** <br />
/users/1

4. 删除数据

传统风格url：

**删除用户，get请求** <br />
/deleteUser?id=1

**Restful风格url**：<br />
删除用户，delete请求
/users/1

5. 优劣对比

单一业务这样看起来Restful风格并没有明显的好处，下面我们把这些放在一起看，再加点复杂的动作。

### 传统风格：

用户接口 | 请求方法 | demo 
---- | --- | --- 
/user/getUserList          |       get       |      #用户列表
/user/getUser?id=1         |       get       |      #查询用户信息
/user/addUser              |       get       |      #新增用户页面
/user/doAddUser            |       post      |      #新增用户业务
/user/updateUser?id=1      |       get       |      #修改用户信息的页面
/user/doUpdateUser?id=1    |       post      |      #更新用户信息业务
/user/deleteUser?id=1      |       get       |      #删除用户信息

文章接口 | 请求方法 | demo
---- | --- | ---   
/article/getArticleList                  |    get      |      #文章列表
/article/getArticle?id=1                 |    get      |      #查询文章信息
/article/addArticle                      |    get      |      #新增文章页面
/article/doAddArticle                    |    post     |      #新增文章业务
/article/updateArticle?id=1              |    get      |      #修改文章信息的页面
/article/doUpdateArticle?id=1            |    post     |      #更新文章信息业务
/article/deleteArticle?id=1              |    get      |      #删除文章信息
/article/getArticleListByUser?userId=1   |    get      |      #查询用户下的文章

回复接口 | 请求方法 | demo
---- | --- | --- 
/answer/getAnswerList                     |   get      |      #回复列表
/answer/getAnswer?id=1                    |   get      |      #查询回复信息
/answer/addAnswer                         |   get      |      #新增回复页面
/answer/doAddAnswer                       |   post     |      #新增回复业务
/answer/updateAnswer?id=1                 |   get      |      #修改回复信息的页面
/answer/doUpdateAnswer?id=1               |   post     |      #更新回复信息业务
/answer/deleteAnswer?id=1                 |   get      |      #删除回复信息
/answer/getAnswerListByArtical?artId=1    |   get      |      #查询文章下的回复

可以看出传统的url风格更多的以行为动作来命名（addXXX，updateXXX，...），url很长，看起来不美观。

### Restful风格:

用户接口 | 请求方法 | demo
---- | --- | --- 
/users                  |         get          |        #用户列表
/users/1                |         get          |        #查询用户信息
/users/new              |         get          |        #新增用户页面
/users                  |         post         |        #新增用户业务
/users/1/edit           |         get          |        #修改用户页面
/users/1                |         put          |        #修改用户业务
/users/1                |         delete       |        #删除用户

文章接口 | 请求方法 | demo
---- | --- | ---   
/articles               |        get           |        #文章列表
/articles/1             |        get           |        #查询文章信息
/articles/new           |        get           |        #新增文章页面
/articles               |        post          |        #新增文章业务
/articles/1/edit        |        get           |        #修改文章页面
/articles/1             |        put           |        #修改文章业务
/articles/1             |        delete        |        #删除文章
/users/1/articles       |        get           |        #用户1的文章列表

回复接口 | 请求方法 | demo
---- | --- | --- 
/answers                |        get            |         #回复列表
/answers/1              |        get            |         #查询回复信息
/answers/new            |        get             |           #新增回复页面
/answers                |        post            |          #新增回复业务
/answers/1/edit         |        get             |           #修改回复页面
/answers/1              |        put             |            #修改回复业务
/answers/1              |        delete          |           #删除回复
/articles/1/answers     |        get             |            #文章1的回复列表

Restful风格更多的以资源名和状态来命名url，且资源一般使用复数（少数情况用单数），url格式比较固定，使用不同的Http方法区分。