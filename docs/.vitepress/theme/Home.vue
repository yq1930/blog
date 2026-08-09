<template>
  <div class="field-home">
    <header class="field-nav">
      <a class="field-brand" href="/" aria-label="返回首页">
        <img src="/icon/avatar.png" alt="" width="36" height="36" />
        <span>锦书致南终</span>
      </a>
      <nav aria-label="主导航">
        <a href="#library">笔记索引</a>
        <a href="/web/vue/axios">开始阅读</a>
        <a href="https://github.com/yq1930/blog" target="_blank" rel="noreferrer">源代码 <span aria-hidden="true">↗</span></a>
      </nav>
    </header>

    <main>
      <section class="field-hero" aria-labelledby="home-title">
        <div class="field-hero__copy">
          <p class="field-kicker">FRONTEND FIELD NOTES <span>2019—2026</span></p>
          <h1 id="home-title">把踩过的坑，<br />整理成下一次的路标。</h1>
          <p class="field-lede">这里收录前端开发中反复遇到的概念、方案与取舍。每一篇只解决一个明确的问题，方便在需要时快速找回答案。</p>
          <div class="field-actions">
            <a class="field-button field-button--primary" href="/web/vue/axios">从请求层开始 <span aria-hidden="true">→</span></a>
            <a class="field-button field-button--quiet" href="#library">浏览全部笔记</a>
          </div>
        </div>

        <aside class="route-card" aria-label="推荐阅读路线">
          <div class="route-card__head">
            <span>推荐阅读路线</span>
            <strong>03</strong>
          </div>
          <ol>
            <li>
              <span>01</span>
              <a href="/web/JavaScript/ES6"><b>语言基础</b><small>作用域、模块、数组处理</small></a>
            </li>
            <li>
              <span>02</span>
              <a href="/web/vue/axios"><b>页面与数据</b><small>浏览器、DOM、请求层</small></a>
            </li>
            <li>
              <span>03</span>
              <a href="/web/other/newTechnology"><b>交付与维护</b><small>接口、构建、站点发布</small></a>
            </li>
          </ol>
          <p class="route-card__note">按问题阅读，不必按顺序完成。</p>
        </aside>
      </section>

      <section id="library" class="field-library" aria-labelledby="library-title">
        <div class="section-heading">
          <p class="field-kicker">KNOWLEDGE SHELF</p>
          <h2 id="library-title">按工作现场取用</h2>
          <p>不是教程合集，而是一排能在开发现场随手抽出来的卡片。</p>
        </div>

        <div class="shelf-grid">
          <a class="shelf-card shelf-card--js" href="/web/JavaScript/ES6">
            <span class="shelf-card__mark">JS</span>
            <span class="shelf-card__meta">3 篇基础笔记</span>
            <h3>语言与浏览器</h3>
            <p>厘清作用域、原型链与 DOM 操作，理解代码究竟运行在哪里。</p>
            <span class="shelf-card__link">查看 JavaScript <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--vue" href="/web/vue/axios">
            <span class="shelf-card__mark">VUE</span>
            <span class="shelf-card__meta">3 篇实践笔记</span>
            <h3>数据与文档</h3>
            <p>把请求处理、站点迁移和内容组织放进同一条清晰的工作流。</p>
            <span class="shelf-card__link">查看 Vue 与站点 <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--craft" href="/web/other/newTechnology">
            <span class="shelf-card__mark">KIT</span>
            <span class="shelf-card__meta">4 篇工程笔记</span>
            <h3>接口与工程化</h3>
            <p>从 REST 资源建模到旧项目构建，把工具选择与维护边界讲明白。</p>
            <span class="shelf-card__link">查看工程化 <i aria-hidden="true">→</i></span>
          </a>
        </div>
      </section>

      <section class="field-recent" aria-labelledby="recent-title">
        <div class="recent-intro">
          <p class="field-kicker">START HERE</p>
          <h2 id="recent-title">三篇适合立即解决问题的笔记</h2>
          <p>每篇都从一个工作中的提问开始，先给判断，再给可复用的实现边界。</p>
        </div>
        <div class="recent-list">
          <a href="/web/vue/axios">
            <span>请求处理</span>
            <strong>如何把 Axios 从页面里拿出去？</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="/web/other/restful">
            <span>接口设计</span>
            <strong>资源、动作与 HTTP 方法怎样对应？</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="/web/css/BEM规范">
            <span>样式协作</span>
            <strong>BEM 到底解决了什么命名问题？</strong>
            <i aria-hidden="true">↗</i>
          </a>
        </div>
      </section>
    </main>

    <footer class="field-footer">
      <span>锦书致南终 · Frontend field notes</span>
      <span>为复用而记录，为理解而整理。</span>
    </footer>
  </div>
</template>
