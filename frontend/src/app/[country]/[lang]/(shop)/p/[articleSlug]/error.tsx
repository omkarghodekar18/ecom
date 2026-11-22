'use client';

// PDP route error boundary: surface the digest in dev tooling, offer a retry.
import { useEffect } from 'react';

export default function PdpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-container flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">This product could not be loaded</h1>
      <p className="mt-2 max-w-md text-muted">
        Something went wrong while loading the product details. Please try again — if it keeps
        happening, contact our support team.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-btn bg-brand px-6 py-3 font-bold text-white transition-colors hover:bg-brand-hover"
      >
        Try again
      </button>
    </div>
  );
}
