'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';

interface CMStats {
  myPatientsCount: number;
  myFWCount: number;
  taskSuccessRate: number;
  statusImproved: number;
  zoneCards: { zoneId: string; zoneName: string; count: number }[];
  recentActions: { createdAt: string; type: string; actor: { displayName: string }; patient: { hn: string } | null }[];
}

export default function CMDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<CMStats | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard/cm', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  }, [token]);

  const activityTypeColor: Record<string, string> = {
    FORM_SUBMIT: 'blue', CHECK_IN: 'green', SOS: 'red', STATUS_CHANGE: 'orange', NOTE: 'default',
  };

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยในมือ" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="FIELD_WORKER" value={stats?.myFWCount ?? '-'} suffix="คน" /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Success" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Status Improved" value={stats?.statusImproved ?? '-'} suffix="คน" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="ผู้ป่วยแยกตาม Zone">
            {(stats?.zoneCards ?? []).map((z) => (
              <div key={z.zoneId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 600 }}>{z.zoneName}</span>
                <span>{z.count} คน</span>
              </div>
            ))}
            {!stats?.zoneCards?.length && <div style={{ color: '#999', padding: '16px 0' }}>ยังไม่มีผู้ป่วยใน Zone</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Cumulative Success Rate — 6 เดือน">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ background: '#52c41a', width: '100%', height: `${30 + i * 8}px`, borderRadius: '3px 3px 0 0', opacity: 0.6 + i * 0.07 }} />
                  <div style={{ fontSize: 10, color: '#999' }}>{['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.'][i]}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>Task ✓ + Status Improved</div>
          </Card>
        </Col>
      </Row>

      <Card title="Recent Actions — ทีมของฉัน">
        <Table
          dataSource={stats?.recentActions ?? []}
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'เวลา', dataIndex: 'createdAt', render: (v) => new Date(v).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
            { title: 'FW', render: (_, r) => r.actor.displayName },
            { title: 'HN', render: (_, r) => r.patient?.hn ?? '-' },
            { title: 'Action', dataIndex: 'type', render: (t) => <Tag color={activityTypeColor[t] ?? 'default'}>{t}</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}
