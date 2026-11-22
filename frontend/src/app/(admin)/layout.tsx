// Admin route group (spec Section 7/15): /admin/* sits OUTSIDE the locale
// segment. noindex everywhere; the server guard resolves the refresh cookie
// through GET /auth/session and redirects non-STAFF/ADMIN users to login.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { MeDto } from '@/shared/dto/auth.dto';
import { AdminShell } from '@/features/admin/admin-shell';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user: MeDto | null = null;
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    const cookieHeader = jar.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    const result = await apiFetch<{ user: MeDto }>('/auth/session', { cookie: cookieHeader });
    user = result.data.user;
  } catch {
    user = null;
  }
  if (user === null) {
    redirect('/in/en/login?redirect=%2Fadmin');
  }
  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    redirect('/in/en');
  }
  return <AdminShell user={user}>{children}</AdminShell>;
}
