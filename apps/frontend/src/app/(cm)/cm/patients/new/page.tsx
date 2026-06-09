'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button, Card, Form, Input, InputNumber, Select, Typography, message,
} from 'antd';
import Link from 'next/link';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PatientForm {
  name: string;
  hn: string;
  age?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  locationText?: string;
  conditions?: string;
}

export default function NewPatientPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PatientForm>();

  async function handleSubmit(values: PatientForm) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        conditions: values.conditions
          ? values.conditions.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success('เพิ่มผู้ป่วยเรียบร้อย');
        router.push('/patients');
      } else {
        message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/patients" style={{ fontSize: 12, color: '#aaa' }}>← ผู้ป่วย</Link>
      </div>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Patients
        </div>
        <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
          เพิ่มผู้ป่วย
        </Title>
      </div>

      <Card style={{ maxWidth: 600 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: 'PENDING' }}
        >
          <Form.Item
            name="name"
            label="ชื่อ-นามสกุล"
            rules={[{ required: true, message: 'กรุณาใส่ชื่อผู้ป่วย' }]}
          >
            <Input placeholder="สมชาย ใจดี" />
          </Form.Item>

          <Form.Item
            name="hn"
            label="HN (Hospital Number)"
            rules={[{ required: true, message: 'กรุณาใส่หมายเลข HN' }]}
          >
            <Input placeholder="HN001234" style={{ fontFamily: "'Sarabun',sans-serif" }} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="age" label="อายุ" style={{ flex: 1 }}>
              <InputNumber min={0} max={150} addonAfter="ปี" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="gender" label="เพศ" style={{ flex: 1 }}>
              <Select placeholder="เลือกเพศ" options={[
                { value: 'MALE',   label: 'ชาย' },
                { value: 'FEMALE', label: 'หญิง' },
                { value: 'OTHER',  label: 'อื่นๆ' },
              ]} />
            </Form.Item>
          </div>

          <Form.Item
            name="status"
            label="สถานะ"
            rules={[{ required: true }]}
          >
            <Select options={[
              { value: 'STABLE',   label: 'ปกติ' },
              { value: 'PENDING',  label: 'รอดำเนินการ' },
              { value: 'CRITICAL', label: 'วิกฤต' },
            ]} />
          </Form.Item>

          <Form.Item name="locationText" label="สถานที่">
            <Input placeholder="เช่น ใต้สะพาน ถ.พระราม 4" />
          </Form.Item>

          <Form.Item
            name="conditions"
            label="โรคประจำตัว"
            extra="คั่นด้วยเครื่องหมายจุลภาค เช่น เบาหวาน, ความดัน"
          >
            <Input placeholder="เบาหวาน, ความดัน" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => router.push('/patients')}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              บันทึกผู้ป่วย
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
