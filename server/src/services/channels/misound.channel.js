const BaseChannel = require('./base.channel');
const logger = require('../../utils/logger');

let speakerModule = null;

/** 播放次数上限，避免推送请求长时间阻塞 */
const MAX_PLAY_COUNT = 10;
/** 播放间隔上限（秒） */
const MAX_PLAY_INTERVAL_SECONDS = 300;
/** 结束音量前默认短延迟（毫秒），用作无法估算时长时的兜底 */
const DEFAULT_END_VOLUME_DELAY_MS = 1500;
/** 估算 TTS 语速（字符/秒），用于结束音量前等待播完 */
const TTS_CHARS_PER_SECOND = 5;
/** 估算时长上限（毫秒），避免极端长文本导致长时间阻塞 */
const ESTIMATED_DURATION_LIMIT_MS = 60 * 1000;

/**
 * 延迟加载 xiaoii speaker 模块（ESM 动态 import 兼容）
 */
function getSpeaker() {
  if (!speakerModule) {
    speakerModule = require('xiaoii/lib/speaker');
  }
  return speakerModule;
}

/**
 * 异步等待指定毫秒
 * @param {number} milliseconds
 */
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 判断配置值是否视为「未设置」
 * @param {*} value
 * @returns {boolean}
 */
function isEmptyConfigValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * 规范化音量：空值返回 null；有值须为 0-100 整数
 * @param {*} value
 * @param {string} fieldLabel
 * @returns {{ ok: boolean, value?: number|null, message?: string }}
 */
function normalizeVolumeValue(value, fieldLabel) {
  if (isEmptyConfigValue(value)) {
    return { ok: true, value: null };
  }
  const numericVolume = Number(typeof value === 'string' ? value.trim() : value);
  // 允许 "90" 这类表单字符串，拒绝 90.5 等小数
  if (!Number.isFinite(numericVolume) || Math.floor(numericVolume) !== numericVolume) {
    return { ok: false, message: `${fieldLabel}必须是 0-100 的整数` };
  }
  if (numericVolume < 0 || numericVolume > 100) {
    return { ok: false, message: `${fieldLabel}必须在 0-100 之间` };
  }
  return { ok: true, value: numericVolume };
}

/**
 * 规范化播放次数：空值默认 1；须为 1-MAX 整数
 * @param {*} value
 * @returns {{ ok: boolean, value?: number, message?: string }}
 */
function normalizePlayCountValue(value) {
  if (isEmptyConfigValue(value)) {
    return { ok: true, value: 1 };
  }
  const numericCount = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(numericCount) || Math.floor(numericCount) !== numericCount) {
    return { ok: false, message: '播放次数必须是正整数' };
  }
  if (numericCount < 1) {
    return { ok: false, message: '播放次数至少为 1' };
  }
  if (numericCount > MAX_PLAY_COUNT) {
    return { ok: false, message: `播放次数不能超过 ${MAX_PLAY_COUNT}` };
  }
  return { ok: true, value: numericCount };
}

/**
 * 规范化播放间隔（秒）：空值默认 0
 * @param {*} value
 * @returns {{ ok: boolean, value?: number, message?: string }}
 */
function normalizePlayIntervalValue(value) {
  if (isEmptyConfigValue(value)) {
    return { ok: true, value: 0 };
  }
  const numericInterval = Number(value);
  if (!Number.isFinite(numericInterval) || numericInterval < 0) {
    return { ok: false, message: '播放间隔必须是大于等于 0 的数字（单位：秒）' };
  }
  if (numericInterval > MAX_PLAY_INTERVAL_SECONDS) {
    return { ok: false, message: `播放间隔不能超过 ${MAX_PLAY_INTERVAL_SECONDS} 秒` };
  }
  return { ok: true, value: numericInterval };
}

/**
 * 规范化在线音频 URL：空值返回空串；有值须为 http(s)
 * @param {*} value
 * @returns {{ ok: boolean, value?: string, message?: string }}
 */
function normalizeAudioUrlValue(value) {
  if (isEmptyConfigValue(value)) {
    return { ok: true, value: '' };
  }
  const audioUrl = String(value).trim();
  if (!/^https?:\/\//i.test(audioUrl)) {
    return { ok: false, message: '在线音频地址必须以 http:// 或 https:// 开头' };
  }
  return { ok: true, value: audioUrl };
}

