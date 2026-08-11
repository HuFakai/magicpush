/**
 * 小爱音箱渠道控制器
 *
 * 提供扫码登录、设备列表查询、绑定确认等接口
 * 无状态设计：会话数据由 xiaomi-auth.service 统一管理
 */

const XiaomiAuthService = require('../services/xiaomi-auth.service');
const { createSession, getSession, deleteSession } = require('../services/xiaomi-auth.service');
const ChannelService = require('../services/channel.service');
const ResponseUtil = require('../utils/response');
const logger = require('../utils/logger');
const MisoundAudioService = require('../services/misound-audio.service');

function getPublicBaseUrl(req) {
  const configuredBaseUrl = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
        return parsed.toString().replace(/\/$/, '');
      }
      logger.warn('[Misound] PUBLIC_BASE_URL 必须是不含凭据的 http(s) 地址，已回退请求地址');
    } catch {
      logger.warn('[Misound] PUBLIC_BASE_URL 格式无效，已回退请求地址');
    }
  }
  return `${req.protocol}://${req.get('host')}`;
}

class MisoundController {
  /**
   * 上传小爱音箱在线音频。文件存入持久化数据目录并返回公开访问地址。
   */
  static async uploadAudio(req, res) {
    try {
      const audio = await MisoundAudioService.saveAudio(req.user.userId, req.body);
      const url = `${getPublicBaseUrl(req)}${audio.relativeUrl}`;
      logger.info(`[Misound] 用户 ${req.user.userId} 上传音频成功: ${audio.filename}`);
      return ResponseUtil.created(res, {
        url,
        filename: audio.filename,
        mimeType: audio.mimeType,
        size: audio.size,
      }, '音频上传成功');
    } catch (error) {
      logger.warn(`[Misound] 音频上传失败: ${error.message}`);
      return ResponseUtil.badRequest(res, error.message);
    }
  }

  /**
   * 公开提供已上传音频，供小爱音箱按 URL 拉取；UUID 文件名承担不可猜测性。
   */
  static async serveAudio(req, res, next) {
    try {
      const audio = await MisoundAudioService.getAudioFile(req.params.userId, req.params.filename);
      res.set({
        'Content-Type': audio.mimeType,
        'Content-Length': audio.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*',
      });
      return res.sendFile(audio.filePath, error => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return ResponseUtil.notFound(res, '音频文件不存在');
      }
      return ResponseUtil.badRequest(res, error.message);
    }
  }

  /**
   * 初始化扫码登录
   *
   * POST /api/channels/misound/qr/init
   *
   * 返回二维码 URL 和 sessionId（用于后续轮询）
   */
  static async initQRLogin(req, res) {
    try {
      const qrData = await XiaomiAuthService.initQRLogin();

      // 通过 Service 层创建会话（包含数量上限保护）
      const sessionId = createSession({
        lpUrl: qrData.lpUrl,
        cookies: qrData.cookies,
      });

      return ResponseUtil.success(res, {
        sessionId,
        qrCodeUrl: qrData.qrCodeUrl,
        loginUrl: qrData.loginUrl,
        timeout: qrData.timeout,
      }, '获取二维码成功');
    } catch (error) {
      logger.error('[Misound] 获取扫码二维码失败:', error.message);
      return ResponseUtil.serverError(res, '获取二维码失败: ' + error.message);
    }
  }

