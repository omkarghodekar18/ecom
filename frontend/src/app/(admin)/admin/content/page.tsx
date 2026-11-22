import type { Metadata } from 'next';
import { ContentView } from '@/features/admin/content-view';

export const metadata: Metadata = {
  title: 'Content — Admin',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ContentView />;
}
