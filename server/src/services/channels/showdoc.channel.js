const axios = require('axios');
const BaseChannel = require('./base.channel');
const { resolveSafeHttpUrl, parseHttpUrl } = require('../../utils/safeUrl');

/**
 * ShowDoc 适配器
 * 通过 ShowDoc 推送接口将消息推送到 ShowDoc 文档平台
 * 用户只需提供专属推送 URL（含 token），POST title + content 即可
 */
class ShowDocChannel extends BaseChannel {
  constructor(config) {
    super(config);
    this.url = config.url;
  }

  async send(message) {
    const safeTarget = await resolveSafeHttpUrl(this.url);
    const { title, content } = message;
    const response = await axios.post(
      this.url,
      { title: title || '通知', content },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
        maxRedirects: 0,
        maxContentLength: 1024 * 1024,
        lookup: safeTarget.lookup,
        transformRequest: [(data) => {
          const params = new URLSearchParams();
          for (const key in data) {
            params.append(key, data[key]);
          }
          return params.toString();
        }],
      }
    );

    const { error_code, error_message } = response.data;
    if (error_code !== 0) {
      throw new Error(`ShowDoc推送失败: ${error_message}`);
    }

    return { success: true };
  }

  validate(config) {
    if (!config.url || config.url.trim() === '') {
      return { valid: false, message: '推送URL不能为空' };
    }
    try {
      parseHttpUrl(config.url);
    } catch (error) {
      return { valid: false, message: error.message };
    }
    return { valid: true, message: '' };
  }

  async test() {
    try {
      await this.send({
        title: '测试消息',
        content: '这是一条来自魔法推送的测试消息',
        type: 'text',
      });
      return { success: true, message: '连接测试成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  static getName() {
    return 'ShowDoc';
  }

  static getDescription() {
    return 'ShowDoc文档推送，将消息推送到ShowDoc文档平台';
  }

  static getConfigFields() {
    return [
      {
        name: 'url',
        label: '推送URL',
        type: 'text',
        required: true,
        placeholder: 'https://push.showdoc.com.cn/server/api/push/your_token',
        description: 'ShowDoc提供的专属推送地址，包含认证信息',
      },
      {
        name: 'docs',
        type: 'links',
        links: [
          { label: 'ShowDoc推送文档', url: 'https://www.showdoc.com.cn/push' },
        ],
      },
    ];
  }
}

module.exports = ShowDocChannel;
