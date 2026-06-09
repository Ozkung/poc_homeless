'use client';
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag } from 'antd';
import { useSession } from 'next-auth/react';

interface FW { id: string; displayName: string; email: string; role: string }

export default function CMUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [fws, setFWs] = useState<FW[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/users/my-fw', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setFWs(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/users/fw', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่ม FIELD_WORKER สำเร็จ'); setModalOpen(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ทีมของฉัน</h1>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ เพิ่ม FIELD_WORKER</Button>
      </div>
      <Table
        dataSource={fws} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อ', dataIndex: 'displayName' },
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', render: () => <Tag color="orange">FIELD_WORKER</Tag> },
        ]}
      />
      <Modal title="เพิ่ม FIELD_WORKER" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} okText="สร้าง">
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
