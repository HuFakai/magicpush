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
    return {
      volume: source.volume,
      audioUrl: source.audioUrl,
      playCount: source.playCount,
      playInterval: source.playInterval,
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
      const { title, type = 'text', extraData } = source;
      // content 可空：小爱音箱可仅传 audioUrl
      const content = source.content == null ? '' : source.content;
      const url = source.url || '';
      const misoundOverrides = PushController._extractMisoundOverrides(source);

      const result = await PushService.pushByToken(
        token,
        { title, content, type, url, extraData, ...misoundOverrides },
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
      const { title, type = 'text', extraData } = req.body;
      const content = req.body.content == null ? '' : req.body.content;
      const url = req.body.url || '';
      const misoundOverrides = PushController._extractMisoundOverrides(req.body);

      const result = await PushService.pushByEndpoint(
        endpointId,
        req.user.userId,
        { title, content, type, url, extraData, ...misoundOverrides },
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
      const { title, type = 'text', extraData } = req.body;
      const content = req.body.content == null ? '' : req.body.content;
      const url = req.body.url || '';
      const misoundOverrides = PushController._extractMisoundOverrides(req.body);

      const result = await PushService.pushByChannel(
        channelId,
        req.user.userId,
        { title, content, type, url, extraData, ...misoundOverrides },
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
