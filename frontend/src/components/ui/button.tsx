'use client';

import Link from 'next/link';
import type { ComponentPropsWithoutRef, ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Visual variants mapped to the Section 4 design system. */
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'link' | 'navy';

/** Control heights: sm 32px, md 40px, lg 48px. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand font-bold text-white hover:bg-brand-hover',
  outline: 'border border-line bg-white text-ink hover:border-brand hover:text-brand',
  ghost: 'text-ink hover:bg-tile',
  link: 'text-brand underline underline-offset-2',
  navy: 'bg-navy font-bold text-white hover:bg-navy/90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

const baseClasses =
  'inline-flex select-none items-center justify-center gap-2 rounded-btn font-medium transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

type ButtonVariantProps = {
  /** Visual variant. @default 'primary' */
  variant?: ButtonVariant;
  /** Control size. @default 'md' */
  size?: ButtonSize;
  /** Stretch to the full width of the parent. */
  fullWidth?: boolean;
};

/**
 * Primary action control. Renders a native `<button>`; when `href` is provided
 * it renders a next/link `<a>` with identical styling instead.
 *
 * @example <Button variant="primary">Add to shopping cart</Button>
 * @example <Button href="/in/en/cart" variant="outline">View cart</Button>
 */
export type ButtonProps = ButtonVariantProps &
  (
    | (Omit<ComponentProps<typeof Link>, 'href'> & { href: string })
    | (ComponentPropsWithoutRef<'button'> & { href?: undefined })
  );

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', fullWidth = false, className, ...rest } = props;
  const classes = cn(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && 'w-full',
    className,
  );

  if (rest.href !== undefined) {
    const { href, children, ...anchorProps } = rest;
    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest;
  return <button type={type} className={classes} {...buttonProps} />;
}

const iconButtonVariants = {
  ghost: 'text-ink hover:bg-tile',
  outline: 'border border-line bg-white text-ink hover:border-brand hover:text-brand',
  solid: 'bg-brand text-white hover:bg-brand-hover',
} as const;

/**
 * Square icon-only button. `aria-label` is mandatory because the icon is not
 * announced to screen readers on its own.
 *
 * @example <IconButton aria-label="Open menu"><Menu /></IconButton>
 */
export interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Icon node; size is controlled by the button's sm/md size. */
  children: React.ReactNode;
  /** Accessible name — required for icon-only buttons. */
  'aria-label': string;
  /** Visual variant. @default 'ghost' */
  variant?: keyof typeof iconButtonVariants;
  /** Square size: sm 32px, md 40px. @default 'md' */
  size?: 'sm' | 'md';
}

export function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-btn transition-colors duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        iconButtonVariants[variant],
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
