'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Radio, message, Tag, Space } from 'antd';
import { useSession } from 'next-auth/react';
import { Check, X } from 'lucide-react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseClaim {
  id: string;
  requestDate: string;
  amount: number;
  description: string;
  additionalNote?: string | null;
  payeeType: 'SELF' | 'PATIENT' | 'CARE_GIVER';
  requester: { id: string; displayName: string; role: string };
  patient?: { id: string; hn: string } | null;
  payee?: { id: string; displayName: string } | null;
  status: ClaimStatus;
  reviewNote?: string | null;
}

const STATUS_COLOR: Record<ClaimStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<ClaimStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function AdminExpenseClaimsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClaimStatus>('PENDING');
  const [reviewTarget, setReviewTarget] = useState<{ claim: ExpenseClaim; status: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const res = await fetch(`${API_URL}/expense-claims${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setClaims(await res.json());
      else message.error('โหลดรายการคำขอเบิกเงินไม่สำเร็จ');
    } catch {
      message.error('โหลดรายการคำขอเบิกเงินไม่สำเร็จ');
    }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleReview() {
    if (!reviewTarget) return;
    const values = await reviewForm.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/expense-claims/${reviewTarget.claim.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: reviewTarget.status, reviewNote: values.reviewNote || undefined }),
      });
      if (res.ok) {
        message.success(reviewTarget.status === 'APPROVED' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว');
        setReviewTarget(null);
        reviewForm.resetFields();
        load();
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'ผู้ขอ', render: (_: any, r: ExpenseClaim) => `${r.requester.displayName} (${r.requester.role})` },
    { title: 'วันที่ขอ', dataIndex: 'requestDate', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'จำนวนเงิน', dataIndex: 'amount', render: (v: number) => `฿${v.toLocaleString()}` },
    { title: 'รายละเอียด', dataIndex: 'description' },
    {
      title: 'เบิกเพื่อ',
      render: (_: any, r: ExpenseClaim) => {
        if (r.payeeType === 'PATIENT') return `ผู้ป่วย (HN ${r.patient?.hn ?? '-'})`;
        if (r.payeeType === 'CARE_GIVER') return `Care Giver: ${r.payee?.displayName ?? '-'}`;
        return 'ตัวเอง';
      },
    },
    { title: 'สถานะ', dataIndex: 'status', render: (v: ClaimStatus) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
    {
      title: '',
      width: 160,
      render: (_: any, r: ExpenseClaim) => r.status === 'PENDING' ? (
        <Space>
          <Button size="small" icon={<Check size={13} />} onClick={() => setReviewTarget({ claim: r, status: 'APPROVED' })}>อนุมัติ</Button>
          <Button size="small" danger icon={<X size={13} />} onClick={() => setReviewTarget({ claim: r, status: 'REJECTED' })}>ปฏิเสธ</Button>
        </Space>
      ) : (r.reviewNote ?? '-'),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอเบิกเงิน</h1>
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

      <Table dataSource={claims} rowKey="id" size="small" columns={columns} />

      <Modal
        title={reviewTarget?.status === 'APPROVED' ? 'อนุมัติคำขอเบิกเงิน' : 'ปฏิเสธคำขอเบิกเงิน'}
        open={!!reviewTarget}
        onOk={handleReview}
        onCancel={() => { setReviewTarget(null); reviewForm.resetFields(); }}
        okText="ยืนยัน"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="reviewNote" label="หมายเหตุ (ถ้ามี)">
            <Input.TextArea rows={3} placeholder="ระบุเหตุผล (ไม่บังคับ)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
