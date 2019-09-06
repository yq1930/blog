module.exports = {
  title: '锦书致南终',
  description: 'The lazier you are, the more likely you will miss the people and things you like.',
  head: [
    ['link', { rel: 'icon', href: 'image/给大佬端茶.png' }],
  ],
  base: '/',
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    sidebarDepth: 2,
    lastUpdated: 'Last Updated',
    collapsable: true,
    displayAllHeaders: true,
    activeHeaderLinks: false,
    nav: [
      { text: '首页', link: '/' },
      { text: '语雀', link: 'https://www.yuque.com/yq1930/omowl7' },
      { text: 'GitHub', link: 'https://github.com/yq1930' },
      {
        text: 'English', items: [
          { text: '单词', link: 'https://translate.google.com' }
        ]
      },
    ],
    sidebar: [
      {
        title: '前端知识库',
        collapsable: false,
        children: [
          {
            title: 'Vue',
            children: [
              ['/web/vue/axios', 'Axios'],
              ['/web/vue/vuepress', 'VuePress'],
            ]
          },
          {
            title: 'CSS',
            children: [
              ['/web/css/bem', 'BEM规范'],
            ]
          },
          {
            title: '其他方面',
            children: [
              ['/web/other/newTechnology', '最新技术'],
              ['/web/other/reactNative', 'ReactNavtive'],
              ['/web/other/gulp', 'Gulp4.0'],
              ['/web/other/restful', 'Restful接口'],
            ]
          }
        ]
      }
    ]
  }
};


