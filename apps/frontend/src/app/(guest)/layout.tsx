import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import SessionProvider from '@/components/SessionProvider';
import AntdProvider from '@/components/AntdProvider';
import GuestHeader from '@/components/layout/GuestHeader';

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session as any).role !== 'GUEST') redirect('/login');
  return (
    <SessionProvider>
      <AntdProvider>
        <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: "'Sarabun', sans-serif" }}>
          <GuestHeader />
          <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
            {children}
          </div>
        </div>
      </AntdProvider>
    </SessionProvider>
  );
}
