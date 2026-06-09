import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';
import MedVolShell from '@/components/layout/MedVolShell';

export default async function MedVolLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'MEDICAL_VOLUNTEER') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <MedVolShell>{children}</MedVolShell>
      </AntdProvider>
    </SessionProvider>
  );
}
