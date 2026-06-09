'use client';
import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { useSession } from 'next-auth/react';

export default function FWTasksPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/tasks/my', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setTasks(Array.isArray(d) ? d : []));
  }, [token]);

  const statusColor: Record<string, string> = { PENDING: 'orange', IN_PROGRESS: 'blue', DONE: 'green', NOT_FOUND: 'red' };

  return (
    <div>
      <h1 style={{ marginBottom: 16, fontSize: 22, fontWeight: 700 }}>งานของฉัน</h1>
      <Table
        dataSource={tasks} rowKey="id" size="small"
        columns={[
          { title: 'งาน', render: (_, r) => r.event?.title ?? '-' },
          { title: 'ผู้ป่วย HN', render: (_, r) => r.patient?.hn ?? '-' },
          { title: 'กำหนด', render: (_, r) => r.event?.endDate ? new Date(r.event.endDate).toLocaleDateString('th-TH') : '-' },
          { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={statusColor[s] ?? 'default'}>{s}</Tag> },
        ]}
      />
    </div>
  );
}
