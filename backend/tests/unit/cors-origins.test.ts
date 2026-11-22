// Unit tests for CORS_ORIGINS allow-list matching (exact + wildcard entries).
import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../../src/config/env.js';

// corsOrigins()/isOriginAllowed() read the process env via getEnv(). The test
// bootstrap (tests/setup.ts) sets CORS_ORIGINS to this value.
const CONFIGURED = process.env.CORS_ORIGINS ?? '';

describe('isOriginAllowed', () => {
  it('accepts an exactly configured origin', () => {
    expect(CONFIGURED).toContain('http://localhost:3000');
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
  });

  it('rejects origins that are not configured', () => {
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
    expect(isOriginAllowed('http://localhost:3000.evil.com')).toBe(false);
  });

  it('matches wildcard entries across subdomains', () => {
    expect(CONFIGURED).toContain('https://preview-*.space-z.ai');
    expect(isOriginAllowed('https://preview-chat-abc.space-z.ai')).toBe(true);
    expect(isOriginAllowed('https://preview-.space-z.ai')).toBe(true); // * may match empty
    expect(isOriginAllowed('https://preview-a-b-c.space-z.ai')).toBe(true);
  });

  it('does not let a wildcard cross the configured boundary', () => {
    // Same suffix, wrong prefix.
    expect(isOriginAllowed('https://chat-abc.space-z.ai')).toBe(false);
    // Different TLD / host entirely.
    expect(isOriginAllowed('https://preview-chat-abc.space-z.ai.evil.com')).toBe(false);
    // Scheme must match too.
    expect(isOriginAllowed('http://preview-chat-abc.space-z.ai')).toBe(false);
  });
});
