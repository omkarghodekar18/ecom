'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface BreadcrumbBackProps {
  /** Target used when there is no history to go back to (e.g. direct load). */
  fallbackHref: string;
}

/**
 * Orange "Back" control at the start of the breadcrumb row (spec 5.4): goes
 * one step back in history, falling back to `fallbackHref`.
 */
export function BreadcrumbBack({ fallbackHref }: BreadcrumbBackProps) {
  const router = useRouter();

  function handleBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="flex shrink-0 items-center gap-1.5 font-bold text-brand transition-colors hover:text-brand-hover"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );
}
