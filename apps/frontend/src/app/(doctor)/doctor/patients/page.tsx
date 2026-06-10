'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Input, Card, Typography, Spin } from 'antd';
import { Search } from 'lucide-react';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'default' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ', MISSING: 'สูญหาย' };
const SEVERITY_COLOR: Record<string, string> = { MILD: 'green', MODERATE: 'orange', SEVERE: 'red' };

export default function DoctorPatientsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/doctor/patients`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setPatients(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  const filtered = patients.filter((p) =>
    p.hn?.toLowerCase().includes(search.toLowerCase()) ||
    p.locationText?.toLowerCase().includes(search.toLowerCase()),
  );

  const columns = [
    { title: 'HN', dataIndex: 'hn', width: 100 },
    {
      title: 'สถานะ', dataIndex: 'status', width: 110,
      render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] ?? v}</Tag>,
    },
    { title: 'อายุ', dataIndex: 'age', width: 60, render: (v: number) => v ?? '-' },
    {
      title: 'เพศ', dataIndex: 'gender', width: 70,
      render: (v: string) => v === 'MALE' ? 'ชาย' : v === 'FEMALE' ? 'หญิง' : v ?? '-',
    },
    { title: 'Zone', dataIndex: ['zone', 'name'], render: (v: string) => v ?? '-' },
    { title: 'CM', dataIndex: ['caseManager', 'displayName'], render: (v: string) => v ?? '-' },
    {
      title: 'วินิจฉัยล่าสุด',
      render: (_: any, r: any) => {
        const d = r.diagnoses?.[0];
        if (!d) return <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มี</Text>;
        return (
          <div>
            <Text style={{ fontSize: 12 }}>{d.title}</Text>
            {d.severity && <Tag color={SEVERITY_COLOR[d.severity]} style={{ marginLeft: 4, fontSize: 10 }}>{d.severity}</Tag>}
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Doctor Portal</Text>
        <Title level={3} style={{ margin: 0 }}>ผู้ป่วยทั้งหมด</Title>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <Input
            prefix={<Search size={14} />}
            placeholder="ค้นหา HN หรือสถานที่..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <Table
          loading={loading}
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          onRow={(r) => ({ onClick: () => router.push(`/doctor/patients/${r.id}`) })}
          rowClassName={() => 'cursor-pointer'}
          pagination={{ pageSize: 20, showTotal: (t) => `ทั้งหมด ${t} คน` }}
          locale={{ emptyText: 'ไม่พบผู้ป่วย' }}
        />
      </Card>
    </div>
  );
}
