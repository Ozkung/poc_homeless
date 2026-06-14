'use client';
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, message, Tag } from 'antd';
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
    const payload: any = { ...values };
    if (values.lastName) { payload.displayName = `${values.displayName} ${values.lastName}`; delete payload.lastName; }
    if (values.birthDate) { payload.birthDate = values.birthDate.toISOString(); }
    const res = await fetch('/api/users/fw', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) { message.success('เพิ่ม CARE_GIVER สำเร็จ'); setModalOpen(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ทีมของฉัน</h1>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ เพิ่ม CARE_GIVER</Button>
      </div>
      <Table
        dataSource={fws} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อ', dataIndex: 'displayName' },
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', render: () => <Tag color="orange">CARE_GIVER</Tag> },
        ]}
      />
      <Modal title="เพิ่ม CARE_GIVER" open={modalOpen} onOk={handleCreate} onCancel={() => { setModalOpen(false); form.resetFields(); }} okText="สร้าง">
        <Form form={form} layout="vertical">
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]} style={{ flex: 1 }}><Input placeholder="ชื่อ" /></Form.Item>
            <Form.Item name="lastName" label="นามสกุล" style={{ flex: 1 }}><Input placeholder="นามสกุล" /></Form.Item>
          </div>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="birthDate" label="วันเกิด" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="phone" label="เบอร์โทร" style={{ flex: 1 }}><Input placeholder="08x-xxx-xxxx" /></Form.Item>
          </div>
          <Form.Item name="address" label="ที่อยู่"><Input.TextArea rows={2} placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
