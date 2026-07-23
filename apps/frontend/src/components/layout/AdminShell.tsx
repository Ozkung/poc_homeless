'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Map, Users, LogOut, ClipboardList, UserRound, Package, CalendarDays, Wallet } from 'lucide-react';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Text } = Typography;
const ICON_SIZE = 15;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const role: string = (session as any)?.role ?? '';
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const navItems: MenuProps['items'] = [
    { key: '/admin/dashboard',  label: 'Dashboard',  icon: <LayoutDashboard size={ICON_SIZE} /> },
    { key: '/admin/patients',   label: 'ผู้ป่วย',     icon: <UserRound size={ICON_SIZE} /> },
    { key: '/admin/events',     label: 'Events',      icon: <CalendarDays size={ICON_SIZE} /> },
    { key: '/admin/inventory',  label: 'Inventory',   icon: <Package size={ICON_SIZE} /> },
    { key: '/admin/zones',      label: 'Zones',       icon: <Map size={ICON_SIZE} /> },
    // ผู้ใช้งาน + Audit Log are SUPER_ADMIN-only on the backend — hide rather than show a confusing empty page
    ...(isSuperAdmin ? [{ key: '/admin/users', label: 'ผู้ใช้งาน', icon: <Users size={ICON_SIZE} /> }] : []),
    ...(isSuperAdmin ? [{ key: '/admin/audit-log', label: 'Audit Log', icon: <ClipboardList size={ICON_SIZE} /> }] : []),
    // Approval is SUPER_ADMIN-only on the backend — hide rather than show a confusing empty page
    ...(isSuperAdmin ? [{ key: '/admin/expense-claims', label: 'เบิกเงิน', icon: <Wallet size={ICON_SIZE} /> }] : []),
  ];

  const selectedKey = navItems.find((i) => i && pathname.startsWith((i as any).key))?.key as string ?? '/admin/dashboard';
  const userName: string = (session as any)?.displayName ?? 'Admin';
  const initials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
          <Text strong>Homeless Mobile Clinic</Text>
          <div style={{ fontSize: 10, color: '#7c3aed' }}>{role.replace('_', ' ')}</div>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={navItems} onClick={({ key }) => router.push(key)} style={{ flex: 1, border: 'none', paddingTop: 8 }} />
        <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
            <Avatar size={28} style={{ background: '#7c3aed', fontSize: 11, fontWeight: 700 }}>{initials}</Avatar>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>{userName}</Text>
          </div>
          <Button block size="small" icon={<LogOut size={12} />} onClick={() => signOut({ callbackUrl: '/login' })}>ออกจากระบบ</Button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 28 }}>{children}</main>
    </div>
  );
}
