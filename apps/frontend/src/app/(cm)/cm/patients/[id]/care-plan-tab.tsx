'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Form, Input, Modal, Select, Tag, message } from 'antd';
import { Trash2, ClipboardList } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface CarePlanItem {
  id: string;
  title: string;
  frequency: string;
  priority: 'HIGH' | 'MED' | 'LOW';
  assigneeName?: string;
  isDone: boolean;
}

const PRIORITY_COLOR: Record<string, string> = { HIGH: 'error', MED: 'warning', LOW: 'success' };
const PRIORITY_LABEL: Record<string, string> = { HIGH: 'HIGH', MED: 'MED', LOW: 'LOW' };

export default function CarePlanTab({ patientId }: { patientId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<CarePlanItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const getHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken]);

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/patients/${patientId}/care-plan`, { headers: getHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [patientId, session?.accessToken, getHeaders]);

  useEffect(() => { load(); }, [load]);

  async function toggleDone(item: CarePlanItem) {
    const optimistic = items.map((i) => i.id === item.id ? { ...i, isDone: !i.isDone } : i);
    setItems(optimistic);
    await fetch(`${API_URL}/patients/${patientId}/care-plan/${item.id}`, {
      method: 'PATCH',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: !item.isDone }),
    }).catch(() => load());
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`${API_URL}/patients/${patientId}/care-plan/${id}`, {
      method: 'DELETE', headers: getHeaders(),
    }).catch(() => load());
  }

  async function handleAdd(values: { title: string; frequency: string; priority: string; assigneeName?: string }) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/care-plan`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        message.success('เพิ่มแผนการดูแลแล้ว');
        setModalOpen(false);
        form.resetFields();
        load();
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{items.length} แผน</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            icon={<ClipboardList size={13} />}
            onClick={() => router.push(`/cm/patients/${patientId}/care-plan-assessment`)}
          >
            แบบประเมิน
          </Button>
          <Button size="small" type="primary" onClick={() => setModalOpen(true)}>+ เพิ่มแผน</Button>
        </div>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#bbb', padding: '40px 0' }}>ยังไม่มีแผนการดูแล</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: 12, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8,
          }}>
            <Checkbox checked={item.isDone} onChange={() => toggleDone(item)} style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: item.isDone ? '#bbb' : '#111',
                textDecoration: item.isDone ? 'line-through' : 'none' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {item.frequency}{item.assigneeName ? ` • ${item.assigneeName}` : ''}
              </div>
            </div>
            <Tag color={PRIORITY_COLOR[item.priority]}>{PRIORITY_LABEL[item.priority]}</Tag>
            <button onClick={() => deleteItem(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: '2px 0' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <Modal title="เพิ่มแผนการดูแล" open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}>
        <Form form={form} layout="vertical" onFinish={handleAdd}
          initialValues={{ priority: 'MED', frequency: 'ทุกวัน' }}>
          <Form.Item name="title" label="แผนการรักษา / กิจกรรม"
            rules={[{ required: true, message: 'กรุณาใส่รายละเอียดแผน' }]}>
            <Input placeholder="เช่น รับ Metformin 500mg หลังอาหาร" />
          </Form.Item>
          <Form.Item name="frequency" label="ความถี่">
            <Select options={[
              { value: 'ทุกวัน', label: 'ทุกวัน' },
              { value: 'สัปดาห์ละ 1 ครั้ง', label: 'สัปดาห์ละ 1 ครั้ง' },
              { value: 'ทุก 2 สัปดาห์', label: 'ทุก 2 สัปดาห์' },
              { value: 'ทุกเดือน', label: 'ทุกเดือน' },
              { value: 'ทุก 3 เดือน', label: 'ทุก 3 เดือน' },
            ]} />
          </Form.Item>
          <Form.Item name="priority" label="ความสำคัญ">
            <Select options={[
              { value: 'HIGH', label: '🔴 HIGH (ด่วน)' },
              { value: 'MED',  label: '🟡 MED (ปานกลาง)' },
              { value: 'LOW',  label: '🟢 LOW (ติดตาม)' },
            ]} />
          </Form.Item>
          <Form.Item name="assigneeName" label="ผู้รับผิดชอบ">
            <Input placeholder="ชื่อผู้ช่วย CM (ถ้ามี)" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึก</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
