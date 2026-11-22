// Import Center (spec 16.1): the route is a thin server wrapper — the layout
// guard already resolved the session; the (client) view needs the role for
// the ADMIN-gated rollback button.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api-client';
import type { MeDto } from '@/shared/dto/auth.dto';
import { ImportCenterView } from '@/features/admin/import-center-view';

export const metadata: Metadata = {
  title: 'Import Center — Admin',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  let role: 'ADMIN' | 'STAFF' = 'STAFF';
  try {
    const result = await apiFetch<{ user: MeDto }>('/auth/session', { cookie: cookieHeader });
    if (result.data.user.role === 'ADMIN') role = 'ADMIN';
  } catch {
    // The layout guard already redirected unauthenticated users.
  }
  return <ImportCenterView role={role} />;
}
