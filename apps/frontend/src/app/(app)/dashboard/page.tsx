export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Statistic, Tag, Progress } from 'antd';
import SeverityChart from '@/components/charts/SeverityChart';
import AgeClusterChart, { type AgeBand } from '@/components/charts/AgeClusterChart';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

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

function computeAgeBands(patients: Patient[]): AgeBand[] {
  const bands: Record<string, { critical: number; pending: number; stable: number }> = {
    '<20':    { critical: 0, pending: 0, stable: 0 },
    '20–40':  { critical: 0, pending: 0, stable: 0 },
    '40–60':  { critical: 0, pending: 0, stable: 0 },
    '60+':    { critical: 0, pending: 0, stable: 0 },
    'ไม่ระบุ': { critical: 0, pending: 0, stable: 0 },
  };

  for (const p of patients) {
    const key =
      p.age == null ? 'ไม่ระบุ'
      : p.age < 20  ? '<20'
      : p.age < 40  ? '20–40'
      : p.age < 60  ? '40–60'
      : '60+';

    const field = p.status === 'CRITICAL' ? 'critical' : p.status === 'PENDING' ? 'pending' : 'stable';
    bands[key][field]++;
  }

  return Object.entries(bands)
    .filter(([, v]) => v.critical + v.pending + v.stable > 0)
    .map(([label, v]) => ({ label, ...v }));
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patients, eventCount] = await Promise.all([fetchPatients(token), fetchEventCount(token)]);

  const critical = patients.filter((p) => p.status === 'CRITICAL').length;
  const pending  = patients.filter((p) => p.status === 'PENDING').length;
  const stable   = patients.filter((p) => p.status === 'STABLE').length;
  const tracked  = stable + pending;
  const pct = patients.length > 0 ? Math.round((tracked / patients.length) * 100) : 0;
  const ageBands = computeAgeBands(patients);

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Overview
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
          Dashboard
        </h2>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Hero card — 2 cols × 2 rows */}
        <Card
          style={{ gridColumn: 'span 2', gridRow: 'span 2', borderTop: '3px solid #1677ff' }}
          styles={{ body: { padding: 24 } }}
        >
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ภาพรวมผู้ป่วย
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={patients.length}
              valueStyle={{ fontSize: 52, fontWeight: 800, lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>ผู้ป่วยทั้งหมดในระบบ</span>
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#1677ff"
            trailColor="#f0f0f0"
            style={{ margin: '16px 0 4px' }}
          />
          <span style={{ fontSize: 11, color: '#888' }}>
            ติดตามแล้ว {tracked} ราย · {pct}%
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <Tag color="error">● {critical} วิกฤต</Tag>
            <Tag color="warning">● {pending} รอดำเนินการ</Tag>
            <Tag color="success">● {stable} ปกติ</Tag>
          </div>

          {/* Severity chart — replaces "recent patients" section */}
          <div style={{ borderTop: '1px solid #f5f5f5', margin: '20px -24px 0', padding: '16px 24px 0' }}>
            <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
              วิเคราะห์ตามความร้ายแรง
            </div>
            <SeverityChart critical={critical} pending={pending} stable={stable} />
          </div>
        </Card>

        {/* Critical — 1×1 */}
        <Card style={{ borderTop: '3px solid #ff4d4f' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยวิกฤต
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={critical}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#ff4d4f', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>ต้องการความช่วยเหลือเร่งด่วน</span>
          </div>
        </Card>

        {/* Events — 1×1 */}
        <Card style={{ borderTop: '3px solid #faad14' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            กิจกรรมเดือนนี้
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={eventCount}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#faad14', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>
              {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </Card>

        {/* Stable — 1×1 */}
        <Card style={{ borderTop: '3px solid #52c41a' }} styles={{ body: { padding: 24 } }}>
          <span style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase' }}>
            ผู้ป่วยปกติ
          </span>
          <div style={{ marginTop: 8 }}>
            <Statistic
              value={stable}
              valueStyle={{ fontSize: 44, fontWeight: 800, color: '#52c41a', lineHeight: 1 }}
            />
            <span style={{ fontSize: 12, color: '#888' }}>สถานะเสถียร</span>
          </div>
        </Card>

        {/* Age Cluster chart — full 3-col span */}
        <Card
          style={{ gridColumn: 'span 3', borderTop: '3px solid #722ed1' }}
          styles={{ body: { padding: 24 } }}
        >
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Cluster ผู้ป่วยตามช่วงอายุ
          </div>
          {ageBands.length === 0 ? (
            <span style={{ fontSize: 12, color: '#bbb' }}>ยังไม่มีข้อมูลผู้ป่วย</span>
          ) : (
            <AgeClusterChart bands={ageBands} />
          )}
        </Card>

      </div>
    </div>
  );
}
