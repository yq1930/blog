import { defineConfig } from "vitepress";

// VitePress 配置（自 VuePress 1.x 迁移）：导航/侧边栏/内容结构 1:1 保留
export default defineConfig({
  title: "锦书致南终",
  description:
    "The lazier you are, the more likely you will miss the people and things you like.",
  head: [["link", { rel: "icon", href: "/icon/avatar.png" }]],
  // 干净 URL（/web/vue/axios 而非 .html），与旧 VuePress 链接保持一致， gh-pages 直接支持
  cleanUrls: true,
  markdown: {
    lineNumbers: true,
  },
  // 基于 git 提交时间的「上次更新」，替代旧 @vuepress/last-updated + moment
  lastUpdated: true,
  themeConfig: {
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    lastUpdated: {
      text: "上次更新",
    },
    nav: [
      { text: "首页", link: "/" },
      { text: "语雀", link: "https://www.yuque.com/yq1930/omowl7" },
      { text: "GitHub", link: "https://github.com/yq1930" },
      {
        text: "English",
        items: [{ text: "单词", link: "https://translate.google.com" }],
      },
    ],
    sidebar: [
      {
        text: "JavaScript",
        collapsed: false,
        items: [
          {
            text: "JS",
            items: [
              { text: "ES6", link: "/web/JavaScript/ES6" },
              { text: "原型继承", link: "/web/JavaScript/prototype" },
              { text: "浏览器", link: "/web/JavaScript/browser" },
            ],
          },
          {
            text: "CSS",
            items: [{ text: "BEM规范", link: "/web/css/BEM规范" }],
          },
        ],
      },
      {
        text: "框架",
        collapsed: false,
        items: [
          {
            text: "Vue",
            items: [
              { text: "Axios", link: "/web/vue/axios" },
              { text: "VuePress", link: "/web/vue/vuepress" },
              { text: "VuePress插件", link: "/web/vue/vuepress-plugin" },
            ],
          },
          {
            text: "jQuery",
            items: [{ text: "jQuery", link: "/web/jQuery/jQuery" }],
          },
        ],
      },
      {
        text: "其他",
        collapsed: false,
        items: [
          { text: "最新技术", link: "/web/other/newTechnology" },
          { text: "React Native", link: "/web/other/reactNative" },
          { text: "Gulp4.0", link: "/web/other/gulp" },
          { text: "Restful接口", link: "/web/other/restful" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/yq1930" }],
    footer: {
      message: "MIT Licensed",
      copyright: "Copyright © 2019-present qun ye",
    },
  },
});