/**
 * 小爱音箱（MiSound）渠道适配器
 *
 * 通过 xiaoii 底层 Speaker 模块调用 TTS / 在线音频 / 音量接口。
 * 支持开始/结束音量、播放次数与间隔、在线音频优先于 TTS。
 *
 * GitHub: https://github.com/xvhuan/xiaoi
 */
class MisoundChannel extends BaseChannel {
  /**
   * @param {Object} config - 渠道配置
   * @param {string} config.userId - 小米 ID（数字）
   * @param {string} [config.passToken] - passToken（推荐）
   * @param {string} [config.password] - 密码（不推荐）
   * @param {string} config.did - 音箱设备标识或名称
   * @param {string} [config.ttsMode] - TTS 模式：auto/command/default
   * @param {number|string|null} [config.startVolume] - 开始音量 0-100，空=不调
   * @param {number|string|null} [config.endVolume] - 结束音量 0-100，空=不调
   * @param {number|string} [config.playCount] - 播放次数，默认 1
   * @param {number|string} [config.playInterval] - 播放间隔（秒），默认 0
   * @param {number|string} [config.endVolumeDelay] - 结束音量前等待秒数，空=自动估算
   * @param {string} [config.audioUrl] - 在线音频 URL，有值则播音频而非 TTS
   * @param {number} channelId - 渠道记录 ID
   */
  constructor(config, channelId) {
    super(config);
    this.userId = config.userId;
    this.passToken = config.passToken || '';
    this.password = config.password || '';
    this.did = config.did || '';
    this.ttsMode = config.ttsMode || 'auto';
    this.startVolume = config.startVolume;
    this.endVolume = config.endVolume;
    this.playCount = config.playCount;
    this.playInterval = config.playInterval;
    this.audioUrl = config.audioUrl || '';
    this.endVolumeDelay = config.endVolumeDelay;
    this.channelId = channelId;
    this._initialized = false;
  }

  /**
   * 构建 speaker 配置对象
   */
  _buildSpeakerConfig() {
    const speakerConfig = {
      userId: this.userId,
      did: this.did,
      ttsMode: this.ttsMode,
    };
    if (this.passToken) {
      speakerConfig.passToken = this.passToken;
    } else if (this.password) {
      speakerConfig.password = this.password;
    }
    return speakerConfig;
  }

  /**
   * 确保 speaker 已初始化（懒初始化，首次发送时执行）
   */
  async _ensureInitialized() {
    if (this._initialized) return;
    const speaker = getSpeaker();
    await speaker.init(this._buildSpeakerConfig());
    this._initialized = true;
    logger.info(`Misound 初始化完成: did=${this.did}, ttsMode=${this.ttsMode}`);
  }

  /**
   * 规范化结束音量延迟（秒）：空值返回 null（自动估算）
   */
  static _normalizeEndVolumeDelay(value) {
    if (isEmptyConfigValue(value)) {
      return { ok: true, value: null };
    }
    const numericDelay = Number(value);
    if (!Number.isFinite(numericDelay) || numericDelay < 0) {
      return { ok: false, message: '结束音量延迟必须是大于等于 0 的数字（单位：秒）' };
    }
    if (numericDelay > MAX_PLAY_INTERVAL_SECONDS) {
      return { ok: false, message: `结束音量延迟不能超过 ${MAX_PLAY_INTERVAL_SECONDS} 秒` };
    }
    return { ok: true, value: numericDelay };
  }

