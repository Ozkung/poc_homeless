'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu as AntMenu, Button, Avatar, Typography, Drawer } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Users, CalendarDays, LogOut, Menu, UserCircle, Stethoscope } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  const navItems: MenuProps['items'] = [
    { key: '/doctor/dashboard', label: 'Dashboard',    icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/doctor/patients',  label: 'ผู้ป่วย',       icon: <Users size={ICON_SIZE} /> },
    { key: '/doctor/schedule',  label: 'ตารางลงพื้นที่', icon: <CalendarDays size={ICON_SIZE} /> },
  ];

  const selectedKey = navItems?.find(
    (item) => item != null && pathname.startsWith((item as { key: string }).key),
  )?.key as string ?? '/doctor/dashboard';

  const userName: string = (session as any)?.displayName ?? (session as any)?.user?.name ?? 'แพทย์';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const sidebarContent = (
    <>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Stethoscope size={16} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 8, color: '#0ea5e9', letterSpacing: 1.5, textTransform: 'uppercase', lineHeight: 1, marginBottom: 2 }}>Homeless Mobile Clinic</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#111', lineHeight: 1 }}>Doctor Portal</div>
        </div>
      </div>

      <AntMenu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={navItems}
        onClick={({ key }) => { router.push(key); setDrawerOpen(false); }}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />

      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#0ea5e9', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>{userName}</Text>
            <Text style={{ fontSize: 10, color: '#bbb' }}>DOCTOR</Text>
          </div>
          <UserCircle size={14} style={{ color: '#bbb' }} />
        </div>
        <Button size="small" icon={<LogOut size={13} />} block onClick={() => signOut({ callbackUrl: '/login' })} style={{ fontSize: 12 }}>
          ออกจากระบบ
        </Button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      {isMobile ? (
        <>
          <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 100 }}>
            <button onClick={() => setDrawerOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
              <Menu size={22} color="#111" />
            </button>
            <Stethoscope size={18} color="#0ea5e9" />
            <Text style={{ fontSize: 13, fontWeight: 700 }}>Doctor Portal</Text>
          </header>
          <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" width={220} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }} closeIcon={null}>
            {sidebarContent}
          </Drawer>
          <main style={{ flex: 1, overflowY: 'auto', paddingTop: 56 }}>{children}</main>
        </>
      ) : (
        <>
          <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {sidebarContent}
          </aside>
          <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
        </>
      )}
    </div>
  );
}
