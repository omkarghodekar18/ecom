// SSRF guard (spec Section 18) for server-side fetches (media import from
// manufacturer URLs). Every hostname is resolved and *every* address is
// checked against the blocked list before a single byte is requested —
// including IP literals and IPv4-mapped IPv6 — so redirects and DNS results
// can never reach loopback/link-local/unique-local space.
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AppError } from '../../common/errors/app-error.js';
import { ERR } from '../../config/constants.js';

export interface HostAddress {
  address: string;
  family?: number;
}

/** Injectable resolver so tests can pin DNS answers without touching network. */
export type HostResolver = (hostname: string) => Promise<HostAddress[]>;

const defaultResolver: HostResolver = (hostname) => lookup(hostname, { all: true });

/* ----------------------------- IPv4 ranges ------------------------------ */

/** [network, prefix bits] — required private/reserved ranges plus multicast. */
const IPV4_BLOCKED: ReadonlyArray<readonly [number, number]> = [
  [ipv4('0.0.0.0'), 8], // "this" network (includes the 0.0.0.0 unspecified address)
  [ipv4('10.0.0.0'), 8], // RFC1918
  [ipv4('127.0.0.0'), 8], // loopback
  [ipv4('169.254.0.0'), 16], // link-local (cloud metadata endpoints live here)
  [ipv4('172.16.0.0'), 12], // RFC1918
  [ipv4('192.168.0.0'), 16], // RFC1918
  [ipv4('224.0.0.0'), 4], // multicast
  [ipv4('240.0.0.0'), 4], // reserved / broadcast
];

function ipv4(literal: string): number {
  const [a = 0, b = 0, c = 0, d = 0] = literal.split('.').map(Number);
  return (((a << 24) | (b << 16) | (c << 8) | d) >>> 0);
}

function ipv4Mask(bits: number): number {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}

/* ------------------------------- IPv6 ----------------------------------- */

/**
 * Parses an IPv6 literal (with '::' compression and embedded IPv4 tails)
 * into a 128-bit BigInt; null when malformed.
 */
function ipv6ToBigInt(ip: string): bigint | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const expandV4Tail = (groups: string[]): string[] | null => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.includes('.')) {
      const value = ipv4(last);
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(last)) return null;
      return [...groups.slice(0, -1), ((value >>> 16) & 0xffff).toString(16), (value & 0xffff).toString(16)];
    }
    return groups;
  };

  const leftHalf = halves[0] ?? '';
  const rightHalf = halves.length === 2 ? (halves[1] ?? '') : null;
  const left = expandV4Tail(leftHalf === '' ? [] : leftHalf.split(':'));
  if (!left) return null;
  const right = rightHalf !== null && rightHalf !== '' ? expandV4Tail(rightHalf.split(':')) : [];
  if (!right) return null;

  const groups =
    rightHalf !== null
      ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
      : left;
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** True when the literal belongs to a blocked IPv4/IPv6 range (or is garbage). */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const value = ipv4(ip);
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
    return IPV4_BLOCKED.some(([network, bits]) => (value & ipv4Mask(bits)) === (network & ipv4Mask(bits)));
  }
  if (family === 6) {
    const value = ipv6ToBigInt(ip);
    if (value === null) return true;
    if (value === 0n || value === 1n) return true; // :: (unspecified) and ::1 (loopback)
    if ((value >> 121n) === 126n) return true; // fc00::/7 unique-local (fc.. / fd..)
    if ((value >> 118n) === 1018n) return true; // fe80::/10 link-local
    if ((value >> 120n) === 0xffn) return true; // ff00::/8 multicast
    const high = value >> 96n;
    if (high === 0xffffn) {
      // IPv4-mapped (::ffff:a.b.c.d) — judge by the embedded IPv4 address.
      return isBlockedIp(dottedQuadFrom(value & 0xffff_ffffn));
    }
    if (high === 0n) {
      // IPv4-compatible (deprecated ::a.b.c.d) — same treatment.
      return isBlockedIp(dottedQuadFrom(value & 0xffff_ffffn));
    }
    return false;
  }
  return true; // not an IP literal at all — treat as blocked
}

function dottedQuadFrom(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join('.');
}

/** Throws 400 UNSAFE_URL when any address is blocked (all must be public). */
export function assertSafeAddresses(addresses: string[]): void {
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new AppError(ERR.UNSAFE_URL, 'The URL host resolves to a blocked address', 400, { address });
    }
  }
}

/**
 * True when `hostname` (bracketed IPv6 literals included) can be fetched:
 * IP literals are checked directly; names are resolved and every address
 * must be public. Resolution failures count as unsafe.
 */
export async function isSafeHost(hostname: string, resolve: HostResolver = defaultResolver): Promise<boolean> {
  const bare = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (isIP(bare) !== 0) return !isBlockedIp(bare);

  let addresses: HostAddress[];
  try {
    addresses = await resolve(bare);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  try {
    assertSafeAddresses(addresses.map((entry) => entry.address));
  } catch {
    return false;
  }
  return true;
}