  /**
   * 解析运行时播放参数
   * @param {Object} [messageOverrides] - 推送 body 中的覆盖字段（优先于渠道配置）
   */
  _resolvePlaybackOptions(messageOverrides = {}) {
    // 推送 body 覆盖优先于渠道配置；均为可选
    const rawStartVolume = messageOverrides.volume ?? this.startVolume;
    const rawAudioUrl = messageOverrides.audioUrl ?? this.audioUrl;
    const rawPlayCount = messageOverrides.playCount ?? this.playCount;
    const rawPlayInterval = messageOverrides.playInterval ?? this.playInterval;
    const rawEndVolume = this.endVolume; // 结束音量不开放单次覆盖，避免误用
    const rawEndVolumeDelay = this.endVolumeDelay;

    const startVolumeResult = normalizeVolumeValue(rawStartVolume, '开始音量');
    if (!startVolumeResult.ok) {
      throw new Error(startVolumeResult.message);
    }
    const endVolumeResult = normalizeVolumeValue(rawEndVolume, '结束音量');
    if (!endVolumeResult.ok) {
      throw new Error(endVolumeResult.message);
    }
    const playCountResult = normalizePlayCountValue(rawPlayCount);
    if (!playCountResult.ok) {
      throw new Error(playCountResult.message);
    }
    const playIntervalResult = normalizePlayIntervalValue(rawPlayInterval);
    if (!playIntervalResult.ok) {
      throw new Error(playIntervalResult.message);
    }
    const audioUrlResult = normalizeAudioUrlValue(rawAudioUrl);
    if (!audioUrlResult.ok) {
      throw new Error(audioUrlResult.message);
    }
    const endVolumeDelayResult = MisoundChannel._normalizeEndVolumeDelay(rawEndVolumeDelay);
    if (!endVolumeDelayResult.ok) {
      throw new Error(endVolumeDelayResult.message);
    }

    return {
      startVolume: startVolumeResult.value,
      endVolume: endVolumeResult.value,
      playCount: playCountResult.value,
      playIntervalSeconds: playIntervalResult.value,
      audioUrl: audioUrlResult.value,
      endVolumeDelaySeconds: endVolumeDelayResult.value,
    };
  }

  /**
   * 合并并清洗 TTS 文本
   * @param {Object} message
   * @returns {string}
   */
  _buildTtsText(message) {
    const { title, content, type = 'text' } = message;
    let text = content || '';
    if (title) {
      text = title + (text ? '，' + text : '');
    }
    if (type === 'markdown') {
      text = this._stripMarkdown(text);
    }
    if (type === 'html') {
      text = BaseChannel.stripHtmlTags(text);
    }
    if (text.length > 500) {
      text = text.substring(0, 500);
      logger.warn('Misound 文本过长，已截断至 500 字符');
    }
    return text;
  }

  /**
   * 设置音箱音量（失败仅记日志，不中断主流程）
   * @param {Object} speaker
   * @param {number} volume
   * @param {string} phaseLabel
   */
  async _setVolumeSafe(speaker, volume, phaseLabel) {
    try {
      logger.info(`Misound ${phaseLabel}音量: did=${this.did}, volume=${volume}`);
      await speaker.setVolume(volume, { did: this.did });
    } catch (error) {
      logger.warn(`Misound ${phaseLabel}音量失败（继续播放）: ${error.message}`);
    }
  }

  /**
   * 估算单次播放时长（毫秒），用于结束音量前等待播完
   * TTS 按文本长度估算；音频无法预估，返回兜底值
   */
  _estimatePlayDurationMs(playbackOptions, ttsText) {
    // 用户显式配置了延迟则直接使用
    if (playbackOptions.endVolumeDelaySeconds !== null) {
      return Math.min(playbackOptions.endVolumeDelaySeconds * 1000, ESTIMATED_DURATION_LIMIT_MS);
    }
    if (playbackOptions.audioUrl) {
      // 在线音频无法预估长度，使用默认延迟
      return DEFAULT_END_VOLUME_DELAY_MS;
    }
    const textLength = (ttsText || '').length;
    if (textLength === 0) {
      return DEFAULT_END_VOLUME_DELAY_MS;
    }
    const estimatedMs = Math.ceil(textLength / TTS_CHARS_PER_SECOND) * 1000 + 1000;
    return Math.min(estimatedMs, ESTIMATED_DURATION_LIMIT_MS);
  }

  /**
   * 执行单次播放：有 audioUrl 则播音频，否则 TTS
   * 音频播放失败时，若有文本则降级为 TTS
   * @param {Object} speaker
   * @param {{ audioUrl: string, text: string, allowFallback: boolean }} options
   */
  async _playOnce(speaker, options) {
    const { audioUrl, text, allowFallback } = options;
    if (audioUrl) {
      logger.info(`Misound 播放在线音频: did=${this.did}, url=${audioUrl}`);
      try {
        return await speaker.playAudio(audioUrl, { did: this.did });
      } catch (error) {
        if (allowFallback && text) {
          logger.warn(`Misound 在线音频播放失败，降级为 TTS: ${error.message}`);
          return await speaker.tts(text, { did: this.did });
        }
        throw error;
      }
    }
    if (!text) {
      throw new Error('消息内容为空，且未配置在线音频');
    }
    logger.info(`Misound 发送 TTS: did=${this.did}, 长度=${text.length}`);
    return await speaker.tts(text, { did: this.did });
  }


