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
    sidebarDepth: 3,
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
        items: [{ text: "Google翻译", link: "https://translate.google.com" }]
      }
    ],
    sidebar: [
      {
        title: "JavaScript",
        collapsable: false,
        children: [
          {
            title: "JS",
            children: [
              ["/web/JavaScript/ES6", "ES6"],
              ["/web/JavaScript/prototype", "原型继承"],
              ["/web/JavaScript/browser", "浏览器"]
            ]
          },
          {
            title: "CSS",
            children: [["/web/css/BEM规范", "BEM规范"]]
          }
        ]
      },
      {
        title: "框架",
        collapsable: false,
        children: [
          {
            title: "Vue",
            children: [
              ["/web/vue/axios", "Axios"],
              ["/web/vue/vuepress", "VuePress"],
              ["/web/vue/vuepress-plugin", "VuePress插件"]
            ]
          },
          {
            title: "jQuery",
            children: [["/web/jQuery/jQuery", "jQuery"]]
          }
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
};
