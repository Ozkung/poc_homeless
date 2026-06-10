'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Card, DatePicker, Form, Input, Modal, Table, TimePicker, Typography, Tag, message } from 'antd';
import { Plus, CalendarDays, MapPin, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

function isFuture(dateStr: string) {
  return new Date(dateStr) >= new Date(new Date().setHours(0, 0, 0, 0));
}

export default function DoctorSchedulePage() {
  const { data: session } = useSession();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const headers = useCallback(() => ({ Authorization: `Bearer ${session?.accessToken ?? ''}`, 'Content-Type': 'application/json' }), [session?.accessToken]);

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/doctor/schedules`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(values: any) {
    setSaving(true);
    try {
      const payload = {
        date: values.date.toISOString(),
        startTime: values.startTime.format('HH:mm'),
        endTime: values.endTime.format('HH:mm'),
        location: values.location,
        notes: values.notes,
      };
      const res = await fetch(`${API_URL}/doctor/schedules`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      if (res.ok) { message.success('เพิ่มกำหนดการแล้ว'); setModal(false); form.resetFields(); load(); }
      else message.error('บันทึกไม่สำเร็จ');
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('ลบกำหนดการนี้?')) return;
    await fetch(`${API_URL}/doctor/schedules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } });
    load();
  }

  const columns = [
    {
      title: 'วันที่',
      dataIndex: 'date',
      width: 120,
      render: (v: string) => (
        <div>
          <Text style={{ fontWeight: isToday(v) ? 700 : 400 }}>{new Date(v).toLocaleDateString('th-TH')}</Text>
          {isToday(v) && <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>วันนี้</Tag>}
          {!isFuture(v) && !isToday(v) && <Tag color="default" style={{ marginLeft: 6, fontSize: 10 }}>ผ่านแล้ว</Tag>}
        </div>
      ),
    },
    {
      title: 'เวลา', width: 120,
      render: (_: any, r: any) => <Text>{r.startTime} – {r.endTime}</Text>,
    },
    {
      title: 'สถานที่', dataIndex: 'location',
      render: (v: string) => v ? <span><MapPin size={12} style={{ marginRight: 4 }} />{v}</span> : <Text type="secondary">-</Text>,
    },
    { title: 'แพทย์', dataIndex: ['doctor', 'displayName'] },
    { title: 'หมายเหตุ', dataIndex: 'notes', render: (v: string) => v ?? '-' },
    {
      title: '', width: 50,
      render: (_: any, r: any) => isFuture(r.date) && (session as any)?.sub === r.doctorId ? (
        <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')} onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}>
          <Trash2 size={13} />
        </button>
      ) : null,
    },
  ];

  const upcoming = schedules.filter((s) => isFuture(s.date));
  const past = schedules.filter((s) => !isFuture(s.date));

  return (
    <div style={{ padding: 24, fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Doctor Portal</Text>
          <Title level={3} style={{ margin: 0 }}><CalendarDays size={20} style={{ marginRight: 8 }} />ตารางลงพื้นที่</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>ประกาศให้ทุก role รับรู้วันเวลาที่แพทย์จะออกพื้นที่</Text>
        </div>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setModal(true)}>+ เพิ่มกำหนดการ</Button>
      </div>

      <Card title={`กำหนดการที่จะถึง (${upcoming.length})`} style={{ borderRadius: 12, marginBottom: 16 }}>
        <Table size="small" dataSource={upcoming} columns={columns} rowKey="id" loading={loading}
          pagination={false} locale={{ emptyText: 'ยังไม่มีกำหนดการ' }} />
      </Card>

      {past.length > 0 && (
        <Card title={`ประวัติที่ผ่านมา (${past.length})`} size="small" style={{ borderRadius: 12 }}>
          <Table size="small" dataSource={past} columns={columns} rowKey="id"
            pagination={{ pageSize: 10 }} />
        </Card>
      )}

      <Modal title="เพิ่มกำหนดการลงพื้นที่" open={modal} onCancel={() => { setModal(false); form.resetFields(); }} footer={null} width={480}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="date" label="วันที่" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs().startOf('day'))} />
          </Form.Item>
          <Form.Item label="เวลา" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Form.Item name="startTime" rules={[{ required: true, message: 'กรุณาเลือกเวลาเริ่ม' }]} style={{ flex: 1, marginBottom: 0 }}>
                <TimePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} placeholder="เริ่ม" />
              </Form.Item>
              <Text>–</Text>
              <Form.Item name="endTime" rules={[{ required: true, message: 'กรุณาเลือกเวลาสิ้นสุด' }]} style={{ flex: 1, marginBottom: 0 }}>
                <TimePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} placeholder="สิ้นสุด" />
              </Form.Item>
            </div>
          </Form.Item>
          <Form.Item name="location" label="สถานที่">
            <Input placeholder="เช่น ตรอกสาเก, สวนลุมพินี" />
          </Form.Item>
          <Form.Item name="notes" label="หมายเหตุ">
            <Input.TextArea rows={2} placeholder="รายละเอียดเพิ่มเติม" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setModal(false); form.resetFields(); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึก</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
