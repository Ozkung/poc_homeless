'use client';
import { useState } from 'react';
import { Button, Select, message } from 'antd';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const OPTIONS = [
  { value: 'STABLE',   label: 'ปกติ' },
  { value: 'PENDING',  label: 'รอดำเนินการ' },
  { value: 'CRITICAL', label: 'วิกฤต' },
  { value: 'MISSING',  label: 'สูญหาย' },
];

interface Props {
  patientId: string;
  currentStatus: string;
  token: string;
}

export default function StatusUpdateButton({ patientId, currentStatus, token }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);

  async function handleUpdate() {
    if (status === currentStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) message.success('อัปเดตสถานะแล้ว');
      else message.error('อัปเดตไม่สำเร็จ');
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Select
        value={status}
        onChange={setStatus}
        size="small"
        style={{ width: 148 }}
        options={OPTIONS}
      />
      <Button
        size="small"
        type="primary"
        loading={saving}
        disabled={status === currentStatus}
        onClick={handleUpdate}
      >
        อัปเดตสถานะ
      </Button>
    </div>
  );
}
