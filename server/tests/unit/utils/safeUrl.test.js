const { test } = require('node:test');
const assert = require('node:assert');

const {
  assertSafeHttpUrl,
  isBlockedAddress,
  parseHttpUrl,
  resolveSafeHttpUrl,
} = require('../../../src/utils/safeUrl');

test('parseHttpUrl：仅允许无凭据的 HTTP(S) URL', () => {
  assert.strictEqual(parseHttpUrl('https://example.com/hook').hostname, 'example.com');
  assert.throws(() => parseHttpUrl('file:///etc/passwd'), /仅允许 HTTP/);
  assert.throws(() => parseHttpUrl('https://user:pass@example.com'), /用户名或密码/);
  assert.throws(() => parseHttpUrl('http://localhost:3000'), /本机或内网/);
});

test('isBlockedAddress：识别 IPv4/IPv6 私网、回环和保留地址', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.strictEqual(isBlockedAddress(address), true, address);
  }
  assert.strictEqual(isBlockedAddress('8.8.8.8'), false);
  assert.strictEqual(isBlockedAddress('2606:4700:4700::1111'), false);
});

test('assertSafeHttpUrl：域名任一解析结果为私网即拒绝', async () => {
  const lookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.8', family: 4 },
  ];
  await assert.rejects(
    () => assertSafeHttpUrl('https://example.com/hook', { lookup }),
    /本机、内网或保留地址/
  );
});

test('assertSafeHttpUrl：公网解析结果通过，IP 字面量无需 DNS', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const normalized = await assertSafeHttpUrl('https://example.com/hook', { lookup });
  assert.strictEqual(normalized, 'https://example.com/hook');

  let lookupCalled = false;
  await assertSafeHttpUrl('https://8.8.8.8/dns-query', {
    lookup: async () => {
      lookupCalled = true;
      return [];
    },
  });
  assert.strictEqual(lookupCalled, false);
});

test('resolveSafeHttpUrl：请求阶段固定使用已校验的 DNS 结果', async () => {
  const resolved = await resolveSafeHttpUrl('https://example.com/hook', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });

  const address = await new Promise((resolve, reject) => {
    resolved.lookup('example.com', {}, (error, value, family) => {
      if (error) reject(error);
      else resolve({ value, family });
    });
  });
  assert.deepStrictEqual(address, { value: '93.184.216.34', family: 4 });

  await assert.rejects(
    () => new Promise((resolve, reject) => {
      resolved.lookup('attacker.example', {}, error => error ? reject(error) : resolve());
    }),
    /目标主机与已校验 URL 不一致/
  );
});

test('assertSafeHttpUrl：直接使用内网 IP 时拒绝', async () => {
  await assert.rejects(
    () => assertSafeHttpUrl('http://169.254.169.254/latest/meta-data'),
    /本机、内网或保留地址/
  );
});

test('assertSafeHttpUrl：运维显式授权时允许可信内网自托管服务', async () => {
  const normalized = await assertSafeHttpUrl('http://192.168.1.20:5001/hook', {
    allowPrivate: true,
  });
  assert.strictEqual(normalized, 'http://192.168.1.20:5001/hook');
});
