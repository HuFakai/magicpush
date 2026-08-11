const crypto = require('crypto');
const fsPromises = require('fs/promises');
const path = require('path');

const DEFAULT_MAX_UPLOAD_MB = 20;
const MAX_CONFIGURABLE_UPLOAD_MB = 100;

const AUDIO_FORMATS = [
  {
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    matches: buffer =>
      buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
      (buffer.length >= 2 && buffer[0] === 0xff &&
        (buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 0x06) !== 0),
  },
  {
    extension: '.wav',
    mimeType: 'audio/wav',
    matches: buffer =>
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE',
  },
  {
    extension: '.ogg',
    mimeType: 'audio/ogg',
    matches: buffer => buffer.subarray(0, 4).toString('ascii') === 'OggS',
  },
  {
    extension: '.flac',
    mimeType: 'audio/flac',
    matches: buffer => buffer.subarray(0, 4).toString('ascii') === 'fLaC',
  },
  {
    extension: '.m4a',
    mimeType: 'audio/mp4',
    matches: buffer => buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  {
    extension: '.aac',
    mimeType: 'audio/aac',
    matches: buffer => buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0,
  },
];

function getMaxUploadBytes() {
  const configured = Number(process.env.MISOUND_AUDIO_MAX_SIZE_MB);
  const maxMegabytes = Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_CONFIGURABLE_UPLOAD_MB)
    : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(maxMegabytes * 1024 * 1024);
}

function getUploadRoot() {
  const configuredPath = process.env.MISOUND_AUDIO_DIR;
  return path.resolve(configuredPath || path.join(__dirname, '../../data/uploads/misound'));
}

function detectAudioFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  return AUDIO_FORMATS.find(format => format.matches(buffer)) || null;
}

function normalizeUserId(userId) {
  const value = String(userId || '').trim();
  if (!/^\d+$/.test(value)) {
    throw new Error('用户 ID 无效');
  }
  return value;
}

function normalizeFilename(filename) {
  const value = String(filename || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{36}\.(mp3|wav|ogg|flac|m4a|aac)$/.test(value)) {
    throw new Error('音频文件名无效');
  }
  return value;
}

async function saveAudio(userId, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('请选择需要上传的音频文件');
  }
  if (buffer.length > getMaxUploadBytes()) {
    throw new Error(`音频文件不能超过 ${Math.floor(getMaxUploadBytes() / 1024 / 1024)}MB`);
  }

  const format = detectAudioFormat(buffer);
  if (!format) {
    throw new Error('不支持的音频格式，仅支持 MP3、WAV、OGG、FLAC、M4A 和 AAC');
  }

  const safeUserId = normalizeUserId(userId);
  const filename = `${crypto.randomUUID()}${format.extension}`;
  const userDirectory = path.join(getUploadRoot(), safeUserId);
  const filePath = path.join(userDirectory, filename);

  await fsPromises.mkdir(userDirectory, { recursive: true });
  await fsPromises.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 });

  return {
    filename,
    filePath,
    mimeType: format.mimeType,
    size: buffer.length,
    relativeUrl: `/api/media/misound/${safeUserId}/${filename}`,
  };
}

async function getAudioFile(userId, filename) {
  const safeUserId = normalizeUserId(userId);
  const safeFilename = normalizeFilename(filename);
  const extension = path.extname(safeFilename);
  const format = AUDIO_FORMATS.find(item => item.extension === extension);
  const filePath = path.join(getUploadRoot(), safeUserId, safeFilename);
  const stat = await fsPromises.stat(filePath);

  if (!stat.isFile()) {
    const error = new Error('音频文件不存在');
    error.code = 'ENOENT';
    throw error;
  }

  return {
    filename: safeFilename,
    filePath,
    mimeType: format.mimeType,
    size: stat.size,
  };
}

module.exports = {
  DEFAULT_MAX_UPLOAD_MB,
  getMaxUploadBytes,
  getUploadRoot,
  detectAudioFormat,
  saveAudio,
  getAudioFile,
};
