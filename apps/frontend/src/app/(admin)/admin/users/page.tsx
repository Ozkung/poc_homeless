'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, message } from 'antd';
import { useSession } from 'next-auth/react';

interface User { id: string; displayName: string; email: string; role: string; isActive: boolean; supervisorId?: string }

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [users, setUsers] = useState<User[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUsers(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('สร้างผู้ใช้สำเร็จ'); setCreateModal(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const cms = users.filter((u) => u.role === 'CASE_MANAGER');
  const roleColor: Record<string, string> = {
    SUPER_ADMIN: 'purple', ADMIN: 'geekblue', CASE_MANAGER: 'green',
    FIELD_WORKER: 'orange', MEDICAL_VOLUNTEER: 'blue',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ผู้ใช้งาน</h1>
        <Button type="primary" onClick={() => setCreateModal(true)}>+ เพิ่มผู้ใช้</Button>
      </div>
      <Table
        dataSource={users} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อ', dataIndex: 'displayName' },
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', dataIndex: 'role', render: (r) => <Tag color={roleColor[r] ?? 'default'}>{r}</Tag> },
          { title: 'สังกัด CM', dataIndex: 'supervisorId', render: (id) => cms.find((c) => c.id === id)?.displayName ?? '-' },
          { title: 'สถานะ', dataIndex: 'isActive', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
        ]}
      />
      <Modal title="เพิ่มผู้ใช้" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="สร้าง">
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={['CASE_MANAGER','FIELD_WORKER','MEDICAL_VOLUNTEER','ADMIN'].map((r) => ({ value: r, label: r }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
