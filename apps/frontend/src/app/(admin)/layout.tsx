import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import AdminShell from '@/components/layout/AdminShell';
import NotificationToast from '@/components/notifications/NotificationToast';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <NotificationToast />
        <AdminShell>{children}</AdminShell>
      </AntdProvider>
    </SessionProvider>
  );
}
