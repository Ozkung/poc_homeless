'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Radio, Select, message, Tag } from 'antd';
import { useSession } from 'next-auth/react';
import { Plus } from 'lucide-react';
import dayjs from 'dayjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type PayeeType = 'SELF' | 'PATIENT' | 'CARE_GIVER';
type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseClaim {
  id: string;
  requestDate: string;
  amount: number;
  description: string;
  additionalNote?: string | null;
  payeeType: PayeeType;
  patient?: { id: string; hn: string } | null;
  payee?: { id: string; displayName: string } | null;
  status: ClaimStatus;
  reviewNote?: string | null;
}

const STATUS_COLOR: Record<ClaimStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red' };
const STATUS_LABEL: Record<ClaimStatus, string> = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export default function CMExpenseClaimsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [careGivers, setCareGivers] = useState<{ id: string; displayName: string; supervisor?: { displayName: string } | null }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const payeeType: PayeeType = Form.useWatch('payeeType', form) ?? 'SELF';

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/expense-claims/mine`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setClaims(await res.json());
      else message.error('โหลดประวัติคำขอเบิกเงินไม่สำเร็จ');
    } catch {
      message.error('โหลดประวัติคำขอเบิกเงินไม่สำเร็จ');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    let hadError = false;
    Promise.all([
      fetch(`${API_URL}/patients`, { headers }).then((r) => { if (!r.ok) hadError = true; return r.ok ? r.json() : []; }),
      fetch(`${API_URL}/users/care-givers`, { headers }).then((r) => { if (!r.ok) hadError = true; return r.ok ? r.json() : []; }),
    ]).then(([p, cg]) => {
      setPatients(Array.isArray(p) ? p : []);
      setCareGivers(Array.isArray(cg) ? cg : []);
      if (hadError) message.error('โหลดข้อมูลผู้ป่วย/Care Giver ไม่สำเร็จ');
    }).catch(() => {
      message.error('โหลดข้อมูลผู้ป่วย/Care Giver ไม่สำเร็จ');
    });
  }, [token]);

  async function handleCreate() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/expense-claims`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestDate: values.requestDate.toISOString(),
          amount: values.amount,
          description: values.description,
          additionalNote: values.additionalNote || undefined,
          payeeType: values.payeeType,
          patientId: values.payeeType === 'PATIENT' ? values.patientId : undefined,
          payeeId: values.payeeType === 'CARE_GIVER' ? values.payeeId : undefined,
        }),
      });
      if (res.ok) {
        message.success('ส่งคำขอเบิกเงินแล้ว');
        setCreateOpen(false);
        form.resetFields();
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err?.message ?? 'เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  const columns = [
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
    { title: 'หมายเหตุจากผู้อนุมัติ', dataIndex: 'reviewNote', render: (v?: string) => v ?? '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>คำขอเบิกเงิน</h1>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
          + สร้างคำขอเบิกเงิน
        </Button>
      </div>

      <Table dataSource={claims} rowKey="id" size="small" columns={columns} />

      <Modal
        title="สร้างคำขอเบิกเงิน"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        okText="ส่งคำขอ"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ payeeType: 'SELF', requestDate: dayjs() }}>
          <Form.Item name="requestDate" label="วันที่ขอ" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="amount" label="จำนวนเงิน (บาท)" rules={[{ required: true, message: 'กรุณาระบุจำนวนเงิน' }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter="บาท" />
          </Form.Item>
          <Form.Item name="description" label="รายละเอียด (เกิดจากอะไร)" rules={[{ required: true, message: 'กรุณาระบุรายละเอียด' }]}>
            <Input placeholder="เช่น ค่าเดินทางไปเยี่ยมผู้ป่วย" />
          </Form.Item>
          <Form.Item name="additionalNote" label="เหตุผลการเบิก (ถ้ามี)">
            <Input.TextArea rows={2} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" />
          </Form.Item>
          <Form.Item name="payeeType" label="เบิกเพื่อ" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: 'ตัวเอง', value: 'SELF' },
                { label: 'ผู้ป่วย', value: 'PATIENT' },
                { label: 'Care Giver', value: 'CARE_GIVER' },
              ]}
            />
          </Form.Item>
          {payeeType === 'PATIENT' && (
            <Form.Item name="patientId" label="เลือกผู้ป่วย" rules={[{ required: true, message: 'กรุณาเลือกผู้ป่วย' }]}>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="label"
                options={patients.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          )}
          {payeeType === 'CARE_GIVER' && (
            <Form.Item name="payeeId" label="เลือก Care Giver" rules={[{ required: true, message: 'กรุณาเลือก Care Giver' }]}>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="label"
                options={careGivers.map((cg) => ({
                  value: cg.id,
                  label: cg.supervisor ? `${cg.displayName} (ทีม ${cg.supervisor.displayName})` : cg.displayName,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
