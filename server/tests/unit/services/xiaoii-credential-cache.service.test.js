const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { ensureCredentialCache } = require('../../../src/services/xiaoii-credential-cache.service');

async function makeCacheDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'magicpush-xiaoii-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('为 MiNA 与 MIoT 同时写入扫码登录凭证', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);

  const cacheFile = await ensureCredentialCache({
    userId: '1506080450',
    passToken: 'qr-pass-token',
  }, { cacheDirectory, runtimeCacheFile: null });
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

  assert.equal(cache.mina.userId, '1506080450');
  assert.equal(cache.mina.sid, 'micoapi');
  assert.equal(cache.mina.passToken, 'qr-pass-token');
  assert.equal(cache.mina.pass.passToken, 'qr-pass-token');
  assert.equal(cache.miot.userId, '1506080450');
  assert.equal(cache.miot.sid, 'xiaomiio');
  assert.equal(cache.miot.pass.passToken, 'qr-pass-token');
  assert.equal((await fs.stat(cacheFile)).mode & 0o777, 0o600);
});

test('同账号更新凭证时保留服务缓存，切换账号时丢弃旧账号状态', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);
  const cacheFile = path.join(cacheDirectory, '.mi.json');
  await fs.writeFile(cacheFile, JSON.stringify({
    mina: {
      userId: '111',
      passToken: 'old-token',
      pass: { passToken: 'old-token', ssecurity: 'keep-me' },
      serviceToken: 'existing-service-token',
    },
    miot: {
      userId: '999',
      passToken: 'other-account-token',
      pass: { passToken: 'other-account-token' },
      serviceToken: 'must-not-leak',
    },
  }));

  await ensureCredentialCache(
    { userId: '111', passToken: 'new-token' },
    { cacheDirectory, runtimeCacheFile: null }
  );
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

  assert.equal(cache.mina.serviceToken, 'existing-service-token');
  assert.equal(cache.mina.pass.ssecurity, undefined);
  assert.equal(cache.mina.pass.passToken, 'new-token');
  assert.equal(cache.miot.userId, '111');
  assert.equal(cache.miot.pass.passToken, 'new-token');
  assert.equal(cache.miot.serviceToken, undefined);
});

test('同一数据库凭证下保留小米自动刷新后的嵌套 passToken', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);
  const cacheFile = path.join(cacheDirectory, '.mi.json');
  await fs.writeFile(cacheFile, JSON.stringify({
    mina: {
      userId: '111',
      passToken: 'configured-token',
      pass: { passToken: 'refreshed-token', ssecurity: 'fresh-security' },
    },
  }));

  await ensureCredentialCache({
    userId: '111',
    passToken: 'configured-token',
  }, { cacheDirectory, runtimeCacheFile: null });
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

  assert.equal(cache.mina.passToken, 'configured-token');
  assert.equal(cache.mina.pass.passToken, 'refreshed-token');
  assert.equal(cache.mina.pass.ssecurity, 'fresh-security');
});

test('损坏缓存会重建，且不会把空密码写入文件', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);
  const cacheFile = path.join(cacheDirectory, '.mi.json');
  await fs.writeFile(cacheFile, '{broken json');

  await ensureCredentialCache(
    { userId: '222', passToken: 'token' },
    { cacheDirectory, runtimeCacheFile: null }
  );
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

  assert.equal(cache.mina.password, undefined);
  assert.equal(cache.miot.password, undefined);
  assert.equal(cache.mina.pass.passToken, 'token');
});

test('拒绝缺少账号或认证信息的缓存写入', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);

  await assert.rejects(
    () => ensureCredentialCache(
      { userId: '222' },
      { cacheDirectory, runtimeCacheFile: null }
    ),
    /登录凭证不完整/
  );
});

test('将 cwd 自动刷新缓存合并回持久化缓存并同步两个位置', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);
  const runtimeDirectory = await makeCacheDirectory(t);
  const persistentCacheFile = path.join(cacheDirectory, '.mi.json');
  const runtimeCacheFile = path.join(runtimeDirectory, '.mi.json');
  await fs.writeFile(persistentCacheFile, JSON.stringify({
    mina: {
      userId: '333',
      passToken: 'configured-token',
      pass: { passToken: 'configured-token' },
    },
    miot: {
      userId: '333',
      passToken: 'configured-token',
      pass: { passToken: 'configured-token' },
    },
  }));
  await fs.writeFile(runtimeCacheFile, JSON.stringify({
    mina: {
      userId: '333',
      passToken: 'configured-token',
      pass: { passToken: 'refreshed-token', ssecurity: 'new-security' },
      serviceToken: 'new-service-token',
    },
  }));

  await ensureCredentialCache(
    { userId: '333', passToken: 'configured-token' },
    { cacheDirectory, runtimeCacheFile }
  );
  const persistent = JSON.parse(await fs.readFile(persistentCacheFile, 'utf8'));
  const runtime = JSON.parse(await fs.readFile(runtimeCacheFile, 'utf8'));

  assert.deepEqual(runtime, persistent);
  assert.equal(persistent.mina.pass.passToken, 'refreshed-token');
  assert.equal(persistent.mina.serviceToken, 'new-service-token');
  assert.equal(persistent.miot.pass.passToken, 'configured-token');
});

test('Docker 的 cwd 符号链接直接复用持久化缓存', async (t) => {
  const cacheDirectory = await makeCacheDirectory(t);
  const runtimeDirectory = await makeCacheDirectory(t);
  const persistentCacheFile = path.join(cacheDirectory, '.mi.json');
  const runtimeCacheFile = path.join(runtimeDirectory, '.mi.json');
  await fs.symlink(persistentCacheFile, runtimeCacheFile);

  await ensureCredentialCache(
    { userId: '444', passToken: 'token' },
    { cacheDirectory, runtimeCacheFile }
  );

  assert.equal((await fs.lstat(runtimeCacheFile)).isSymbolicLink(), true);
  const runtime = JSON.parse(await fs.readFile(runtimeCacheFile, 'utf8'));
  assert.equal(runtime.mina.userId, '444');
  assert.equal(runtime.miot.userId, '444');
});
