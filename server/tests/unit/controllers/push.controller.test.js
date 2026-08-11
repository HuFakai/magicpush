const { test } = require('node:test');
const assert = require('node:assert');

const pushServicePath = require.resolve('../../../src/services/push.service');
require.cache[pushServicePath] = {
  id: pushServicePath,
  filename: pushServicePath,
  loaded: true,
  exports: {},
};

const PushController = require('../../../src/controllers/push.controller');

test('_buildMessage：旧版顶层 MiSound 参数归入命名空间', () => {
  const message = PushController._buildMessage({
    title: '提醒',
    content: '',
    audioUrl: 'https://cdn.example.com/a.mp3',
    volume: '35',
    playCount: '2',
    playInterval: '0.5',
  });

  assert.deepStrictEqual(message.extraData.misound, {
    audioUrl: 'https://cdn.example.com/a.mp3',
    volume: '35',
    playCount: '2',
    playInterval: '0.5',
  });
});

test('_buildMessage：解析 GET 的 extraData JSON 且保留其他渠道数据', () => {
  const message = PushController._buildMessage({
    content: 'hello',
    extraData: JSON.stringify({ misound: { volume: 20 }, wecom: { channelType: 'news' } }),
    volume: 30,
  });

  assert.strictEqual(message.extraData.misound.volume, 30);
  assert.strictEqual(message.extraData.wecom.channelType, 'news');
});

test('_buildMessage：拒绝非法 extraData', () => {
  assert.throws(() => PushController._buildMessage({ extraData: '[1,2]' }), /必须是对象/);
  assert.throws(() => PushController._buildMessage({ extraData: '{bad' }), /合法的 JSON/);
});
