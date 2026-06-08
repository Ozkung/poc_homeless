'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  App, Avatar, Button, Card, Drawer, Form, Input,
  Popconfirm, Select, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface UserRow {
  id: string; email: string; displayName: string; role: string;
  phone: string | null; gender: string | null;
  avatarUrl: string | null; isActive: boolean; createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
  { value: 'CASE_MANAGER', label: 'CASE_MANAGER' },
  { value: 'FIELD_WORKER', label: 'FIELD_WORKER' },
  { value: 'MEDICAL_VOLUNTEER', label: 'MEDICAL_VOLUNTEER' },
];

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'ชาย' },
  { value: 'FEMALE', label: 'หญิง' },
  { value: 'OTHER', label: 'อื่นๆ' },
];

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: 'purple', ADMIN: 'blue', CASE_MANAGER: 'green',
  FIELD_WORKER: 'orange', MEDICAL_VOLUNTEER: 'cyan',
};

export default function UsersPage() {
  const { data: session } = useSession();
  const { message } = App.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const token = (session as any)?.accessToken ?? '';
  const myId = (session as any)?.sub ?? '';
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API}/users`, { headers: headers() })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, headers]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    form.setFieldsValue({ displayName: user.displayName, email: user.email, role: user.role, phone: user.phone ?? '', gender: user.gender });
    setDrawerOpen(true);
  }

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const url = editing ? `${API}/users/${editing.id}` : `${API}/users`;
      const method = editing ? 'PATCH' : 'POST';
      const body = editing
        ? { displayName: values.displayName, phone: values.phone || null, gender: values.gender ?? null, role: values.role }
        : { ...values, phone: values.phone || null, gender: values.gender ?? null };
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      if (res.ok) {
        message.success(editing ? 'อัปเดตแล้ว' : 'สร้าง user แล้ว');
        setDrawerOpen(false); load();
      } else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    try {
      const res = await fetch(`${API}/users/${id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) { message.success('ปิดบัญชีแล้ว'); load(); }
      else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
  }

  const columns: ColumnsType<UserRow> = [
    {
      title: 'ผู้ใช้งาน', key: 'user',
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={32} src={r.avatarUrl ? `${API}${r.avatarUrl}` : undefined} style={{ background: '#1677ff', fontSize: 12 }}>
            {r.displayName.slice(0, 2).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.displayName}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{r.email}</div>
          </div>
        </div>
      ),
    },
    { title: 'เบอร์โทร', dataIndex: 'phone', key: 'phone', width: 120, render: v => v ?? <span style={{ color: '#d9d9d9' }}>—</span> },
    {
      title: 'สิทธิ์', dataIndex: 'role', key: 'role', width: 140,
      render: role => <Tag color={ROLE_COLOR[role] ?? 'default'}>{role}</Tag>,
    },
    {
      title: 'สถานะ', dataIndex: 'isActive', key: 'isActive', width: 90,
      render: v => <span style={{ color: v ? '#52c41a' : '#aaa' }}>{v ? '● ใช้งาน' : '○ ปิด'}</span>,
    },
    {
      title: '', key: 'actions', width: 100,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => openEdit(r)}>✏️</Button>
          {r.id !== myId && r.isActive && (
            <Popconfirm title="ปิดบัญชีนี้?" okText="ยืนยัน" cancelText="ยกเลิก" okButtonProps={{ danger: true }} onConfirm={() => handleDeactivate(r.id)}>
              <Button size="small" danger>🗑</Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: '#722ed1', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Users</div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>จัดการผู้ใช้งาน</Title>
        </div>
        <Button type="primary" style={{ background: '#722ed1', borderColor: '#722ed1' }} onClick={openCreate}>+ เพิ่ม User</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} size="middle" pagination={{ pageSize: 20 }} />
      </Card>

      <Drawer
        title={editing ? `แก้ไข: ${editing.displayName}` : 'เพิ่ม User ใหม่'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ wrapper: { width: 420 } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="displayName" label="ชื่อแสดง" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true }, { min: 8, message: 'อย่างน้อย 8 ตัว' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="role" label="สิทธิ์" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="phone" label="เบอร์โทรศัพท์">
            <Input placeholder="0812345678" />
          </Form.Item>
          <Form.Item name="gender" label="เพศ">
            <Select options={GENDER_OPTIONS} allowClear placeholder="ไม่ระบุ" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            {editing ? 'บันทึก' : 'สร้าง User'}
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
