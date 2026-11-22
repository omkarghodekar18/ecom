// Unit tests for the SSRF guard (spec Section 18): blocked IPv4/IPv6 ranges,
// assertSafeAddresses, and isSafeHost with an injected resolver (no DNS).
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error.js';
import {
  assertSafeAddresses,
  isBlockedIp,
  isSafeHost,
  type HostResolver,
} from '../../src/services/media/ip.guard.js';

describe('isBlockedIp (IPv4)', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.8.9.10', 'whole 127/8 is loopback'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12 (low edge)'],
    ['172.31.255.254', 'RFC1918 172.16/12 (high edge)'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'link-local (cloud metadata)'],
    ['0.0.0.0', 'unspecified'],
    ['0.1.2.3', 'whole 0/8'],
    ['224.0.0.1', 'multicast 224/4'],
    ['255.255.255.255', 'broadcast inside 240/4'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public DNS resolver'],
    ['1.1.1.1', 'public anycast'],
    ['172.32.0.1', 'just outside 172.16/12'],
    ['172.15.255.254', 'just below 172.16/12'],
    ['93.184.216.34', 'public example.com A record'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('isBlockedIp (IPv6)', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique-local fc00::/7'],
    ['fd12:3456:789a::1', 'unique-local fd00 (same /7)'],
    ['fe80::1', 'link-local fe80::/10'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped link-local metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::10.0.0.1', 'IPv4-compatible private'],
    ['ff02::1', 'multicast ff00::/8'],
    ['not-an-ip', 'garbage is blocked by default'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ['2606:4700:4700::1111', 'public (Cloudflare DNS)'],
    ['2a00:1450:4001:81b::200e', 'public (example.com AAAA)'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('assertSafeAddresses', () => {
  it('passes when every address is public', () => {
    expect(() => assertSafeAddresses(['93.184.216.34', '2606:4700:4700::1111'])).not.toThrow();
  });

  it('throws UNSAFE_URL when any address is blocked', () => {
    let caught: unknown;
    try {
      assertSafeAddresses(['93.184.216.34', '10.0.0.1']);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('UNSAFE_URL');
    expect((caught as AppError).statusCode).toBe(400);
  });
});

describe('isSafeHost (injected resolver)', () => {
  const resolvingTo = (addresses: string[]): HostResolver => async () =>
    addresses.map((address) => ({ address }));

  it('allows hostnames resolving to public addresses only', async () => {
    await expect(isSafeHost('images.example.com', resolvingTo(['93.184.216.34', '2606:4700:4700::1111']))).resolves.toBe(
      true,
    );
  });

  it('blocks when any resolved address is private (DNS rebinding safe)', async () => {
    await expect(isSafeHost('evil.example.com', resolvingTo(['93.184.216.34', '169.254.169.254']))).resolves.toBe(false);
    await expect(isSafeHost('mixed.example.com', resolvingTo(['8.8.8.8', 'fd00::1']))).resolves.toBe(false);
  });

  it('blocks when resolution fails or returns nothing', async () => {
    const failing: HostResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(isSafeHost('nope.example.com', failing)).resolves.toBe(false);
    await expect(isSafeHost('empty.example.com', resolvingTo([]))).resolves.toBe(false);
  });

  it('checks IP literals directly, without resolving', async () => {
    const mustNotResolve: HostResolver = async () => {
      throw new Error('resolver must not be called for IP literals');
    };
    await expect(isSafeHost('8.8.8.8', mustNotResolve)).resolves.toBe(true);
    await expect(isSafeHost('127.0.0.1', mustNotResolve)).resolves.toBe(false);
    await expect(isSafeHost('169.254.169.254', mustNotResolve)).resolves.toBe(false);
    await expect(isSafeHost('[::1]', mustNotResolve)).resolves.toBe(false);
    await expect(isSafeHost('[fd00::1]', mustNotResolve)).resolves.toBe(false);
  });
});
