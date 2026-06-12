'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, Tag, Typography, Spin, List, Button } from 'antd';
import { MapPin, CalendarDays, UserCircle } from 'lucide-react';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function GuestDashboardPage() {
  const { data: session } = useSession();
  const [me, setMe] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) return;
    const h = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
      fetch(`${API_URL}/auth/me`, { headers: h }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/doctor/schedules`, { headers: h }).then((r) => r.ok ? r.json() : []),
    ]).then(([meData, schedData]) => {
      setMe(meData);
      const upcoming = (Array.isArray(schedData) ? schedData : [])
        .filter((s: any) => new Date(s.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSchedules(upcoming.slice(0, 10));
    }).finally(() => setLoading(false));
  }, [session?.accessToken]);

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      {/* Profile card */}
      <Card style={{ borderRadius: 16, marginBottom: 16, border: 'none', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCircle size={28} color="#16a34a" />
          </div>
          <div>
            <Title level={4} style={{ margin: 0 }}>{me?.displayName ?? '—'}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{me?.email}</Text>
            {me?.phone && <div style={{ fontSize: 12, color: '#6b7280' }}>{me.phone}</div>}
          </div>
          <Tag color="green" style={{ marginLeft: 'auto' }}>GUEST</Tag>
        </div>
      </Card>

      {/* Upcoming doctor schedules */}
      <Card
        title={<span><CalendarDays size={15} style={{ marginRight: 6 }} />กำหนดการลงพื้นที่ที่จะถึง</span>}
        style={{ borderRadius: 16 }}
      >
        {!schedules.length
          ? <Text type="secondary" style={{ fontSize: 13 }}>ยังไม่มีกำหนดการ</Text>
          : <List
              size="small"
              dataSource={schedules}
              renderItem={(s: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: 13 }}>
                          {new Date(s.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{s.startTime} – {s.endTime}</Text>
                        {s.zone && <Tag color={s.zone.color ?? 'default'} style={{ margin: 0 }}>{s.zone.name}</Tag>}
                      </div>
                    }
                    description={
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={11} />
                        <span>{s.location ?? 'ไม่ระบุสถานที่'}</span>
                        {s.doctor?.displayName && <span>· {s.doctor.displayName}</span>}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
        }
      </Card>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <Button
          onClick={() => { localStorage.removeItem('next-auth.session-token'); window.location.href = '/login'; }}
          type="text"
          style={{ color: '#9ca3af', fontSize: 12 }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </div>
  );
}
