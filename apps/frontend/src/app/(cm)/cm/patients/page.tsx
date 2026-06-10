'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Table, Input, Segmented, Tag, Typography, Card, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string; age?: number;
  caseManager?: { id: string; displayName: string } | null;
  updatedAt?: string;
}

const STATUS_TAG: Record<string, React.ReactNode> = {
  CRITICAL: <Tag color="error">วิกฤต</Tag>,
  PENDING:  <Tag color="warning">รอดำเนินการ</Tag>,
  STABLE:   <Tag color="success">ปกติ</Tag>,
};

const columns: ColumnsType<Patient> = [
  {
    title: 'ชื่อผู้ป่วย', dataIndex: 'name', key: 'name',
    render: (name, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <Text type="secondary" style={{ fontSize: 11, fontFamily: "'Sarabun',sans-serif" }}>HN {r.hn}</Text>
      </div>
    ),
  },
  {
    title: 'สถานะ', dataIndex: 'status', key: 'status',
    render: (s) => STATUS_TAG[s] ?? <Tag>{s}</Tag>,
    width: 130,
  },
  {
    title: 'อายุ', dataIndex: 'age', key: 'age',
    render: (a) => a ? `${a} ปี` : '—',
    width: 80,
  },
  {
    title: 'สถานที่', dataIndex: 'locationText', key: 'locationText',
    render: (l) => l ?? '—',
  },
  {
    title: 'CM ผู้รับผิดชอบ', dataIndex: 'caseManager', key: 'caseManager', width: 160,
    render: (cm) => cm?.displayName ?? <Text type="secondary">—</Text>,
  },
  {
    title: 'อัปเดตล่าสุด', dataIndex: 'updatedAt', key: 'updatedAt', width: 130,
    render: (v) => v ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
    sorter: (a, b) => new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime(),
    defaultSortOrder: 'descend',
  },
  {
    title: '', key: 'action', width: 110,
    render: (_, r) => (
      <Link href={`/cm/patients/${r.id}`}>
        <Button size="small" type="link">ดูโปรไฟล์ →</Button>
      </Link>
    ),
  },
];

const FILTER_OPTIONS = [
  { label: 'ทั้งหมด', value: 'ALL' },
  { label: 'วิกฤต', value: 'CRITICAL' },
  { label: 'รอดำเนินการ', value: 'PENDING' },
  { label: 'ปกติ', value: 'STABLE' },
];

export default function PatientsPage() {
  const { data: session } = useSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/patients`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setPatients(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session?.accessToken]);

  const filtered = patients.filter((p) => {
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.hn.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Patients
          </div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
            รายชื่อผู้ป่วย
          </Title>
        </div>
        <Link href="/cm/patients/new">
          <Button type="primary">+ เพิ่มผู้ป่วย</Button>
        </Link>
      </div>

      <Card styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search
            placeholder="ค้นหาชื่อ หรือ HN..."
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Segmented
            options={FILTER_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
          />
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
            แสดง {filtered.length} จาก {patients.length} ราย
          </Text>
        </div>

        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ไม่มีข้อมูลผู้ป่วย' }}
          size="middle"
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  );
}
