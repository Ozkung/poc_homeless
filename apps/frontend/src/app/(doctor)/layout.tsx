import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import DoctorShell from '@/components/layout/DoctorShell';
import NotificationToast from '@/components/notifications/NotificationToast';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'DOCTOR') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <NotificationToast />
        <DoctorShell>{children}</DoctorShell>
      </AntdProvider>
    </SessionProvider>
  );
}
