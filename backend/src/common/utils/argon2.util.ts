// Argon2 password helpers (spec Section 10): argon2id hashing + verification.
//
// @node-rs/argon2 declares `Algorithm` as an ambient const enum, which cannot
// be imported by value under verbatimModuleSyntax. The runtime module really
// exports it as a plain object, so it is re-bound here through a safe cast —
// callers never touch the raw enum again.
import { hash, verify } from '@node-rs/argon2';
import type { Options } from '@node-rs/argon2';
import * as argon2 from '@node-rs/argon2';

const { Algorithm } = argon2 as unknown as { Algorithm: { Argon2id: Options['algorithm'] } };

const ARGON2ID_OPTIONS: Options = { algorithm: Algorithm.Argon2id };

/** Hashes a password with argon2id (library defaults otherwise). */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

/** Verifies a candidate password against a stored argon2 hash. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
