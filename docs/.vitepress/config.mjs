import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '野塘漫水',
  description: '从浏览器到服务端，把真实开发经验整理成可复用的技术手记。',
  cleanUrls: true,
  appearance: false,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#123642' }],
    ['link', { rel: 'icon', href: '/icon/avatar.png' }]
  ],
  themeConfig: {
    logo: '/icon/avatar.png',
    siteTitle: '野塘漫水',
    outline: {
      level: [2, 3],
      label: '本页索引'
    },
    lastUpdated: {
      text: '最后整理于'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    nav: [
      { text: '笔记首页', link: '/' },
      { text: '前端', link: '/web/JavaScript/ES6' },
      { text: '后端', link: '/backend/overview' },
      { text: '工程化', link: '/engineering/toolchain' },
      { text: 'AI', link: '/ai/llm-basics' }
    ],
    sidebar: {
      '/web/JavaScript/': [
        {
          text: 'JavaScript 基础',
          items: [
            { text: 'ES6：作用域、模块与数据处理', link: '/web/JavaScript/ES6' },
            { text: '原型与继承', link: '/web/JavaScript/prototype' },
            { text: '闭包与作用域', link: '/web/JavaScript/closure' },
            { text: '异步流程与 Promise', link: '/web/JavaScript/async' },
            { text: '事件循环与执行模型', link: '/web/JavaScript/event-loop' },
            { text: 'TypeScript 的类型边界', link: '/web/JavaScript/types' }
          ]
        },
        {
          text: '工程实践',
          items: [
            { text: '浏览器与 DOM 操作', link: '/web/JavaScript/browser' },
            { text: '正则表达式实战', link: '/web/JavaScript/regex' },
            { text: '错误处理与异常', link: '/web/JavaScript/error-handling' },
            { text: '模块化演进', link: '/web/JavaScript/modules' }
          ]
        }
      ],
      '/web/vue/': [
        {
          text: 'Vue 与站点',
          items: [
            { text: 'Axios 请求层', link: '/web/vue/axios' },
            { text: '组件设计与状态边界', link: '/web/vue/component-design' },
            { text: '路由与页面状态', link: '/web/vue/router' },
            { text: '从 VuePress 到 VitePress', link: '/web/vue/vuepress' },
            { text: 'VitePress 内容能力', link: '/web/vue/vuepress-plugin' }
          ]
        },
        {
          text: '进阶与工程化',
          items: [
            { text: '组合式函数与逻辑复用', link: '/web/vue/composables' },
            { text: 'Pinia 状态管理', link: '/web/vue/pinia' },
            { text: 'Vue 性能优化', link: '/web/vue/performance' },
            { text: 'SSR 与 Nuxt 入门', link: '/web/vue/ssr' },
            { text: 'Vue 组件测试', link: '/web/vue/testing' }
          ]
        }
      ],
      '/web/css/': [
        {
          text: '布局',
          items: [
            { text: '响应式布局与容器', link: '/web/css/layout' },
            { text: 'Flexbox 弹性布局', link: '/web/css/flexbox' },
            { text: 'Grid 网格布局', link: '/web/css/grid' }
          ]
        },
        {
          text: '样式组织',
          items: [
            { text: 'BEM 命名规范', link: '/web/css/BEM规范' },
            { text: 'CSS 变量与主题系统', link: '/web/css/design-tokens' },
            { text: 'CSS 架构与组织', link: '/web/css/architecture' },
            { text: '现代 CSS 选择器', link: '/web/css/selectors' }
          ]
        },
        {
          text: '体验与性能',
          items: [
            { text: '动画与过渡', link: '/web/css/animation' },
            { text: 'CSS 性能优化', link: '/web/css/performance' },
            { text: '颜色与暗色模式', link: '/web/css/color-and-dark-mode' }
          ]
        }
      ],
      '/web/frontend/': [
        {
          text: '交互体验',
          items: [
            { text: '性能与加载体验', link: '/web/frontend/performance' },
            { text: '可访问性实战', link: '/web/frontend/accessibility' },
            { text: '表单设计与校验', link: '/web/frontend/form-design' },
            { text: '移动端适配', link: '/web/frontend/mobile' }
          ]
        },
        {
          text: '架构与工程',
          items: [
            { text: '前端状态管理', link: '/web/frontend/state-management' },
            { text: '浏览器兼容性', link: '/web/frontend/compatibility' },
            { text: '前端调试技巧', link: '/web/frontend/debugging' },
            { text: '前端与 SEO', link: '/web/frontend/seo' },
            { text: '构建工具选型', link: '/web/frontend/build-tools' },
            { text: 'React Native iOS 环境排查', link: '/web/frontend/reactNative' }
          ]
        }
      ],
      '/web/jQuery/': [
        {
          text: '历史工具',
          items: [{ text: 'jQuery：选择与遍历', link: '/web/jQuery/jQuery' }]
        }
      ],
      '/backend/': [
        {
          text: '后端全景',
          items: [
            { text: '后端服务如何组织', link: '/backend/overview' },
            { text: 'REST API 设计', link: '/backend/restful' },
            { text: 'API 版本管理', link: '/backend/api-versioning' },
            { text: '认证、授权与会话', link: '/backend/authentication' },
            { text: '错误处理与请求追踪', link: '/backend/error-handling' },
            { text: '服务边界与业务编排', link: '/backend/service-design' }
          ]
        },
        {
          text: '数据与可靠性',
          items: [
            { text: '数据库索引与事务', link: '/backend/database' },
            { text: '缓存策略与一致性', link: '/backend/cache' },
            { text: '消息队列与异步任务', link: '/backend/message-queue' },
            { text: '并发与限流', link: '/backend/concurrency' }
          ]
        }
      ],
      '/engineering/': [
        {
          text: '协作与交付',
          items: [
            { text: '前端工程化地图', link: '/engineering/toolchain' },
            { text: 'Git 协作与提交边界', link: '/engineering/git-workflow' },
            { text: '代码评审实践', link: '/engineering/code-review' },
            { text: 'API 契约与前后端联调', link: '/engineering/api-contract' },
            { text: '环境与配置管理', link: '/engineering/environment' }
          ]
        },
        {
          text: '质量与演进',
          items: [
            { text: '测试分层与回归保护', link: '/engineering/testing' },
            { text: '持续集成与发布', link: '/engineering/ci-delivery' },
            { text: '日志、指标与可观测性', link: '/engineering/observability' },
            { text: '技术债务治理', link: '/engineering/tech-debt' },
            { text: 'Gulp 4：维护旧项目', link: '/engineering/gulp' }
          ]
        }
      ],
      '/ai/': [
        {
          text: '基础理论',
          items: [
            { text: 'LLM 应用基础', link: '/ai/llm-basics' },
            { text: 'Prompt 工程实践', link: '/ai/prompt-engineering' },
            { text: '多模态应用入门', link: '/ai/multimodal' }
          ]
        },
        {
          text: '应用架构',
          items: [
            { text: 'Agent 架构与工具调用', link: '/ai/agent-architecture' },
            { text: 'RAG 检索增强生成', link: '/ai/rag' },
            { text: 'LLM 多模型选型与成本控制', link: '/ai/model-selection' },
            { text: 'LLM 评测与 Guardrails', link: '/ai/evaluation-guardrails' }
          ]
        },
        {
          text: '工程与产品',
          items: [
            { text: 'AI 辅助编码工作流', link: '/ai/ai-coding-workflow' },
            { text: 'LLM 应用安全', link: '/ai/security' },
            { text: 'AI 产品设计边界', link: '/ai/product-design' }
          ]
        }
      ]
    },
    footer: {
      message: '为复用而记录，为理解而整理。',
      copyright: 'MIT Licensed · Copyright © 2019–present qun ye'
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索笔记', buttonAriaLabel: '搜索笔记' },
          modal: {
            noResultsText: '没有找到相关内容',
            resetButtonTitle: '清除搜索',
            footerSelectText: '选择',
            footerNavigateText: '切换'
          }
        }
      }
    }
  }
})
