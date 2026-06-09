'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Input } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function MedVolPatientsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setPatients(Array.isArray(d) ? d : []));
  }, [token]);

  const statusColor: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'gray' };
  const filtered = patients.filter((p) => !search || p.hn?.includes(search));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ผู้ป่วยทั้งหมด</h1>
        <Input.Search placeholder="ค้นหา HN" onSearch={setSearch} style={{ width: 220 }} allowClear />
      </div>
      <Table
        dataSource={filtered} rowKey="id" size="small"
        onRow={(r) => ({ onClick: () => router.push(`/medvol/patients/${r.id}`) })}
        columns={[
          { title: 'HN', dataIndex: 'hn' },
          { title: 'อายุ', dataIndex: 'age', render: (v) => v ? `${v} ปี` : '-' },
          { title: 'เพศ', dataIndex: 'gender', render: (v) => v ?? '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s]}>{s}</Tag> },
          { title: 'Zone', dataIndex: ['zone', 'name'], render: (v) => v ?? '-' },
          { title: 'โรค', dataIndex: 'conditions', render: (v: string[]) => v?.join(', ') ?? '-' },
        ]}
      />
    </div>
  );
}
