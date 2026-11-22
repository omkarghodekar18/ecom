import { cn } from '@/lib/cn';

/**
 * Tone of the header's right-hand action cluster (spec 5.1.2): on the orange
 * bar (white icons) or the white bar (ink icons). Shared by the cluster, the
 * locale picker and the account menu so every trigger looks identical.
 */
export type HeaderActionTone = 'brand' | 'default';

export function headerActionClasses(tone: HeaderActionTone): string {
  return cn(
    'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-btn px-2 text-xs font-medium transition-colors',
    tone === 'brand'
      ? 'text-white hover:bg-white/10 focus-visible:outline-white'
      : 'text-ink hover:text-brand',
  );
}
