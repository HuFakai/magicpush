const PushService = require('../services/push.service');
const ResponseUtil = require('../utils/response');
const logger = require('../utils/logger');
const getRealIP = require('../utils/ip');

/**
 * 推送控制器
 */
class PushController {
  /**
   * 从请求源中提取小爱音箱可选覆盖字段（仅 misound 渠道识别，其他渠道忽略）
   */
  static _extractMisoundOverrides(source = {}) {
    return Object.fromEntries(
      ['volume', 'audioUrl', 'playCount', 'playInterval']
        .filter(key => source[key] !== undefined)
        .map(key => [key, source[key]])
    );
  }

  /**
   * 兼容旧版顶层 MiSound 参数，同时统一写入 extraData.misound。
   */
  static _buildMessage(source = {}) {
    let extraData = source.extraData;
    if (typeof extraData === 'string') {
      try {
        extraData = JSON.parse(extraData);
      } catch {
        throw new Error('extraData 必须是合法的 JSON 对象');
      }
    }
    if (extraData == null) extraData = {};
    if (typeof extraData !== 'object' || Array.isArray(extraData)) {
      throw new Error('extraData 必须是对象');
    }

    const misoundOverrides = this._extractMisoundOverrides(source);
    if (Object.keys(misoundOverrides).length > 0) {
      const existing = extraData.misound;
      extraData = {
        ...extraData,
        misound: {
          ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
          ...misoundOverrides,
        },
      };
    }

    return {
      title: source.title,
      content: source.content == null ? '' : source.content,
      type: source.type || 'text',
      url: source.url || '',
      extraData,
    };
  }

  /**
   * 通过接口令牌推送
   */
  static async pushByToken(req, res) {
    try {
      // 支持从 URL 路径或 Authorization 头获取 token
      let { token } = req.params;
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return ResponseUtil.badRequest(res, '缺少接口令牌');
      }

      // 支持 POST body 或 GET query 参数
      const source = req.method === 'GET' ? req.query : req.body;
      const message = PushController._buildMessage(source);

      const result = await PushService.pushByToken(
        token,
        message,
        getRealIP(req),
        req.requestId
      );

      if (result.success) {
        return ResponseUtil.success(res, result, '推送成功');
      } else {
        return ResponseUtil.error(res, '部分推送失败', 400, 400, result);
      }
    } catch (error) {
      logger.error('推送失败:', error);
      return ResponseUtil.badRequest(res, error.message);
    }
  }

  /**
   * 通过接口ID推送
   */
  static async pushByEndpoint(req, res) {
    try {
      const endpointId = parseInt(req.params.endpointId);
      const message = PushController._buildMessage(req.body);

      const result = await PushService.pushByEndpoint(
        endpointId,
        req.user.userId,
        message,
        getRealIP(req),
        req.requestId
      );

      if (result.success) {
        return ResponseUtil.success(res, result, '推送成功');
      } else {
        return ResponseUtil.error(res, '部分推送失败', 400, 400, result);
      }
    } catch (error) {
      if (error.message === '接口不存在') {
        return ResponseUtil.notFound(res, error.message);
      }
      logger.error('推送失败:', error);
      return ResponseUtil.badRequest(res, error.message);
    }
  }

  /**
   * 通过渠道ID推送
   */
  static async pushByChannel(req, res) {
    try {
      const channelId = parseInt(req.params.channelId);
      const message = PushController._buildMessage(req.body);

      const result = await PushService.pushByChannel(
        channelId,
        req.user.userId,
        message,
        getRealIP(req),
        req.requestId
      );

      if (result.success) {
        return ResponseUtil.success(res, result, '推送成功');
      } else {
        return ResponseUtil.error(res, '推送失败', 400, 400, result);
      }
    } catch (error) {
      if (error.message === '渠道不存在') {
        return ResponseUtil.notFound(res, error.message);
      }
      logger.error('推送失败:', error);
      return ResponseUtil.badRequest(res, error.message);
    }
  }
}

module.exports = PushController;
