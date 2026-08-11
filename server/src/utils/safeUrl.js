const dns = require('dns').promises;
const net = require('net');

const blockedAddresses = new net.BlockList();

[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv4'));

[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv6'));

function allowPrivateOutbound() {
  return String(process.env.ALLOW_PRIVATE_OUTBOUND_URLS || '').toLowerCase() === 'true';
}

function parseHttpUrl(value, { allowPrivate = allowPrivateOutbound() } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('URL 格式无效');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅允许 HTTP 或 HTTPS URL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL 不允许包含用户名或密码');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || (!allowPrivate && (hostname === 'localhost' || hostname.endsWith('.localhost')))) {
    throw new Error('URL 不允许指向本机或内网地址');
  }

  return { parsed, hostname };
}

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  return blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * 校验服务端即将访问的 URL，阻止本机、内网、链路本地和保留地址。
 * lookup 参数仅用于单元测试注入；生产环境使用系统 DNS。
 */
function createPinnedLookup(expectedHostname, addresses) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'number') {
      options = { family: options };
    }

    const requestedHostname = String(hostname).replace(/^\[|\]$/g, '').toLowerCase();
    if (requestedHostname !== expectedHostname) {
      callback(new Error('请求目标主机与已校验 URL 不一致'));
      return;
    }

    const family = options?.family || 0;
    const candidates = family
      ? addresses.filter(item => Number(item.family) === Number(family))
      : addresses;
    if (candidates.length === 0) {
      callback(new Error('URL 域名没有可用的公网地址'));
      return;
    }

    if (options?.all) {
      callback(null, candidates.map(item => ({ address: item.address, family: item.family })));
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

async function resolveSafeHttpUrl(value, options = {}) {
  const lookup = options.lookup || dns.lookup;
  const allowPrivate = options.allowPrivate ?? allowPrivateOutbound();
  const { parsed, hostname } = parseHttpUrl(value, { allowPrivate });
  const literalFamily = net.isIP(hostname);
  const resolvedAddresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!Array.isArray(resolvedAddresses) || resolvedAddresses.length === 0) {
    throw new Error('URL 域名无法解析');
  }

  const addresses = resolvedAddresses.map(item => ({
    address: typeof item === 'string' ? item : item.address,
    family: typeof item === 'string' ? net.isIP(item) : Number(item.family || net.isIP(item.address)),
  }));
  for (const item of addresses) {
    if (!allowPrivate && isBlockedAddress(item.address)) {
      throw new Error('URL 不允许指向本机、内网或保留地址');
    }
  }

  return {
    url: parsed.toString(),
    lookup: createPinnedLookup(hostname, addresses),
  };
}

async function assertSafeHttpUrl(value, options) {
  const resolved = await resolveSafeHttpUrl(value, options);
  return resolved.url;
}

module.exports = {
  assertSafeHttpUrl,
  allowPrivateOutbound,
  isBlockedAddress,
  parseHttpUrl,
  resolveSafeHttpUrl,
};
