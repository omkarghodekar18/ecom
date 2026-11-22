import type { Metadata } from 'next';
import { ProfileForm } from '@/features/auth/ui/profile-form';

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileForm />;
}
