'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import { DatePicker } from 'antd';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const TaskStreamgraph = dynamic(
  () => import('@/components/charts/TaskStreamgraph'),
  { ssr: false, loading: () => <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>กำลังโหลดกราฟ...</div> },
);

interface CMStats {
  myPatientsCount: number;
  myFWCount: number;
  taskSuccessRate: number;
  statusImproved: number;
  zoneCards: { zoneId: string; zoneName: string; count: number }[];
  recentActions: { createdAt: string; type: string; actor: { displayName: string }; patient: { hn: string } | null }[];
  monthlyTaskStatus: { months: string[]; series: { name: string; data: number[] }[] };
}

export default function CMDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<CMStats | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);

  useEffect(() => {
    if (!token) return;
    const [from, to] = dateRange;
    fetch(`/api/dashboard/cm?from=${from.toISOString()}&to=${to.toISOString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then(setStats);
  }, [token, dateRange]);

  const activityTypeColor: Record<string, string> = {
    FORM_SUBMIT: 'blue', CHECK_IN: 'green', SOS: 'red', STATUS_CHANGE: 'orange', NOTE: 'default',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD MMM YYYY"
        />
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยในมือ" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="CARE_GIVER" value={stats?.myFWCount ?? '-'} suffix="คน" /></Card></Col>
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
          <Card title="Task Status" styles={{ body: { paddingBottom: 8 } }}>
            {stats?.monthlyTaskStatus ? (
              <TaskStreamgraph
                months={stats.monthlyTaskStatus.months}
                series={stats.monthlyTaskStatus.series}
              />
            ) : (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                กำลังโหลด...
              </div>
            )}
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
