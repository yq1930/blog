## plugin-last-updated插件

- [VuePress 文档 @vuepress/plugin-last-updated 插件介绍](https://vuepress.vuejs.org/zh/plugin/official/plugin-last-updated.html#%E4%BD%BF%E7%94%A8)

- 具体用法:

  1. `yarn add moment`
  2. docs/.vuepress/config.js 中

  ```js
  module.exports = {
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
            // moment用法 具体 google / baidu
          }
        }
      ]
    ],
    themeConfig: {
      // 自定义
      lastUpdated: "上次更新"
    }
  };
  ```
  #### 未完待续...
