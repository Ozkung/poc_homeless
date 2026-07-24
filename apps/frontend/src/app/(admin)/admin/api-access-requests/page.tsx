'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Radio, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ApiAccessRequestRow {
  id: string;
  requesterName: string;
  requesterOrg?: string | null;
  email: string;
  requestedLevel: 'VIEW' | 'CREATE_UPDATE';
  status: RequestStatus;
  createdAt: string;
}

const STATUS_COLOR: Record<RequestStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<RequestStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function AdminApiAccessRequestsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const router = useRouter();
  const [requests, setRequests] = useState<ApiAccessRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequestStatus>('PENDING');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const res = await fetch(`${API_URL}/api-access-requests${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRequests(await res.json());
      else message.error('โหลดรายการคำขอไม่สำเร็จ');
    } catch {
      message.error('โหลดรายการคำขอไม่สำเร็จ');
    }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: 'ผู้ขอ', dataIndex: 'requesterName' },
    { title: 'หน่วยงาน', dataIndex: 'requesterOrg', render: (v?: string) => v ?? '-' },
    { title: 'อีเมล', dataIndex: 'email' },
    { title: 'ระดับ', dataIndex: 'requestedLevel', render: (v: string) => (v === 'VIEW' ? 'View' : 'Create + Update') },
    { title: 'วันที่ขอ', dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'สถานะ', dataIndex: 'status', render: (v: RequestStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอใช้งาน Open API</h1>
        <Radio.Group
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { label: 'รอพิจารณา', value: 'PENDING' },
            { label: 'อนุมัติแล้ว', value: 'APPROVED' },
            { label: 'ไม่อนุมัติ', value: 'REJECTED' },
            { label: 'ทั้งหมด', value: 'ALL' },
          ]}
          optionType="button"
        />
      </div>
      <Table
        dataSource={requests}
        rowKey="id"
        size="small"
        columns={columns}
        onRow={(record) => ({ onClick: () => router.push(`/admin/api-access-requests/${record.id}`) })}
        rowClassName={() => 'clickable-row'}
      />
    </div>
  );
}
