'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu as AntMenu, Button, Avatar, Typography, Drawer } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Users, CheckSquare, UserCircle, LogOut, Wallet, Menu as MenuIcon } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIsLiffEmbed } from '@/hooks/useIsLiffEmbed';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function FWShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const isLiffEmbed = useIsLiffEmbed();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  if (isLiffEmbed) {
    return <main style={{ height: '100vh', overflowY: 'auto', padding: isMobile ? 16 : 28, background: '#f0f2f5' }}>{children}</main>;
  }

  const navItems: MenuProps['items'] = [
    { key: '/fw/dashboard', label: 'Dashboard',     icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/fw/patients',  label: 'ผู้ป่วยของฉัน', icon: <Users size={ICON_SIZE} /> },
    { key: '/fw/tasks',     label: 'งานของฉัน',      icon: <CheckSquare size={ICON_SIZE} /> },
    { key: '/fw/profile',   label: 'โปรไฟล์',        icon: <UserCircle size={ICON_SIZE} /> },
    { key: '/fw/expense-claims', label: 'เบิกเงิน', icon: <Wallet size={ICON_SIZE} /> },
  ];

  const selectedKey = navItems.find((i) => i && pathname.startsWith((i as any).key))?.key as string ?? '/fw/dashboard';
  const userName: string = (session as any)?.displayName ?? 'Care Giver';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebarContent = (
    <>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
        <Text strong>Homeless Mobile Clinic</Text>
        <div style={{ fontSize: 10, color: '#d97706' }}>CARE GIVER</div>
      </div>
      <AntMenu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={navItems}
        onClick={({ key }) => { router.push(key); setSidebarOpen(false); }}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#d97706', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{userName}</Text>
        </div>
        <Button block size="small" icon={<LogOut size={12} />} onClick={() => signOut({ callbackUrl: '/login' })}>ออกจากระบบ</Button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', background: '#f0f2f5' }}>
      {isMobile && (
        <header style={{
          height: 56, background: '#fff', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
          flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            aria-label="เปิดเมนู"
          >
            <MenuIcon size={22} color="#111" />
          </button>
          <Text strong style={{ fontSize: 13 }}>Homeless Mobile Clinic</Text>
        </header>
      )}

      {isMobile ? (
        <Drawer
          placement="left"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          width={260}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
          closable={false}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
          {sidebarContent}
        </aside>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28, minWidth: 0 }}>{children}</main>
    </div>
  );
}
