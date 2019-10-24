module.exports = {
  title: "锦书致南终",
  description:
    "The lazier you are, the more likely you will miss the people and things you like.",
  head: [["link", { rel: "icon", href: "icon/avatar.jpg" }]],
  base: "/",
  markdown: {
    lineNumbers: true
  },
  plugins: [
    // 最后更新时间
    [
      "@vuepress/last-updated",
      {
        transformer: (timestamp, lang) => {
          // 不要忘了安装 moment
          const moment = require("moment");
          moment.locale(lang);
          return moment(timestamp).format("YYYY-MM-DD HH:mm");
        }
      }
    ]
  ],
  themeConfig: {
    sidebarDepth: 2,
    lastUpdated: "上次更新",
    collapsable: true,
    displayAllHeaders: true,
    activeHeaderLinks: false,
    nav: [
      { text: "首页", link: "/" },
      { text: "语雀", link: "https://www.yuque.com/yq1930/omowl7" },
      { text: "GitHub", link: "https://github.com/yq1930" },
      {
        text: "English",
        items: [{ text: "单词", link: "https://translate.google.com" }]
      }
    ],
    sidebar: [
      {
        title: "前端知识库",
        collapsable: false,
        children: [
          {
            title: "Vue",
            collapsable: false,
            children: [
              ["/web/vue/axios", "Axios"],
              ["/web/vue/vuepress", "VuePress"],
              ["/web/vue/vuepress-plugin", "VuePress插件用法"]
            ]
          },
          {
            title: "CSS",
            collapsable: false,
            children: [["/web/css/bem", "BEM规范"]]
          },
          {
            title: "JavaScript",
            collapsable: false,
            children: [
              ["/web/JavaScript/ES6", "ES6"],
              ["/web/JavaScript/prototype", "原型继承"]
            ]
          },
          {
            title: "其他",
            collapsable: false,
            children: [
              ["/web/other/newTechnology", "最新技术"],
              ["/web/other/reactNative", "ReactNavtive"],
              ["/web/other/gulp", "Gulp4.0"],
              ["/web/other/restful", "Restful接口"]
            ]
          }
        ]
      }
    ]
  }
};
