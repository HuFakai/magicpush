const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const modelsPath = require.resolve('../../../src/models');
const endpoints = new Map();
const getChannelsCalls = [];
const setChannelsCalls = [];

const EndpointModel = {
  findByUserId: async userId => [...endpoints.values()].filter(item => item.user_id === userId),
  findById: async id => endpoints.get(Number(id)) || null,
  getChannels: async (id, options) => {
    getChannelsCalls.push([id, options]);
    return [{ id: 9, name: '公开信息', channel_type: 'webhook' }];
  },
  setChannels: async (...args) => setChannelsCalls.push(args),
};

require.cache[modelsPath] = {
  id: modelsPath,
  filename: modelsPath,
  loaded: true,
  exports: { EndpointModel },
};

const EndpointService = require('../../../src/services/endpoint.service');

beforeEach(() => {
  endpoints.clear();
  getChannelsCalls.length = 0;
  setChannelsCalls.length = 0;
  endpoints.set(1, { id: 1, user_id: 7, name: 'EP' });
});

test('getEndpoint：只返回不含 config 的渠道摘要', async () => {
  const endpoint = await EndpointService.getEndpoint(1, 7);
  assert.strictEqual(endpoint.channels[0].name, '公开信息');
  assert.deepStrictEqual(getChannelsCalls[0], [1, { includeConfig: false }]);
});

test('updateEndpointChannels：拒绝非数组或非法 ID', async () => {
  await assert.rejects(() => EndpointService.updateEndpointChannels(1, 7, '9'), /必须是数组/);
  await assert.rejects(() => EndpointService.updateEndpointChannels(1, 7, [0]), /正整数/);
  await assert.rejects(() => EndpointService.updateEndpointChannels(1, 7, [1.5]), /正整数/);
  assert.strictEqual(setChannelsCalls.length, 0);
});

test('updateEndpointChannels：将 userId 传给原子归属校验', async () => {
  const channels = await EndpointService.updateEndpointChannels(1, 7, [9, 9]);
  assert.deepStrictEqual(setChannelsCalls[0], [1, 7, [9, 9]]);
  assert.deepStrictEqual(getChannelsCalls[0], [1, { includeConfig: false }]);
  assert.strictEqual(channels.length, 1);
});

test('updateEndpointChannels：不能修改他人的 endpoint', async () => {
  await assert.rejects(() => EndpointService.updateEndpointChannels(1, 8, [9]), /接口不存在/);
  assert.strictEqual(setChannelsCalls.length, 0);
});
