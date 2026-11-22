'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the digest in dev tooling; never render internals to the user.
    console.error(error);
  }, [error]);

  return (
    <main className="page-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-5xl font-bold text-brand">500</p>
      <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted">
        An unexpected error occurred. Please try again — if it keeps happening, contact our support team.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-btn bg-brand px-6 py-3 font-bold text-white transition-colors hover:bg-brand-hover"
      >
        Try again
      </button>
    </main>
  );
}
