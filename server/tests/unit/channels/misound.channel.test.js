const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const speakerPath = require.resolve('xiaoii/lib/speaker');
const speaker = {};
require.cache[speakerPath] = {
  id: speakerPath,
  filename: speakerPath,
  loaded: true,
  exports: speaker,
};

const MisoundChannel = require('../../../src/services/channels/misound.channel');

const calls = [];

beforeEach(() => {
  calls.length = 0;
  speaker.init = async config => { calls.push(['init', config.userId, config.did]); };
  speaker.setVolume = async (volume, options) => { calls.push(['volume', volume, options.did]); };
  speaker.playAudio = async (url, options) => {
    calls.push(['audio', url, options.did]);
    return { ok: true };
  };
  speaker.tts = async (text, options) => {
    calls.push(['tts', text, options.did]);
    return { ok: true };
  };
});

function makeChannel(overrides = {}, id = 1) {
  return new MisoundChannel({
    userId: '123456',
    passToken: 'token',
    did: `speaker-${id}`,
    ...overrides,
  }, id);
}

test('send：使用 extraData.misound 覆盖音量、音频和播放次数', async () => {
  const channel = makeChannel();
  const result = await channel.send({
    content: '',
    extraData: {
      audioUrl: 'https://cdn.example.com/a.mp3',
      volume: 35,
      playCount: 2,
      playInterval: 0,
    },
  });

  assert.strictEqual(result.mode, 'audio');
  assert.strictEqual(result.playCount, 2);
  assert.deepStrictEqual(calls.filter(call => call[0] === 'volume')[0], ['volume', 35, 'speaker-1']);
  assert.strictEqual(calls.filter(call => call[0] === 'audio').length, 2);
});

test('send：计划等待超过 60 秒时在产生副作用前拒绝', async () => {
  const channel = makeChannel({ endVolume: 20 });
  await assert.rejects(
    () => channel.send({
      content: '',
      extraData: {
        audioUrl: 'https://cdn.example.com/a.mp3',
        playCount: 2,
        playInterval: 60,
      },
    }),
    /等待时间不能超过 60 秒/
  );
  assert.strictEqual(calls.length, 0);
});

test('send：完整播放任务按顺序串行执行，避免 speaker 全局状态交错', async () => {
  let releaseFirst;
  let markFirstStarted;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
  let playIndex = 0;
  speaker.playAudio = async (url, options) => {
    playIndex += 1;
    calls.push(['audio-start', options.did]);
    if (playIndex === 1) {
      markFirstStarted();
      await gate;
    }
    calls.push(['audio-end', options.did]);
    return { ok: true };
  };

  const first = makeChannel({}, 1).send({ content: '', extraData: { audioUrl: 'https://cdn.example/a.mp3' } });
  await firstStarted;
  const second = makeChannel({}, 2).send({ content: '', extraData: { audioUrl: 'https://cdn.example/b.mp3' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(calls.filter(call => call[0] === 'init').length, 1);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepStrictEqual(calls.filter(call => call[0].startsWith('audio')), [
    ['audio-start', 'speaker-1'],
    ['audio-end', 'speaker-1'],
    ['audio-start', 'speaker-2'],
    ['audio-end', 'speaker-2'],
  ]);
});

test('send：认证失败只在播放副作用开始前重试一次', async () => {
  let initCount = 0;
  speaker.init = async () => {
    initCount += 1;
    if (initCount === 1) throw new Error('Token 过期');
  };
  const channel = makeChannel();
  const result = await channel.send({ content: '测试' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(initCount, 2);
  assert.strictEqual(calls.filter(call => call[0] === 'tts').length, 1);
});

test('send：渠道重新绑定到新账号后可切换 speaker 上下文，无需重启进程', async () => {
  const oldAccountChannel = makeChannel({ userId: '111111' }, 1);
  const newAccountChannel = makeChannel({ userId: '222222' }, 2);

  await oldAccountChannel.send({ content: '旧账号' });
  await newAccountChannel.send({ content: '新账号' });

  assert.deepStrictEqual(calls.filter(call => call[0] === 'init').map(call => call[1]), [
    '111111',
    '222222',
  ]);
});
