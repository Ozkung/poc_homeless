'use client';
import { useEffect, useRef, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import Highcharts from 'highcharts';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('highcharts/modules/streamgraph')(Highcharts);
}

interface MonthlyTaskStatus {
  months: string[];
  series: { name: string; data: number[] }[];
}

interface CMStats {
  myPatientsCount: number;
  myFWCount: number;
  taskSuccessRate: number;
  statusImproved: number;
  zoneCards: { zoneId: string; zoneName: string; count: number }[];
  recentActions: { createdAt: string; type: string; actor: { displayName: string }; patient: { hn: string } | null }[];
  monthlyTaskStatus: MonthlyTaskStatus;
}

const STATUS_COLOR: Record<string, string> = {
  DONE:        '#52c41a',
  IN_PROGRESS: '#1677ff',
  PENDING:     '#faad14',
  NOT_FOUND:   '#d9d9d9',
};

const STATUS_LABEL: Record<string, string> = {
  DONE:        'เสร็จแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  PENDING:     'รอดำเนินการ',
  NOT_FOUND:   'ไม่พบผู้ป่วย',
};

function StreamgraphChart({ data }: { data: MonthlyTaskStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data?.months?.length) return;

    const thaiMonths = data.months.map((m) => {
      const [y, mo] = m.split('-');
      const d = new Date(Number(y), Number(mo) - 1, 1);
      return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    });

    const series = data.series.map((s) => ({
      name: STATUS_LABEL[s.name] ?? s.name,
      data: s.data,
      color: STATUS_COLOR[s.name] ?? '#ccc',
    }));

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = Highcharts.chart(containerRef.current, {
      chart: {
        type: 'streamgraph',
        backgroundColor: 'transparent',
        height: 200,
        margin: [10, 10, 30, 10],
        style: { fontFamily: 'inherit' },
      },
      title: { text: undefined },
      xAxis: {
        categories: thaiMonths,
        labels: { style: { fontSize: '10px', color: '#999' } },
        lineColor: 'transparent',
        tickColor: 'transparent',
      },
      yAxis: {
        visible: false,
        startOnTick: false,
        endOnTick: false,
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { fontSize: '10px', fontWeight: '400', color: '#666' },
        symbolRadius: 4,
        margin: 4,
      },
      tooltip: {
        shared: true,
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}</b><br/>',
      },
      plotOptions: {
        series: {
          lineWidth: 0,
          marker: { enabled: false },
        },
      },
      series: series as any,
      credits: { enabled: false },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [data]);

  return <div ref={containerRef} />;
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
          <Card title="Task Status — 6 เดือน" styles={{ body: { paddingBottom: 8 } }}>
            {stats?.monthlyTaskStatus ? (
              <StreamgraphChart data={stats.monthlyTaskStatus} />
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
