import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import FWShell from '@/components/layout/FWShell';

export default async function FWLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'FIELD_WORKER') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <FWShell>{children}</FWShell>
      </AntdProvider>
    </SessionProvider>
  );
}
