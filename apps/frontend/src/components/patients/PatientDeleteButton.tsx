'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, message } from 'antd';
import { Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  patientId: string;
  patientName: string;
  token: string;
  backHref: string;
}

export default function PatientDeleteButton({ patientId, patientName, token, backHref }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        message.success('ลบผู้ป่วยแล้ว');
        router.push(backHref);
      } else {
        message.error('ลบไม่สำเร็จ');
        setOpen(false);
      }
    } catch {
      message.error('เกิดข้อผิดพลาด');
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button danger icon={<Trash2 size={14} />} onClick={() => setOpen(true)}>ลบผู้ป่วย</Button>

      <Modal
        title="ยืนยันการลบผู้ป่วย"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleDelete}
        okText="ลบ"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelText="ยกเลิก"
        destroyOnClose
      >
        <p>คุณต้องการลบ <strong>{patientName}</strong> ใช่หรือไม่?</p>
        <p style={{ color: '#8c8c8c', fontSize: 12 }}>ข้อมูลจะถูกซ่อน แต่ยังคงอยู่ในระบบ (Soft Delete)</p>
      </Modal>
    </>
  );
}
