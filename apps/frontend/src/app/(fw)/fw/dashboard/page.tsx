'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, List } from 'antd';
import { useSession } from 'next-auth/react';

interface FWStats {
  myPatientsCount: number;
  todayPending: number;
  taskSuccessRate: number;
  medicationAdherence: { total: number; reported: number; list: { hn: string; reported: boolean }[] };
  ageDistribution: { label: string; count: number }[];
  topConditions: { condition: string; count: number }[];
  todayTasks: { id: string; status: string; event: { title: string }; patient: { hn: string } }[];
}

export default function FWDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<FWStats | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard/fw', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  }, [token]);

  const maxCondCount = Math.max(...(stats?.topConditions.map((c) => c.count) ?? [1]));
  const maxAge = Math.max(...(stats?.ageDistribution.map((a) => a.count) ?? [1]));

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยของฉัน" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="งานวันนี้ (ค้างอยู่)" value={stats?.todayPending ?? '-'} valueStyle={{ color: stats?.todayPending ? '#faad14' : undefined }} /></Card></Col>
        <Col span={6}><Card><Statistic title="กินยาครบ" value={stats ? `${stats.medicationAdherence.reported}/${stats.medicationAdherence.total}` : '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Success (เดือนนี้)" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={10}>
          <Card title="สถานะยา — ผู้ป่วยของฉัน" style={{ height: '100%' }}>
            <List
              size="small"
              dataSource={stats?.medicationAdherence.list ?? []}
              renderItem={(item) => (
                <List.Item extra={<Tag color={item.reported ? 'green' : 'red'}>{item.reported ? 'กินครบ' : 'ยังไม่รายงาน'}</Tag>}>
                  {item.hn}
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={7}>
          <Card title="ช่วงอายุผู้ป่วย">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
              {(stats?.ageDistribution ?? []).map((b) => (
                <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ background: '#d97706', width: '100%', height: `${Math.max((b.count / Math.max(maxAge, 1)) * 60, 4)}px`, borderRadius: '3px 3px 0 0' }} />
                  <div style={{ fontSize: 10, color: '#999' }}>{b.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>{b.count}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col span={7}>
          <Card title="Case ที่รับบ่อย">
            {(stats?.topConditions ?? []).map((c) => (
              <div key={c.condition} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{c.condition}</span><span>{c.count}</span>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#d97706', height: '100%', width: `${(c.count / Math.max(maxCondCount, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card title="งานวันนี้">
        <List
          size="small"
          dataSource={stats?.todayTasks ?? []}
          renderItem={(task) => (
            <List.Item extra={<Tag color={task.status === 'DONE' ? 'green' : task.status === 'IN_PROGRESS' ? 'blue' : 'orange'}>{task.status}</Tag>}>
              <List.Item.Meta title={task.event.title} description={`HN: ${task.patient.hn}`} />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