  /**
   * 核心发送逻辑（不含认证重试）
   * @param {Object} message
   */
  async _sendInternal(message) {
    // 提取推送 body 中的覆盖字段（仅 misound 识别，优先于渠道配置）
    const messageOverrides = {
      volume: message.volume,
      audioUrl: message.audioUrl,
      playCount: message.playCount,
      playInterval: message.playInterval,
    };
    const playbackOptions = this._resolvePlaybackOptions(messageOverrides);
    const ttsText = this._buildTtsText(message);
    const playMode = playbackOptions.audioUrl ? 'audio' : 'tts';

    await this._ensureInitialized();
    const speaker = getSpeaker();

    if (playbackOptions.startVolume !== null) {
      await this._setVolumeSafe(speaker, playbackOptions.startVolume, '开始');
    }

    const playResults = [];
    const intervalMilliseconds = playbackOptions.playIntervalSeconds * 1000;

    for (let playIndex = 0; playIndex < playbackOptions.playCount; playIndex += 1) {
      const singleResult = await this._playOnce(speaker, {
        audioUrl: playbackOptions.audioUrl,
        text: ttsText,
        allowFallback: true,
      });
      playResults.push(singleResult);

      // 非最后一次且配置了间隔时等待
      if (playIndex < playbackOptions.playCount - 1 && intervalMilliseconds > 0) {
        await sleep(intervalMilliseconds);
      }
    }

    if (playbackOptions.endVolume !== null) {
      // 估算播放时长后等待，尽量在播完后再设结束音量
      const waitMs = this._estimatePlayDurationMs(playbackOptions, ttsText);
      if (waitMs > 0) {
        logger.info(`Misound 结束音量前等待 ${waitMs}ms（估算播放时长）`);
        await sleep(waitMs);
      }
      await this._setVolumeSafe(speaker, playbackOptions.endVolume, '结束');
    }

    return {
      success: true,
      mode: playMode,
      playCount: playbackOptions.playCount,
      playInterval: playbackOptions.playIntervalSeconds,
      startVolume: playbackOptions.startVolume,
      endVolume: playbackOptions.endVolume,
      results: playResults,
    };
  }

  /**
   * 发送推送：支持音量编排、多次播放、在线音频优先
   */
  async send(message) {
    try {
      return await this._sendInternal(message);
    } catch (error) {
      // 初始化可能过期，重置后重试一次
      const errorMessage = error && error.message ? String(error.message) : '';
      const looksLikeAuthError =
        errorMessage.includes('认证') ||
        errorMessage.includes('token') ||
        errorMessage.includes('登录') ||
        errorMessage.includes('Token');

      if (looksLikeAuthError) {
        logger.warn('Misound 认证可能过期，重新初始化后重试');
        this._initialized = false;
        return await this._sendInternal(message);
      }
      throw error;
    }
  }

  _stripMarkdown(markdown) {
    return markdown
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/---+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }



