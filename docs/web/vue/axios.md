# vue的axios请求封装和异常拦截统一处理

```js

/** axios封装
 * 请求拦截、相应拦截、错误统一处理
 */

import axios from 'axios'
import notification from 'ant-design-vue/es/notification'

axios.defaults.timeout = 15000

// 环境的切换
if (process.env.NODE_ENV == 'development') {
  axios.defaults.baseURL = '/api'
} else if (process.env.NODE_ENV == 'production') {
  // 发布接口
  axios.defaults.baseURL = 'https://xxxx/xxx' // 接口地址
  // 测试接口
  // axios.defaults.baseURL = 'https://xxxx/xxx' 测试接口地址
}
axios.defaults.headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

// 响应拦截器
axios.interceptors.response.use(
  response => {
    if (response.status === 200) {
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  },
  // 服务器状态码不是200的情况
  error => {
    const data = error.response.data;
    if (error.response.status) {
      switch (error.response.status) {
        case 400:
          notification.error({ message: '请求错误', description: data.message })
          break;
        case 401:
          notification.error({ message: '未授权，请重新登录', description: data.message })
          break;
        case 403:
          notification.error({ message: '拒绝访问', description: data.message })
          break;
        case 404:
          notification.error({ message: '请求出错', description: data.message })
          break;
        case 408:
          notification.error({ message: '请求超时', description: data.message })
          break;
        case 500:
          notification.error({ message: '服务器错误', description: data.message })
          break;
        case 501:
          notification.error({ message: '服务未实现', description: data.message })
          break;
        case 502:
          notification.error({ message: '网络错误', description: data.message })
          break;
        case 503:
          notification.error({ message: '服务不可用', description: data.message })
          break;
        case 504:
          notification.error({ message: '网络超时', description: data.message })
          break;
        case 505:
          notification.error({ message: 'HTTP版本不受支持', description: data.message })
          break;
        default:
          notification.error({ message: '连接出错', description: data.message })
          break;
      }
    } else {
      notification.error({ message: '连接服务器失败' })
    }
    return Promise.reject(error.response)
  }
)

/**
 * 封装get方法
 * @param url
 * @param data
 * @returns {Promise}
 */

export function get(url, params = '') {
  return new Promise((resolve, reject) => {
    axios.get(url, {
      params: params
    })
      .then(response => {
        resolve(response.data)
      })
      .catch(err => {
        reject(err)
      })
  })
}

/**
 * 封装post请求
 * @param url
 * @param data
 * @returns {Promise}
 */

export function post(url, data = '') {
  return new Promise((resolve, reject) => {
    axios.post(url, data)
      .then(response => {
        resolve(response.data)
      }, err => {
        reject(err)
      })
  })
}

```