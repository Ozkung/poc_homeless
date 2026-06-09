'use client';
import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function FWPatientsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [patients, setPatients] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setPatients(Array.isArray(d) ? d : []));
  }, [token]);

  const statusColor: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'gray' };

  return (
    <div>
      <h1 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>ผู้ป่วยของฉัน</h1>
      <Table
        dataSource={patients} rowKey="id" size="small"
        onRow={(r) => ({ onClick: () => router.push(`/fw/patients/${r.id}`) })}
        columns={[
          { title: 'HN', dataIndex: 'hn' },
          { title: 'อายุ', dataIndex: 'age', render: (v) => v ? `${v} ปี` : '-' },
          { title: 'เพศ', dataIndex: 'gender', render: (v) => v ?? '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s]}>{s}</Tag> },
          { title: 'Zone', dataIndex: ['zone', 'name'], render: (v) => v ?? '-' },
        ]}
      />
    </div>
  );
}
