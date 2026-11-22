import type { Metadata } from 'next';
import { SettingsView } from '@/features/admin/settings-view';

export const metadata: Metadata = {
  title: 'Settings — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SettingsView />;
}
