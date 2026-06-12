'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin } from 'antd';
import { Users, Stethoscope, CalendarDays, Activity } from 'lucide-react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_COLOR: Record<string, string> = {
  CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'default',
};
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'Emergency', PENDING: 'Urgency', STABLE: 'Semi-urgency', MISSING: 'Missing' }
const SEVERITY_COLOR: Record<string, string> = { MILD: 'green', MODERATE: 'orange', SEVERE: 'red' };

export default function DoctorDashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/doctor/dashboard`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>;
  if (!data) return <div style={{ padding: 24, color: '#999' }}>ไม่สามารถโหลดข้อมูลได้</div>;

  const genderOptions: Highcharts.Options = {
    chart: { type: 'pie', height: 220, margin: [0, 0, 30, 0] },
    title: { text: '' },
    tooltip: { pointFormat: '{point.name}: <b>{point.y}</b> ({point.percentage:.0f}%)' },
    plotOptions: { pie: { dataLabels: { enabled: true, format: '{point.name}: {point.y}', style: { fontSize: '11px' } } } },
    series: [{
      type: 'pie',
      data: [
        { name: 'ชาย',   y: data.genderCounts?.MALE ?? 0,   color: '#3b82f6' },
        { name: 'หญิง',  y: data.genderCounts?.FEMALE ?? 0, color: '#ec4899' },
        { name: 'อื่นๆ', y: data.genderCounts?.OTHER ?? 0,  color: '#a3a3a3' },
      ],
    }],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  const ageOptions: Highcharts.Options = {
    chart: { type: 'column', height: 220 },
    title: { text: '' },
    xAxis: { categories: (data.ageClusters ?? []).map((b: any) => b.label) },
    yAxis: { title: { text: '' }, allowDecimals: false },
    legend: { itemStyle: { fontSize: '11px' } },
    plotOptions: { column: { grouping: true, borderRadius: 3 } },
    series: [
      { type: 'column', name: 'ชาย',   data: (data.ageClusters ?? []).map((b: any) => b.male),   color: '#3b82f6' },
      { type: 'column', name: 'หญิง',  data: (data.ageClusters ?? []).map((b: any) => b.female), color: '#ec4899' },
      { type: 'column', name: 'อื่นๆ', data: (data.ageClusters ?? []).map((b: any) => b.other),  color: '#a3a3a3' },
    ],
    credits: { enabled: false },
  };

  const diagCols = [
    { title: 'HN', dataIndex: ['patient', 'hn'], width: 80 },
    { title: 'การวินิจฉัย', dataIndex: 'title' },
    { title: 'ระดับ', dataIndex: 'severity', width: 80, render: (v: string) => v ? <Tag color={SEVERITY_COLOR[v]}>{v}</Tag> : '-' },
    { title: 'แพทย์', dataIndex: ['doctor', 'displayName'], width: 120 },
    { title: 'วันที่', dataIndex: 'createdAt', width: 100, render: (v: string) => new Date(v).toLocaleDateString('th-TH') },
  ];

  const scheduleCols = [
    { title: 'วันที่', dataIndex: 'date', render: (v: string) => new Date(v).toLocaleDateString('th-TH'), width: 100 },
    { title: 'เวลา', render: (_: any, r: any) => `${r.startTime} – ${r.endTime}`, width: 110 },
    { title: 'สถานที่', dataIndex: 'location', render: (v: string) => v ?? '-' },
    { title: 'แพทย์', dataIndex: ['doctor', 'displayName'] },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Doctor Portal</Text>
        <Title level={3} style={{ margin: 0 }}>Dashboard</Title>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {[
          { label: 'ผู้ป่วยทั้งหมด', value: data.total, icon: <Users size={20} color="#0ea5e9" />, color: '#e0f2fe' },
          { label: 'วิกฤต',          value: data.statusCounts?.CRITICAL ?? 0, icon: <Activity size={20} color="#ef4444" />, color: '#fee2e2' },
          { label: 'ปกติ',           value: data.statusCounts?.STABLE ?? 0,   icon: <Stethoscope size={20} color="#22c55e" />, color: '#dcfce7' },
          { label: 'ตารางที่จะถึง',  value: data.upcomingSchedules?.length ?? 0, icon: <CalendarDays size={20} color="#f59e0b" />, color: '#fef3c7' },
        ].map(({ label, value, icon, color }) => (
          <Col xs={12} sm={6} key={label}>
            <Card style={{ borderRadius: 12, border: 'none', background: color }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Statistic title={<span style={{ fontSize: 12 }}>{label}</span>} value={value} valueStyle={{ fontSize: 28, fontWeight: 700 }} />
                {icon}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={10}>
          <Card title="การกระจายเพศผู้ป่วย" size="small" style={{ borderRadius: 12 }}>
            <HighchartsReact highcharts={Highcharts} options={genderOptions} />
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title="Cluster ผู้ป่วยตามช่วงอายุและเพศ" size="small" style={{ borderRadius: 12 }}>
            <HighchartsReact highcharts={Highcharts} options={ageOptions} />
          </Card>
        </Col>
      </Row>

      {/* Tables */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="การวินิจฉัยล่าสุด" size="small" style={{ borderRadius: 12 }}>
            <Table
              size="small"
              dataSource={data.recentDiagnoses ?? []}
              columns={diagCols}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'ยังไม่มีข้อมูลการวินิจฉัย' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="ตารางลงพื้นที่ที่จะถึง" size="small" style={{ borderRadius: 12 }}>
            <Table
              size="small"
              dataSource={data.upcomingSchedules ?? []}
              columns={scheduleCols}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'ยังไม่มีกำหนดการ' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
