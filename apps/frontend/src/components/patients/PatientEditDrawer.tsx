'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, DatePicker, Drawer, Form, Input, InputNumber, Select, message,
} from 'antd';
import { Pencil } from 'lucide-react';
import dayjs from 'dayjs';
import { STATUS_OPTIONS } from '@/lib/patientStatus';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PatientEditProps {
  patientId: string;
  token: string;
  initialValues: {
    name: string;
    age?: number;
    gender?: string;
    status: string;
    locationText?: string;
    conditions: string[];
    initialComplaint?: string;
    phone?: string;
    birthDate?: string;
    nationalId?: string;
  };
  onSuccess?: () => void;
}

export default function PatientEditDrawer({ patientId, token, initialValues, onSuccess }: PatientEditProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  function handleOpen() {
    const nameParts = initialValues.name.trim().split(' ');
    form.setFieldsValue({
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      age: initialValues.age,
      gender: initialValues.gender,
      status: initialValues.status,
      locationText: initialValues.locationText,
      conditions: initialValues.conditions.join(', '),
      initialComplaint: initialValues.initialComplaint,
      phone: initialValues.phone,
      birthDate: initialValues.birthDate ? dayjs(initialValues.birthDate) : undefined,
      nationalId: initialValues.nationalId,
    });
    setOpen(true);
  }

  async function handleSubmit(values: any) {
    setSaving(true);
    try {
      const name = [values.firstName, values.lastName].filter(Boolean).join(' ');
      const payload: Record<string, any> = {
        name,
        age: values.age,
        gender: values.gender,
        status: values.status,
        locationText: values.locationText,
        conditions: values.conditions
          ? values.conditions.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        initialComplaint: values.initialComplaint || undefined,
        phone: values.phone || undefined,
        birthDate: values.birthDate ? dayjs(values.birthDate).toISOString() : undefined,
        nationalId: values.nationalId || undefined,
      };
      const res = await fetch(`${API_URL}/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success('อัปเดตข้อมูลผู้ป่วยแล้ว');
        setOpen(false);
        if (onSuccess) { onSuccess(); } else { router.refresh(); }
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button icon={<Pencil size={14} />} onClick={handleOpen}>แก้ไขข้อมูล</Button>

      <Drawer
        title="แก้ไขข้อมูลผู้ป่วย"
        placement="right"
        width={420}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="ชื่อ-นามสกุล">
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name="firstName" noStyle rules={[{ required: true, message: 'กรุณาใส่ชื่อ' }]}>
                <Input placeholder="ชื่อ" />
              </Form.Item>
              <Form.Item name="lastName" noStyle rules={[{ required: true, message: 'กรุณาใส่นามสกุล' }]}>
                <Input placeholder="นามสกุล" />
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item
            name="nationalId"
            label="เลขบัตรประชาชน"
            rules={[{ pattern: /^\d{13}$/, message: 'ต้องเป็นตัวเลข 13 หลัก' }]}
          >
            <Input placeholder="1234567890123" maxLength={13} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="phone" label="เบอร์โทร" style={{ flex: 1 }}>
              <Input placeholder="081-234-5678" />
            </Form.Item>
            <Form.Item name="gender" label="เพศ" style={{ flex: 1 }}>
              <Select allowClear placeholder="เลือก" options={[
                { value: 'MALE',   label: 'ชาย' },
                { value: 'FEMALE', label: 'หญิง' },
                { value: 'OTHER',  label: 'อื่นๆ' },
              ]} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="birthDate" label="วันเกิด" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="age" label="อายุ (ปี)" style={{ flex: 1 }}>
              <InputNumber min={0} max={150} style={{ width: '100%' }} addonAfter="ปี" />
            </Form.Item>
          </div>

          <Form.Item name="status" label="สถานะ (Triage)" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item name="locationText" label="สถานที่ที่พบ">
            <Input placeholder="เช่น ใต้สะพาน ถ.พระราม 4" />
          </Form.Item>

          <Form.Item name="conditions" label="โรคประจำตัว" extra="คั่นด้วยจุลภาค เช่น เบาหวาน, ความดัน">
            <Input placeholder="เบาหวาน, ความดัน" />
          </Form.Item>

          <Form.Item name="initialComplaint" label="อาการเบื้องต้น">
            <Input.TextArea rows={3} placeholder="เช่น ปวดศีรษะ เวียนหัว มา 3 วัน..." />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button block onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving} block>บันทึก</Button>
          </div>
        </Form>
      </Drawer>
    </>
  );
}
