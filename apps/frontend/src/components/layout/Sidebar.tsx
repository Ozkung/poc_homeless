'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Avatar, Typography } from 'antd';
import { signOut, useSession } from 'next-auth/react';
import type { MenuProps } from 'antd';

const { Text } = Typography;

const items: MenuProps['items'] = [
  { key: '/dashboard', label: 'Dashboard', icon: <span>◈</span> },
  { key: '/patients', label: 'ผู้ป่วย', icon: <span>⊕</span> },
  { key: '/events', label: 'แผนการเยี่ยม', icon: <span>▦</span> },
  { key: '/forms', label: 'แบบฟอร์ม', icon: <span>▤</span> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const selectedKey = items.find((item) => pathname.startsWith(item!.key as string))?.key as string ?? '/dashboard';

  return (
    <aside
      style={{
        width: 220, background: '#fff', borderRight: '1px solid #f0f0f0',
        display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 }}>
          HomeMed
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: '#111' }}>
          Connect
        </div>
      </div>

      {/* Navigation */}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => router.push(key)}
        style={{ flex: 1, border: 'none', paddingTop: 8 }}
      />

      {/* User footer */}
      <div style={{ padding: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
          <Avatar size={28} style={{ background: '#1677ff', fontSize: 11, fontWeight: 700 }}>
            CM
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
              {(session as any)?.user?.name ?? 'Case Manager'}
            </Text>
            <Text style={{ fontSize: 10, color: '#bbb', fontFamily: "'JetBrains Mono', monospace" }}>
              CASE_MANAGER
            </Text>
          </div>
        </div>
        <Button
          block
          size="small"
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ fontSize: 12 }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </aside>
  );
}
