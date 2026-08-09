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
            { text: '浏览器与 DOM 操作', link: '/web/JavaScript/browser' },
            { text: '原型与继承', link: '/web/JavaScript/prototype' },
            { text: '异步流程与 Promise', link: '/web/JavaScript/async' },
            { text: 'TypeScript 的类型边界', link: '/web/JavaScript/types' }
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
        }
      ],
      '/web/css/': [
        {
          text: '样式组织',
          items: [
            { text: 'BEM 命名规范', link: '/web/css/BEM规范' },
            { text: '响应式布局与容器', link: '/web/css/layout' }
          ]
        }
      ],
      '/web/frontend/': [
        {
          text: '前端体验',
          items: [
            { text: '性能与加载体验', link: '/web/frontend/performance' },
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
            { text: '认证、授权与会话', link: '/backend/authentication' },
            { text: '错误处理与请求追踪', link: '/backend/error-handling' },
            { text: '服务边界与业务编排', link: '/backend/service-design' },
            { text: '数据库索引与事务', link: '/backend/database' },
            { text: '缓存策略与一致性', link: '/backend/cache' }
          ]
        }
      ],
      '/engineering/': [
        {
          text: '协作与交付',
          items: [
            { text: '前端工程化地图', link: '/engineering/toolchain' },
            { text: 'Git 协作与提交边界', link: '/engineering/git-workflow' },
            { text: '测试分层与回归保护', link: '/engineering/testing' },
            { text: '持续集成与发布', link: '/engineering/ci-delivery' },
            { text: '日志、指标与可观测性', link: '/engineering/observability' },
            { text: 'Gulp 4：维护旧项目', link: '/engineering/gulp' }
          ]
        }
      ],
      '/ai/': [
        {
          text: 'AI 与 Agent',
          items: [
            { text: 'LLM 应用基础', link: '/ai/llm-basics' },
            { text: 'Prompt 工程实践', link: '/ai/prompt-engineering' },
            { text: 'Agent 架构与工具调用', link: '/ai/agent-architecture' },
            { text: 'RAG 检索增强生成', link: '/ai/rag' }
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
