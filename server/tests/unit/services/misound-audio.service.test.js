const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const AudioService = require('../../../src/services/misound-audio.service');

let tempDirectory;

beforeEach(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'magicpush-audio-'));
  process.env.MISOUND_AUDIO_DIR = tempDirectory;
  process.env.MISOUND_AUDIO_MAX_SIZE_MB = '20';
});

afterEach(async () => {
  delete process.env.MISOUND_AUDIO_DIR;
  delete process.env.MISOUND_AUDIO_MAX_SIZE_MB;
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

test('detectAudioFormat：按真实文件头识别常见音频格式', () => {
  assert.strictEqual(AudioService.detectAudioFormat(Buffer.from('494433040000', 'hex')).extension, '.mp3');
  assert.strictEqual(AudioService.detectAudioFormat(Buffer.from('fff150800000', 'hex')).extension, '.aac');
  assert.strictEqual(
    AudioService.detectAudioFormat(Buffer.from('524946460000000057415645', 'hex')).extension,
    '.wav'
  );
  assert.strictEqual(AudioService.detectAudioFormat(Buffer.from('not audio')), null);
});

test('saveAudio：使用 UUID 文件名保存到用户隔离目录并可重新读取', async () => {
  const source = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]);
  const saved = await AudioService.saveAudio(42, source);

  assert.match(saved.filename, /^[0-9a-f-]{36}\.mp3$/);
  assert.strictEqual(saved.relativeUrl, `/api/media/misound/42/${saved.filename}`);
  assert.deepStrictEqual(await fs.readFile(saved.filePath), source);

  const resolved = await AudioService.getAudioFile(42, saved.filename);
  assert.strictEqual(resolved.mimeType, 'audio/mpeg');
  assert.strictEqual(resolved.size, source.length);
});

test('saveAudio：拒绝伪造扩展名的非音频内容', async () => {
  await assert.rejects(
    () => AudioService.saveAudio(1, Buffer.from('<script>alert(1)</script>')),
    /不支持的音频格式/
  );
});

test('saveAudio：拒绝超过配置上限的文件', async () => {
  process.env.MISOUND_AUDIO_MAX_SIZE_MB = '0.001';
  const source = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2048)]);
  await assert.rejects(() => AudioService.saveAudio(1, source), /音频文件不能超过/);
});

test('getAudioFile：拒绝路径穿越和非法文件名', async () => {
  await assert.rejects(() => AudioService.getAudioFile(1, '../../secret.mp3'), /文件名无效/);
  await assert.rejects(() => AudioService.getAudioFile('../1', `${'a'.repeat(36)}.mp3`), /用户 ID 无效/);
});
