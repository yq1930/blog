module.exports = {
  title: '给大佬端茶',
  description: '给大佬端茶',
  head: [
    ['link', { rel: 'icon', href: '/image/给大佬端茶.png' }],
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
      { text: '语雀', link: 'https://www.yuque.com/dashboard/books' },
      { text: 'GitHub', link: 'https://github.com/yq1930' },
      {
        text: 'English', items: [
          { text: '单词', link: 'https://translate.google.com' }
        ]
      },
    ],
    sidebar: [
      {
        title: '前端',
        collapsable: false,
        children: [
          ['/web/html', '超文本标记'],
          ['/web/css', '层叠样式表'],
          ['/web/js', '解释型编程语言']
        ]
      }
    ]
  }
};


