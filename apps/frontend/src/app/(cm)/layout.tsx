import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import AppShell from '@/components/layout/AppShell';
import NotificationToast from '@/components/notifications/NotificationToast';

export default async function CMLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'CASE_MANAGER') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <NotificationToast />
        <AppShell>{children}</AppShell>
      </AntdProvider>
    </SessionProvider>
  );
}
