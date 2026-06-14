'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Select, Typography, message, Row, Col,
} from 'antd';
import Link from 'next/link';
import dayjs from 'dayjs';
import { STATUS_OPTIONS } from '@/lib/patientStatus';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function NewPatientPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  async function handleSubmit(values: any) {
    setSaving(true);
    try {
      const name = [values.firstName, values.lastName].filter(Boolean).join(' ');
      const payload = {
        name,
        age: values.age,
        gender: values.gender,
        status: values.status,
        locationText: values.locationText,
        conditions: values.conditions
          ? values.conditions.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        initialComplaint: values.initialComplaint || undefined,
        phone: values.phone,
        birthDate: values.birthDate ? dayjs(values.birthDate).toISOString() : undefined,
        nationalId: values.nationalId,
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
        router.push('/cm/patients');
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
      <div style={{ marginBottom: 20 }}>
        <Link href="/cm/patients" style={{ fontSize: 12, color: '#aaa' }}>← ผู้ป่วย</Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Patients
        </div>
        <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
          เพิ่มผู้ป่วย
        </Title>
      </div>

      <Card style={{ maxWidth: 640 }}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ status: 'PENDING' }}>

          {/* ── ชื่อ-นามสกุล ── */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="ชื่อ" rules={[{ required: true, message: 'กรุณาใส่ชื่อ' }]}>
                <Input placeholder="สมชาย" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="นามสกุล" rules={[{ required: true, message: 'กรุณาใส่นามสกุล' }]}>
                <Input placeholder="ใจดี" />
              </Form.Item>
            </Col>
          </Row>

          {/* ── เลขบัตรประชาชน ── */}
          <Form.Item
            name="nationalId"
            label="เลขบัตรประชาชน"
            rules={[{ pattern: /^\d{13}$/, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' }]}
          >
            <Input placeholder="1234567890123" maxLength={13} />
          </Form.Item>

          {/* ── เบอร์โทร / เพศ ── */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="เบอร์โทรศัพท์">
                <Input placeholder="081-234-5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="เพศ">
                <Select placeholder="เลือกเพศ" options={[
                  { value: 'MALE',   label: 'ชาย' },
                  { value: 'FEMALE', label: 'หญิง' },
                  { value: 'OTHER',  label: 'อื่นๆ' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          {/* ── วันเกิด / อายุ ── */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="birthDate" label="วันเกิด">
                <DatePicker style={{ width: '100%' }} placeholder="เลือกวันเกิด" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="age" label="อายุ (ปี)">
                <InputNumber min={0} max={150} addonAfter="ปี" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* ── สถานะ ── */}
          <Form.Item name="status" label="สถานะ (Triage)" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          {/* ── สถานที่ / โรคประจำตัว ── */}
          <Form.Item name="locationText" label="สถานที่ที่พบ">
            <Input placeholder="เช่น ใต้สะพาน ถ.พระราม 4" />
          </Form.Item>

          <Form.Item name="conditions" label="โรคประจำตัว" extra="คั่นด้วยเครื่องหมายจุลภาค เช่น เบาหวาน, ความดัน">
            <Input placeholder="เบาหวาน, ความดัน" />
          </Form.Item>

          <Form.Item name="initialComplaint" label="อาการเบื้องต้น">
            <Input.TextArea rows={3} placeholder="เช่น ปวดศีรษะ เวียนหัว อ่อนเพลีย มา 3 วัน..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => router.push('/cm/patients')}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึกผู้ป่วย</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
