'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, Package } from 'lucide-react';
import type { MenuProps } from 'antd';

const { Text } = Typography;

const ICON_SIZE = 15;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const role: string = (session as any)?.role ?? '';
  const navItems: MenuProps['items'] = [
    { key: '/dashboard', label: 'Dashboard',      icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/patients',  label: 'ผู้ป่วย',        icon: <Users size={ICON_SIZE} /> },
    { key: '/events',    label: 'แผนการเยี่ยม',   icon: <CalendarDays size={ICON_SIZE} /> },
    { key: '/forms',     label: 'แบบฟอร์ม',       icon: <FileText size={ICON_SIZE} /> },
    ...(role === 'ADMIN' || role === 'SUPER_ADMIN'
      ? [{ key: '/inventory', label: 'คลังยา', icon: <Package size={ICON_SIZE} /> }]
      : []),
  ];

  const selectedKey = (navItems ?? []).find(
    (item) => item != null && pathname.startsWith((item as { key: string }).key),
  )?.key as string ?? '/dashboard';

  const userName: string = (session as any)?.displayName ?? (session as any)?.user?.name ?? 'ผู้ใช้งาน';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      style={{
        width: 220, background: '#fff', borderRight: '1px solid #f0f0f0',
        display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: '#1677ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1, marginBottom: 2 }}>
            HomeMed
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111', lineHeight: 1 }}>
            Connect
          </div>
        </div>
      </div>

      {/* Navigation */}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={navItems}
        onClick={({ key }) => router.push(key)}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />

      {/* User footer */}
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#1677ff', fontSize: 11, fontWeight: 700 }}>
            {initials}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
              {userName}
            </Text>
            <Text style={{ fontSize: 10, color: '#bbb' }}>
              {role || 'USER'}
            </Text>
          </div>
        </div>
        <Button
          block
          size="small"
          icon={<LogOut size={12} />}
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ fontSize: 12 }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </aside>
  );
}
