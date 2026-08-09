<template>
  <div class="field-home">
    <header class="field-nav">
      <a class="field-brand" href="/" aria-label="返回野塘漫水首页">
        <img src="/icon/avatar.png" alt="" width="36" height="36" />
        <span>野塘漫水</span>
      </a>
      <nav aria-label="主导航">
        <a href="#library">文章索引</a>
        <a href="/web/JavaScript/ES6">前端</a>
        <a href="/backend/overview">后端</a>
        <a href="/ai/llm-basics">AI</a>
      </nav>
    </header>

    <main>
      <section class="field-hero" aria-labelledby="home-title">
        <div class="field-hero__copy">
          <p class="field-kicker">YETANG TECH NOTES <span>持续整理中</span></p>
          <h1 id="home-title">从浏览器到服务端，<br />把现场经验整理成可复用的手记。</h1>
          <p class="field-lede">这里不是按技术名词堆砌的收藏夹，而是围绕开发现场整理的工作手记：先理解系统如何运作，再找到眼下问题可以落地的解法。</p>
          <div class="field-actions">
            <a class="field-button field-button--primary" href="/web/JavaScript/ES6">从前端基础开始 <span aria-hidden="true">→</span></a>
            <a class="field-button field-button--quiet" href="#library">按分类阅读</a>
          </div>
        </div>

        <aside class="route-card" aria-label="推荐学习路线">
          <div class="route-card__head">
            <span>推荐学习路线</span>
            <strong>04</strong>
          </div>
          <ol>
            <li>
              <span>01</span>
              <a href="/web/JavaScript/ES6"><b>理解运行环境</b><small>语言、浏览器与样式基础</small></a>
            </li>
            <li>
              <span>02</span>
              <a href="/web/vue/component-design"><b>构建前端应用</b><small>组件、路由、数据与性能</small></a>
            </li>
            <li>
              <span>03</span>
              <a href="/backend/overview"><b>连接后端服务</b><small>接口、认证、数据与缓存</small></a>
            </li>
            <li>
              <span>04</span>
              <a href="/engineering/git-workflow"><b>稳定交付与维护</b><small>协作、测试、发布与观测</small></a>
            </li>
          </ol>
          <p class="route-card__note">按当前问题取用，不必按顺序完成。</p>
        </aside>
      </section>

      <section id="library" class="field-library" aria-labelledby="library-title">
        <div class="section-heading">
          <p class="field-kicker">KNOWLEDGE SHELF</p>
          <h2 id="library-title">沿着系统的边界阅读</h2>
          <p>从用户看得见的页面，一直读到服务、数据与交付流程。每一类文章都说明它解决什么问题，以及与上下游如何衔接。</p>
        </div>

        <div class="shelf-grid">
          <a class="shelf-card shelf-card--js" href="/web/JavaScript/ES6">
            <span class="shelf-card__mark">WEB</span>
            <span class="shelf-card__meta">8 篇 · 语言与界面</span>
            <h3>前端基础</h3>
            <p>从 JavaScript、浏览器和 CSS 起步，建立对页面运行、状态变化和响应式布局的可靠直觉。</p>
            <span class="shelf-card__link">阅读前端基础 <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--vue" href="/web/vue/component-design">
            <span class="shelf-card__mark">APP</span>
            <span class="shelf-card__meta">7 篇 · 组件与体验</span>
            <h3>前端应用</h3>
            <p>把组件边界、路由状态、请求层与加载体验组织成用户真正能完成任务的页面，并覆盖跨端环境的排查经验。</p>
            <span class="shelf-card__link">阅读前端应用 <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--server" href="/backend/overview">
            <span class="shelf-card__mark">API</span>
            <span class="shelf-card__meta">7 篇 · 服务与接口</span>
            <h3>后端与接口</h3>
            <p>梳理请求如何穿过认证、业务服务和数据层，并让错误、权限与资源模型有一致语义。</p>
            <span class="shelf-card__link">阅读后端笔记 <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--data" href="/engineering/toolchain">
            <span class="shelf-card__mark">FLOW</span>
            <span class="shelf-card__meta">6 篇 · 协作与交付</span>
            <h3>数据与工程化</h3>
            <p>从工程化地图、提交边界到测试、发布与可观测性，把“能运行”推进到“可长期维护”。</p>
            <span class="shelf-card__link">阅读工程化笔记 <i aria-hidden="true">→</i></span>
          </a>
          <a class="shelf-card shelf-card--ai" href="/ai/llm-basics">
            <span class="shelf-card__mark">AI</span>
            <span class="shelf-card__meta">4 篇 · 模型与应用</span>
            <h3>AI 与 Agent</h3>
            <p>从大语言模型的生成本质出发，理解 Prompt、工具调用与检索增强，把模型能力落到可工程化的应用里。</p>
            <span class="shelf-card__link">阅读 AI 笔记 <i aria-hidden="true">→</i></span>
          </a>
        </div>
      </section>

      <section class="field-recent" aria-labelledby="recent-title">
        <div class="recent-intro">
          <p class="field-kicker">START WITH A QUESTION</p>
          <h2 id="recent-title">从一个真实问题开始</h2>
          <p>每篇文章都先明确判断边界，再给出可以复用的实现方式和检查清单。</p>
        </div>
        <div class="recent-list">
          <a href="/web/vue/axios">
            <span>前端数据</span>
            <strong>如何把请求逻辑从页面组件里拿出去？</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="/backend/authentication">
            <span>访问控制</span>
            <strong>认证、授权和会话分别该放在哪里？</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="/engineering/testing">
            <span>质量保护</span>
            <strong>哪些行为值得用自动化测试守住？</strong>
            <i aria-hidden="true">↗</i>
          </a>
        </div>
      </section>
    </main>

    <footer class="field-footer">
      <span>野塘漫水 · 技术手记</span>
      <span>从问题出发，为复用而记录。</span>
    </footer>
  </div>
</template>
