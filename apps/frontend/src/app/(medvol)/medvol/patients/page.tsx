'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Input, Typography } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/patientStatus';

const { Text } = Typography;

export default function MedVolPatientsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setPatients(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.hn?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ผู้ป่วยทั้งหมด</h1>
        <Input.Search
          placeholder="ค้นหาชื่อ หรือ HN..."
          onSearch={setSearch}
          onChange={(e) => !e.target.value && setSearch('')}
          style={{ width: 260 }}
          allowClear
        />
      </div>
      <Table
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={loading}
        onRow={(r) => ({ onClick: () => router.push(`/medvol/patients/${r.id}`), style: { cursor: 'pointer' } })}
        pagination={{ pageSize: 20, showTotal: (t) => `ทั้งหมด ${t} คน` }}
        locale={{ emptyText: 'ไม่พบผู้ป่วย' }}
        scroll={{ x: 600 }}
        columns={[
          {
            title: 'ชื่อ-นามสกุล', dataIndex: 'name',
            render: (name: string, r: any) => (
              <div>
                <div style={{ fontWeight: 600 }}>{name ?? '-'}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>HN {r.hn}</Text>
              </div>
            ),
          },
          { title: 'อายุ', dataIndex: 'age', width: 70, render: (v) => v ? `${v} ปี` : '-' },
          {
            title: 'เพศ', dataIndex: 'gender', width: 70,
            render: (v) => v === 'MALE' ? 'ชาย' : v === 'FEMALE' ? 'หญิง' : '-',
          },
          {
            title: 'สถานะ', dataIndex: 'status', width: 120,
            render: (s) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_LABEL[s] ?? s}</Tag>,
          },
          {
            title: 'Zone', dataIndex: 'zone', width: 130,
            render: (z: any) => z ? <Tag color={z.color ?? 'default'}>{z.name}</Tag> : <Text type="secondary">-</Text>,
          },
          {
            title: 'โรคประจำตัว', dataIndex: 'conditions',
            render: (v: string[]) => v?.length ? v.join(', ') : <Text type="secondary">-</Text>,
          },
        ]}
      />
    </div>
  );
}