  validate(config) {
    if (!config.userId || String(config.userId).trim() === '') {
      return { valid: false, message: '小米ID不能为空' };
    }
    if (!/^\d+$/.test(String(config.userId).trim())) {
      return { valid: false, message: '小米ID必须为数字' };
    }
    if (!config.passToken && !config.password) {
      return { valid: false, message: 'passToken 和密码至少需要填写一个' };
    }
    if (!config.did || String(config.did).trim() === '') {
      return { valid: false, message: '音箱设备标识不能为空' };
    }
    const validModes = ['auto', 'command', 'default'];
    if (config.ttsMode && !validModes.includes(config.ttsMode)) {
      return { valid: false, message: 'TTS模式必须是 auto、command 或 default' };
    }

    const startVolumeResult = normalizeVolumeValue(config.startVolume, '开始音量');
    if (!startVolumeResult.ok) {
      return { valid: false, message: startVolumeResult.message };
    }
    const endVolumeResult = normalizeVolumeValue(config.endVolume, '结束音量');
    if (!endVolumeResult.ok) {
      return { valid: false, message: endVolumeResult.message };
    }
    const playCountResult = normalizePlayCountValue(config.playCount);
    if (!playCountResult.ok) {
      return { valid: false, message: playCountResult.message };
    }
    const playIntervalResult = normalizePlayIntervalValue(config.playInterval);
    if (!playIntervalResult.ok) {
      return { valid: false, message: playIntervalResult.message };
    }
    const audioUrlResult = normalizeAudioUrlValue(config.audioUrl);
    if (!audioUrlResult.ok) {
      return { valid: false, message: audioUrlResult.message };
    }
    const endVolumeDelayResult = MisoundChannel._normalizeEndVolumeDelay(config.endVolumeDelay);
    if (!endVolumeDelayResult.ok) {
      return { valid: false, message: endVolumeDelayResult.message };
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
      return { success: true, message: '测试消息发送成功，请检查小爱音箱是否播报' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  static getName() {
    return '小爱音箱';
  }

  static getDescription() {
    return '小米小爱音箱语音播报通知';
  }

  static getConfigFields() {
    return [
      {
        name: 'userId',
        label: '小米ID',
        type: 'text',
        required: true,
        placeholder: '请输入小米ID（纯数字）',
        description: '在小米账号个人信息中查看的数字ID，非手机号或邮箱',
      },
      {
        name: 'passToken',
        label: 'PassToken',
        type: 'password',
        required: false,
        placeholder: '推荐使用 passToken 登录',
        description: 'passToken 登录方式更稳定，获取方式参考 mi-gpt 文档',
      },
      {
        name: 'password',
        label: '密码',
        type: 'password',
        required: false,
        placeholder: '不推荐使用密码登录',
        description: '密码登录可能被小米安全验证拦截，建议优先使用 passToken',
      },
      {
        name: 'did',
        label: '音箱设备标识',
        type: 'text',
        required: true,
        placeholder: '如 客厅小爱 / 音箱did',
        description: '目标小爱音箱在米家App中的名称或设备did',
      },
      {
        name: 'ttsMode',
        label: 'TTS 模式',
        type: 'select',
        required: false,
        options: [
          { label: '自动（推荐）', value: 'auto' },
          { label: '指令模式', value: 'command' },
          { label: '默认链路', value: 'default' },
        ],
        description: 'auto=智能选择最优方式; command=仅用MiOT指令; default=仅用MiNA默认链路',
      },
      {
        name: 'startVolume',
        label: '开始音量',
        type: 'number',
        required: false,
        placeholder: '0-100，留空表示不调节',
        description: '播报前设置的音量（0-100）。留空则不修改音箱当前音量',
      },
      {
        name: 'endVolume',
        label: '结束音量',
        type: 'number',
        required: false,
        placeholder: '0-100，留空表示不调节',
        description: '播报结束后设置的音量（0-100）。留空则不修改。因音箱为异步下发指令，可能略早于播完生效',
      },
      {
        name: 'playCount',
        label: '播放次数',
        type: 'number',
        required: false,
        placeholder: '默认 1，最大 10',
        description: '同一条消息重复播放的次数，默认 1，最大 10',
      },
      {
        name: 'playInterval',
        label: '播放间隔（秒）',
        type: 'number',
        required: false,
        placeholder: '默认 0',
        description: '多次播放时，两次之间的等待秒数。请按文案/音频长度自行估算',
      },
      {
        name: 'audioUrl',
        label: '在线音频 URL',
        type: 'text',
        required: false,
        placeholder: 'https://example.com/alert.mp3',
        description: '填写后优先播放该音频，不再播报推送文本。须为公网可访问的 http(s) 直链',
      },
      {
        name: 'endVolumeDelay',
        label: '结束音量延迟（秒）',
        type: 'number',
        required: false,
        placeholder: '留空=自动估算',
        description: '设置结束音量前的等待秒数。留空则按 TTS 文本长度自动估算；音频无法预估，建议手动指定',
      },
      {
        name: '_docLinks',
        label: '相关文档',
        type: 'links',
        required: false,
        links: [
          {
            label: 'xiaoii GitHub',
            url: 'https://github.com/xvhuan/xiaoi',
          },
          {
            label: '配置说明',
            url: 'https://github.com/xvhuan/xiaoi#%E9%85%8D%E7%BD%AE%E8%AF%A6%E8%A7%A3',
          },
        ],
      },
    ];
  }
}

module.exports = MisoundChannel;
