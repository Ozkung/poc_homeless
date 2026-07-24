'use client';
import { useEffect, useState, useCallback } from 'react';
import { Button, Modal, Table, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiAccessTokenRow {
  id: string;
  grantedLevel: 'VIEW' | 'CREATE_UPDATE';
  grantedScope: Record<string, string[]>;
  isRevoked: boolean;
  createdAt: string;
  request: { requesterName: string; requesterOrg?: string | null; email: string };
}

export default function AdminApiAccessTokensPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [tokens, setTokens] = useState<ApiAccessTokenRow[]>([]);
  const [modal, contextHolder] = Modal.useModal();

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api-access-requests/tokens/all`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setTokens(await res.json());
      else message.error('โหลดรายการ Token ไม่สำเร็จ');
    } catch {
      message.error('โหลดรายการ Token ไม่สำเร็จ');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleRevoke(id: string) {
    const res = await fetch(`${API_URL}/api-access-requests/tokens/${id}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      message.success('เพิกถอน Token แล้ว');
      load();
    } else {
      message.error('เกิดข้อผิดพลาด');
    }
  }

  const columns = [
    { title: 'ผู้ขอ', render: (_: any, r: ApiAccessTokenRow) => r.request.requesterName },
    { title: 'หน่วยงาน', render: (_: any, r: ApiAccessTokenRow) => r.request.requesterOrg ?? '-' },
    { title: 'อีเมล', render: (_: any, r: ApiAccessTokenRow) => r.request.email },
    { title: 'ระดับ', dataIndex: 'grantedLevel', render: (v: string) => (v === 'VIEW' ? 'View' : 'Create + Update') },
    { title: 'ข้อมูลที่เข้าถึงได้', dataIndex: 'grantedScope', render: (v: Record<string, string[]>) => Object.keys(v).join(', ') },
    { title: 'ออกให้เมื่อ', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    {
      title: 'สถานะ',
      dataIndex: 'isRevoked',
      render: (v: boolean) => (v ? <Tag color="red">เพิกถอนแล้ว</Tag> : <Tag color="green">ใช้งานได้</Tag>),
    },
    {
      title: '',
      render: (_: any, r: ApiAccessTokenRow) =>
        !r.isRevoked && (
          <Button
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: 'ยืนยันการเพิกถอน Token',
                content: `Token ของ ${r.request.requesterName} จะไม่สามารถใช้งานได้อีก`,
                okText: 'เพิกถอน',
                okButtonProps: { danger: true },
                onOk: () => handleRevoke(r.id),
              })
            }
          >
            เพิกถอน
          </Button>
        ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>Token การใช้งาน Open API</h1>
      <Table dataSource={tokens} rowKey="id" size="small" columns={columns} />
    </div>
  );
}
