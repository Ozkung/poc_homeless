export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Statistic, Tag, Progress, Typography } from 'antd';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string; age?: number;
}

async function fetchPatients(token: string): Promise<Patient[]> {
  try {
    const res = await fetch(`${API_URL}/patients`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

async function fetchEventCount(token: string): Promise<number> {
  try {
    const now = new Date();
    const res = await fetch(`${API_URL}/events?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

const STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#ff4d4f', PENDING: '#faad14', STABLE: '#52c41a',
};
const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ',
};
const TAG_PRESET: Record<string, string> = {
  CRITICAL: 'error', PENDING: 'warning', STABLE: 'success',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patients, eventCount] = await Promise.all([fetchPatients(token), fetchEventCount(token)]);

  const critical = patients.filter((p) => p.status === 'CRITICAL').length;
  const pending = patients.filter((p) => p.status === 'PENDING').length;
  const stable = patients.filter((p) => p.status === 'STABLE').length;
  const tracked = stable + pending;
  const pct = patients.length > 0 ? Math.round((tracked / patients.length) * 100) : 0;
  const recent = patients.slice(-5).reverse();

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Overview
        </div>
        <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
          Dashboard
        </Title>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Hero card — 2 cols × 2 rows */}
        <Card
          style={{ gridColumn: 'span 2', gridRow: 'span 2', borderTop: '3px solid #1677ff' }}
          styles={{ body: { padding: 24 } }}
        >
          <Text type="secondary" style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            ภาพรวมผู้ป่วย
          </Text>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={patients.length}
              valueStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 52, fontWeight: 800, lineHeight: 1 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>ผู้ป่วยทั้งหมดในระบบ</Text>
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#1677ff"
            trailColor="#f0f0f0"
            style={{ margin: '16px 0 4px' }}
          />
          <Text type="secondary" style={{ fontSize: 11, fontFamily: "'Sarabun',sans-serif" }}>
            ติดตามแล้ว {tracked} ราย · {pct}%
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Tag color="error">● {critical} วิกฤต</Tag>
            <Tag color="warning">● {pending} รอดำเนินการ</Tag>
            <Tag color="success">● {stable} ปกติ</Tag>
          </div>

          <div style={{ height: 1, background: '#f5f5f5', margin: '20px -24px' }} />

          <Text type="secondary" style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
            ผู้ป่วยล่าสุด
          </Text>
          {recent.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีข้อมูลผู้ป่วย</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 0',
                    borderBottom: i < recent.length - 1 ? '1px solid #fafafa' : 'none',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${STATUS_COLOR[p.status]}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: STATUS_COLOR[p.status],
                  }}>
                    {p.name?.[0] ?? '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', fontFamily: "'Sarabun',sans-serif" }}>
                      HN {p.hn}{p.locationText ? ` · ${p.locationText}` : ''}
                    </div>
                  </div>
                  <Tag color={TAG_PRESET[p.status]}>{STATUS_LABEL[p.status]}</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Critical — 1×1 */}
        <Card style={{ borderTop: '3px solid #ff4d4f' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยวิกฤต
          </Text>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={critical}
              valueStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 44, fontWeight: 800, color: '#ff4d4f', lineHeight: 1 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>ต้องการความช่วยเหลือเร่งด่วน</Text>
          </div>
        </Card>

        {/* Events — 1×1 */}
        <Card style={{ borderTop: '3px solid #faad14' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            กิจกรรมเดือนนี้
          </Text>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={eventCount}
              valueStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 44, fontWeight: 800, color: '#faad14', lineHeight: 1 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
            </Text>
          </div>
        </Card>

        {/* Stable — 1×1 */}
        <Card style={{ borderTop: '3px solid #52c41a' }} styles={{ body: { padding: 24 } }}>
          <Text type="secondary" style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยปกติ
          </Text>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={stable}
              valueStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 44, fontWeight: 800, color: '#52c41a', lineHeight: 1 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>สถานะเสถียร</Text>
          </div>
        </Card>

      </div>
    </div>
  );
}
