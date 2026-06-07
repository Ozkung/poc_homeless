import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import Sidebar from '@/components/layout/Sidebar';
import AntdProvider from '@/components/AntdProvider';
import SessionProvider from '@/components/SessionProvider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <SessionProvider>
      <AntdProvider>
        <div className="flex h-screen bg-[#f0f2f5]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-7">{children}</main>
        </div>
      </AntdProvider>
    </SessionProvider>
  );
}