  /**
   * 轮询扫码状态
   *
   * GET /api/channels/misound/qr/status?sessionId=xxx
   *
   * 长轮询等待用户扫码结果，成功后返回 userId 和 passToken
   */
  static async pollQRStatus(req, res) {
    try {
      const { sessionId } = req.query;
      if (!sessionId) {
        return ResponseUtil.badRequest(res, 'sessionId 参数不能为空');
      }

      // 通过 Service 层获取会话（自动检查过期）
      const session = getSession(sessionId);
      if (!session) {
        return ResponseUtil.badRequest(res, '会话已过期，请重新获取二维码');
      }

      // 调用小米 API 长轮询
      const result = await XiaomiAuthService.completeLogin(session.lpUrl, session.cookies);

      if (result.status === 'confirmed') {
        // 登录成功，通过 Service 层清理会话
        deleteSession(sessionId);

        return ResponseUtil.success(res, {
          status: 'confirmed',
          userId: result.userId,
          passToken: result.passToken,
        });
      }

      // 未扫码或失败
      return ResponseUtil.success(res, {
        status: result.status,
        message: result.message || '',
      });
    } catch (error) {
      logger.error('[Misound] 轮询扫码状态失败:', error.message);
      return ResponseUtil.serverError(res, '查询扫码状态失败: ' + error.message);
    }
  }

  /**
   * 从请求体中提取小爱音箱扩展播放配置
   * 空值保持为空，由渠道 validate 与 send 侧做默认处理
   */
  static _extractPlaybackConfig(body = {}) {
    return {
      startVolume: body.startVolume,
      endVolume: body.endVolume,
      playCount: body.playCount,
      playInterval: body.playInterval,
      audioUrl: body.audioUrl,
      endVolumeDelay: body.endVolumeDelay,
    };
  }

  /**
   * 确认绑定并创建渠道
   *
   * POST /api/channels/misound/qr/confirm
   *
   * 使用扫码获取的凭证和用户手动输入的设备名称创建 Misound 渠道
   */
  static async confirmBind(req, res) {
    try {
      const { userId, passToken, did, name, ttsMode } = req.body;
      const playbackConfig = MisoundController._extractPlaybackConfig(req.body);

      if (!userId || !passToken) {
        return ResponseUtil.badRequest(res, '缺少登录凭证');
      }
      if (!did) {
        return ResponseUtil.badRequest(res, '请输入设备名称');
      }

      // 创建渠道，配置中存储扫码获取的凭证与播放增强参数
      const channel = await ChannelService.createChannel(req.user.userId, {
        channelType: 'misound',
        name: name || '小爱音箱',
        config: {
          userId,
          passToken,
          did,
          ttsMode: ttsMode || 'auto',
          ...playbackConfig,
        },
      });

      logger.info(`[Misound] 用户 ${req.user.userId} 扫码绑定成功: did=${did}`);

      return ResponseUtil.created(res, channel, '绑定成功');
    } catch (error) {
      logger.error('[Misound] 绑定失败:', error.message);
      // 细化错误分类：渠道不存在返回 404，其他业务错误返回 400
      if (error.message.includes('不存在') || error.message.includes('无权')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.badRequest(res, error.message);
    }
  }

  /**
   * 重新绑定已有渠道
   *
   * PUT /api/channels/misound/qr/:channelId/rebind
   *
   * 使用新的扫码凭证更新已有渠道的配置
   */
  static async rebindChannel(req, res) {
    try {
      const channelId = parseInt(req.params.channelId);
      const { userId, passToken, did, name, ttsMode } = req.body;
      const playbackConfig = MisoundController._extractPlaybackConfig(req.body);

      if (!userId || !passToken) {
        return ResponseUtil.badRequest(res, '缺少登录凭证');
      }

      const channel = await ChannelService.updateChannel(channelId, req.user.userId, {
        ...(name !== undefined ? { name: String(name).trim() || '小爱音箱' } : {}),
        config: {
          userId,
          passToken,
          did: did || '',
          ttsMode: ttsMode || 'auto',
          ...playbackConfig,
        },
      });

      logger.info(`[Misound] 用户 ${req.user.userId} 重新绑定渠道 ${channelId}`);

      return ResponseUtil.success(res, channel, '重新绑定成功');
    } catch (error) {
      if (error.message === '渠道不存在') {
        return ResponseUtil.notFound(res, error.message);
      }
      logger.error('[Misound] 重新绑定失败:', error.message);
      return ResponseUtil.badRequest(res, error.message);
    }
  }
}

module.exports = MisoundController;
