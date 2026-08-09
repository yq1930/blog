import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '锦书致南终',
  description: '把零散的前端经验，整理成下一次可直接查阅的路标。',
  cleanUrls: true,
  appearance: false,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#123642' }],
    ['link', { rel: 'icon', href: '/icon/avatar.png' }]
  ],
  themeConfig: {
    logo: '/icon/avatar.png',
    siteTitle: '锦书致南终',
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
    editLink: {
      pattern: 'https://github.com/yq1930/blog/edit/master/docs/:path',
      text: '在 GitHub 上改进这篇笔记'
    },
    nav: [
      { text: '笔记首页', link: '/' },
      { text: 'JavaScript', link: '/web/JavaScript/ES6' },
      { text: 'Vue', link: '/web/vue/axios' },
      { text: '工程化', link: '/web/other/newTechnology' }
    ],
    sidebar: {
      '/web/JavaScript/': [
        {
          text: 'JavaScript 基础',
          items: [
            { text: 'ES6：作用域、模块与数据处理', link: '/web/JavaScript/ES6' },
            { text: '浏览器与 DOM 操作', link: '/web/JavaScript/browser' },
            { text: '原型与继承', link: '/web/JavaScript/prototype' }
          ]
        }
      ],
      '/web/vue/': [
        {
          text: 'Vue 与站点',
          items: [
            { text: 'Axios 请求层', link: '/web/vue/axios' },
            { text: '从 VuePress 到 VitePress', link: '/web/vue/vuepress' },
            { text: 'VitePress 内容能力', link: '/web/vue/vuepress-plugin' }
          ]
        }
      ],
      '/web/css/': [
        {
          text: '样式组织',
          items: [{ text: 'BEM 命名规范', link: '/web/css/BEM规范' }]
        }
      ],
      '/web/jQuery/': [
        {
          text: '历史工具',
          items: [{ text: 'jQuery：选择与遍历', link: '/web/jQuery/jQuery' }]
        }
      ],
      '/web/other/': [
        {
          text: '工程化与接口',
          items: [
            { text: '前端工程化地图', link: '/web/other/newTechnology' },
            { text: 'REST API 设计', link: '/web/other/restful' },
            { text: 'Gulp 4：维护旧项目', link: '/web/other/gulp' },
            { text: 'React Native iOS 环境排查', link: '/web/other/reactNative' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/yq1930' }],
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
