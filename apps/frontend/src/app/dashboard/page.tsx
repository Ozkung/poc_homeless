import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';

const ROLE_DEST: Record<string, string> = {
  ADMIN:             '/admin/dashboard',
  SUPER_ADMIN:       '/admin/dashboard',
  CASE_MANAGER:      '/cm/dashboard',
  CARE_GIVER:        '/fw/dashboard',
  MEDICAL_VOLUNTEER: '/medvol/dashboard',
  DOCTOR:            '/doctor/dashboard',
  GUEST:             '/guest/dashboard',
};

export default async function DashboardRedirectPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const dest = ROLE_DEST[(session as any).role] ?? '/login';
  redirect(dest);
}
