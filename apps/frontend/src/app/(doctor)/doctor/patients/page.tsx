'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Select, Input, Card, Typography, Spin, message } from 'antd';
import { Search } from 'lucide-react';
import { STATUS_COLOR, STATUS_OPTIONS } from '@/lib/patientStatus';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
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

  async function handleStatusChange(patientId: string, newStatus: string) {
    const prev = patients.find((p) => p.id === patientId)?.status;
    setPatients((ps) => ps.map((p) => p.id === patientId ? { ...p, status: newStatus } : p));
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) message.success('อัปเดตสถานะแล้ว');
      else { message.error('อัปเดตไม่สำเร็จ'); setPatients((ps) => ps.map((p) => p.id === patientId ? { ...p, status: prev } : p)); }
    } catch { setPatients((ps) => ps.map((p) => p.id === patientId ? { ...p, status: prev } : p)); }
  }

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    return !q ||
      p.hn?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.locationText?.toLowerCase().includes(q);
  });

  const columns = [
    {
      title: 'ชื่อ-นามสกุล', dataIndex: 'name',
      render: (v: string, r: any) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{v ?? '-'}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>HN {r.hn}</Text>
        </div>
      ),
    },
    {
      title: 'Triage', dataIndex: 'status', width: 155,
      render: (v: string, r: any) => (
        <Select
          value={v}
          size="small"
          style={{ width: 140 }}
          options={STATUS_OPTIONS.map((o) => ({
            value: o.value,
            label: <Tag color={STATUS_COLOR[o.value]} style={{ margin: 0 }}>{o.label}</Tag>,
          }))}
          onChange={(val) => handleStatusChange(r.id, val)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
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
            placeholder="ค้นหาชื่อ, HN หรือสถานที่..."
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
