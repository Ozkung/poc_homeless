'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Table, Button, Card, Popconfirm, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FormTemplate {
  id: string; title: string; fields: unknown[];
  createdBy: { displayName: string }; updatedAt: string;
}

export default function FormsPage() {
  const { data: session } = useSession();
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/forms`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.json())
      .then((d) => { setForms(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(load, [session?.accessToken]);

  const handleDelete = async (id: string) => {
    await fetch(`${API_URL}/forms/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    });
    setForms((prev) => prev.filter((f) => f.id !== id));
  };

  const columns: ColumnsType<FormTemplate> = [
    {
      title: 'ชื่อแบบฟอร์ม', dataIndex: 'title', key: 'title',
      render: (title) => <span style={{ fontWeight: 600 }}>{title}</span>,
    },
    {
      title: 'จำนวนฟิลด์', dataIndex: 'fields', key: 'fields',
      render: (f: unknown[]) => `${f?.length ?? 0} ฟิลด์`,
      width: 110,
    },
    {
      title: 'สร้างโดย', dataIndex: ['createdBy', 'displayName'], key: 'createdBy',
      width: 160,
    },
    {
      title: 'อัปเดต', dataIndex: 'updatedAt', key: 'updatedAt',
      render: (d) => new Date(d).toLocaleDateString('th-TH'),
      width: 130,
    },
    {
      title: '', key: 'actions', width: 140,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/forms/${r.id}/builder`}>
            <Button size="small">แก้ไข</Button>
          </Link>
          <Popconfirm
            title="ลบแบบฟอร์มนี้?"
            onConfirm={() => handleDelete(r.id)}
            okText="ลบ"
            cancelText="ยกเลิก"
          >
            <Button size="small" danger>ลบ</Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Forms
          </div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
            แบบฟอร์ม
          </Title>
        </div>
        <Link href="/forms/new">
          <Button type="primary">+ สร้างแบบฟอร์ม</Button>
        </Link>
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={forms}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ยังไม่มีแบบฟอร์ม' }}
        />
      </Card>
    </div>
  );
}
