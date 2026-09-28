const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const CACHE_FILE_NAME = '.mi.json';
const SERVICE_SIDS = Object.freeze({
  mina: 'micoapi',
  miot: 'xiaomiio',
});

let writeQueue = Promise.resolve();

function resolveCacheDirectory() {
  const homeDirectory = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(homeDirectory, '.xiaoi');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readCache(cacheFile) {
  try {
    const content = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`[Misound] xiaoii 凭证缓存不可读，将安全重建: ${error.message}`);
    }
    return {};
  }
}

function mergeCaches(persistentCache, runtimeCache) {
  const merged = { ...persistentCache };
  for (const [key, value] of Object.entries(runtimeCache)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function buildServiceAccount(existingAccount, config, sid) {
  const userId = String(config.userId || '').trim();
  const passToken = String(config.passToken || '').trim();
  const password = String(config.password || '');
  const sameAccount = isPlainObject(existingAccount) &&
    String(existingAccount.userId || '').trim() === userId;
  const account = sameAccount ? { ...existingAccount } : {};

  account.userId = userId;
  account.sid = sid;

  if (passToken) {
    const configuredTokenChanged = sameAccount &&
      existingAccount.passToken &&
      existingAccount.passToken !== passToken;
    const refreshedToken = sameAccount &&
      !configuredTokenChanged &&
      isPlainObject(existingAccount.pass) &&
      String(existingAccount.pass.passToken || '').trim();
    account.passToken = passToken;
    account.pass = {
      ...(sameAccount && !configuredTokenChanged && isPlainObject(existingAccount.pass)
        ? existingAccount.pass
        : {}),
      // 顶层 passToken 是数据库配置的版本标记；嵌套值可能已被小米刷新，
      // 同一配置下优先保留刷新后的值，扫码换绑传入新 Token 时再替换。
      passToken: refreshedToken || passToken,
    };
  } else {
    delete account.passToken;
    delete account.pass;
  }

  if (password) {
    account.password = password;
  } else {
    delete account.password;
  }

  return account;
}

async function writeCacheAtomically(cacheFile, data) {
  const temporaryFile = `${cacheFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryFile, cacheFile);
  await fs.chmod(cacheFile, 0o600);
}

async function isSymlinkTo(runtimeCacheFile, persistentCacheFile) {
  try {
    const stat = await fs.lstat(runtimeCacheFile);
    if (!stat.isSymbolicLink()) return false;
    const linkTarget = await fs.readlink(runtimeCacheFile);
    return path.resolve(path.dirname(runtimeCacheFile), linkTarget) ===
      path.resolve(persistentCacheFile);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * 在 xiaoii 初始化前为 MiNA 与 MIoT 同时补齐账号凭证。
 *
 * xiaoii 初始化时会在 ~/.xiaoi 下读写 .mi.json，但底层 401 自动刷新发生在
 * 初始化结束以后，此时 @mi-gpt/miot 会从进程 cwd 读取同名文件。这里同步两个
 * 位置并补齐 MiNA/MIoT 条目；Docker 环境会把 cwd 文件链接到持久化缓存。
 */
async function ensureCredentialCache(config, options = {}) {
  const userId = String(config?.userId || '').trim();
  const passToken = String(config?.passToken || '').trim();
  const password = String(config?.password || '');
  if (!userId || (!passToken && !password)) {
    throw new Error('小爱音箱登录凭证不完整');
  }

  const cacheDirectory = options.cacheDirectory || resolveCacheDirectory();
  const runtimeCacheFile = Object.prototype.hasOwnProperty.call(options, 'runtimeCacheFile')
    ? options.runtimeCacheFile
    : (process.env.XIAOII_RUNTIME_CACHE_FILE || path.join(process.cwd(), CACHE_FILE_NAME));
  const work = writeQueue.then(async () => {
    await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
    const cacheFile = path.join(cacheDirectory, CACHE_FILE_NAME);
    const persistentCache = await readCache(cacheFile);
    const shouldReadRuntime = runtimeCacheFile &&
      path.resolve(runtimeCacheFile) !== path.resolve(cacheFile) &&
      !await isSymlinkTo(runtimeCacheFile, cacheFile);
    const runtimeCache = shouldReadRuntime ? await readCache(runtimeCacheFile) : {};
    const cache = mergeCaches(persistentCache, runtimeCache);

    for (const [service, sid] of Object.entries(SERVICE_SIDS)) {
      cache[service] = buildServiceAccount(cache[service], {
        userId,
        passToken,
        password,
      }, sid);
    }

    await writeCacheAtomically(cacheFile, cache);
    if (shouldReadRuntime) {
      await writeCacheAtomically(runtimeCacheFile, cache);
    }
    return cacheFile;
  });
  writeQueue = work.catch(() => {});
  return work;
}

module.exports = {
  ensureCredentialCache,
  resolveCacheDirectory,
};
