'use client';
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, ColorPicker, message, Popconfirm } from 'antd';
import { useSession } from 'next-auth/react';

interface Zone { id: string; name: string; description?: string; color?: string; _count?: { patients: number } }

export default function ZonesPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [zones, setZones] = useState<Zone[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/zones', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setZones(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (z: Zone) => { setEditing(z); form.setFieldsValue(z); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    const method = editing ? 'PATCH' : 'POST';
    const url = editing ? `/api/zones/${editing.id}` : '/api/zones';
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('บันทึกสำเร็จ'); setModalOpen(false); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/zones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { message.success('ลบสำเร็จ'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Zones</h1>
        <Button type="primary" onClick={openCreate}>+ เพิ่ม Zone</Button>
      </div>
      <Table
        dataSource={zones} rowKey="id" size="small"
        columns={[
          { title: 'Zone', dataIndex: 'name', render: (name, r) => (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {r.color && <span style={{ width: 12, height: 12, borderRadius: '50%', background: r.color, display: 'inline-block', flexShrink: 0 }} />}
              {name}
            </span>
          )},
          { title: 'คำอธิบาย', dataIndex: 'description', render: (v) => v ?? '-' },
          { title: 'ผู้ป่วย', render: (_, r) => r._count?.patients ?? 0 },
          { title: '', render: (_, r) => (
            <span>
              <Button size="small" onClick={() => openEdit(r)} style={{ marginRight: 8 }}>แก้ไข</Button>
              <Popconfirm title="ลบ Zone นี้?" onConfirm={() => handleDelete(r.id)} okText="ลบ" cancelText="ยกเลิก">
                <Button size="small" danger>ลบ</Button>
              </Popconfirm>
            </span>
          )},
        ]}
      />
      <Modal title={editing ? 'แก้ไข Zone' : 'เพิ่ม Zone'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} okText="บันทึก">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อ Zone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="คำอธิบาย"><Input /></Form.Item>
          <Form.Item name="color" label="สี" getValueFromEvent={(color) => color.toHexString()}>
            <ColorPicker format="hex" showText />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
