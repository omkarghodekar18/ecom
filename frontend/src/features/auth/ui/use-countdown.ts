'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-second countdown used by OTP resend buttons (spec 6.8: 60 s cooldown).
 * The interval only runs while the countdown is active.
 */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback((seconds: number) => setRemaining(seconds), []);

  return { remaining, start };
}
