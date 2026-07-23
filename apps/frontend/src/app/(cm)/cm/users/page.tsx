'use client';
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, message, Tag, Popconfirm, Space } from 'antd';
import { useSession } from 'next-auth/react';
import { Pencil, Trash2, Plus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FW { id: string; displayName: string; email: string; role: string; phone?: string; isActive?: boolean }

export default function CMUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [fws, setFWs] = useState<FW[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FW | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_URL}/users/my-fw`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setFWs(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      const payload: any = { ...values };
      if (values.lastName) { payload.displayName = `${values.displayName} ${values.lastName}`; delete payload.lastName; }
      if (values.birthDate) { payload.birthDate = values.birthDate.toISOString(); }
      const res = await fetch(`${API_URL}/users/fw`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { message.success('เพิ่ม CARE_GIVER สำเร็จ'); setCreateOpen(false); createForm.resetFields(); load(); }
      else message.error('เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  }

  function openEdit(fw: FW) {
    setEditTarget(fw);
    const nameParts = fw.displayName.trim().split(' ');
    editForm.setFieldsValue({
      displayName: nameParts[0] ?? fw.displayName,
      lastName: nameParts.slice(1).join(' '),
      phone: fw.phone,
    });
  }

  async function handleEdit() {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      const lastName = values.lastName?.trim();
      const displayName = lastName ? `${values.displayName} ${lastName}` : values.displayName;
      const res = await fetch(`${API_URL}/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, phone: values.phone || undefined }),
      });
      if (res.ok) { message.success('อัปเดตข้อมูลแล้ว'); setEditTarget(null); editForm.resetFields(); load(); }
      else message.error('เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    const res = await fetch(`${API_URL}/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 204) { message.success('ปิดบัญชีแล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  }

  const columns = [
    { title: 'ชื่อ', dataIndex: 'displayName' },
    { title: 'อีเมล', dataIndex: 'email' },
    { title: 'เบอร์โทร', dataIndex: 'phone', render: (v: string) => v ?? '-' },
    { title: 'Role', render: () => <Tag color="orange">CARE_GIVER</Tag> },
    { title: 'สถานะ', dataIndex: 'isActive', render: (v?: boolean) => <Tag color={v === false ? 'default' : 'green'}>{v === false ? 'ปิดบัญชี' : 'ใช้งาน'}</Tag> },
    {
      title: '',
      width: 100,
      render: (_: any, row: FW) => (
        <Space>
          <Button size="small" icon={<Pencil size={13} />} onClick={() => openEdit(row)} />
          <Popconfirm
            title="ปิดบัญชีผู้ใช้นี้?"
            description="บัญชีจะถูกระงับและไม่สามารถเข้าสู่ระบบได้"
            onConfirm={() => handleDeactivate(row.id)}
            okText="ปิดบัญชี"
            okButtonProps={{ danger: true }}
            cancelText="ยกเลิก"
            disabled={row.isActive === false}
          >
            <Button size="small" danger icon={<Trash2 size={13} />} disabled={row.isActive === false} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>ทีมของฉัน</h1>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>เพิ่ม CARE_GIVER</Button>
      </div>

      <Table dataSource={fws} rowKey="id" size="small" columns={columns} />

      {/* Create Modal */}
      <Modal
        title="เพิ่ม CARE_GIVER"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        okText="สร้าง"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="ชื่อ" />
            </Form.Item>
            <Form.Item name="lastName" label="นามสกุล" style={{ flex: 1 }}>
              <Input placeholder="นามสกุล" />
            </Form.Item>
          </div>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="birthDate" label="วันเกิด" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="phone" label="เบอร์โทร" style={{ flex: 1 }}>
              <Input placeholder="08x-xxx-xxxx" />
            </Form.Item>
          </div>
          <Form.Item name="address" label="ที่อยู่">
            <Input.TextArea rows={2} placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="แก้ไขข้อมูล CARE_GIVER"
        open={!!editTarget}
        onOk={handleEdit}
        onCancel={() => { setEditTarget(null); editForm.resetFields(); }}
        okText="บันทึก"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="ชื่อ" />
            </Form.Item>
            <Form.Item name="lastName" label="นามสกุล" style={{ flex: 1 }}>
              <Input placeholder="นามสกุล" />
            </Form.Item>
          </div>
          <Form.Item name="phone" label="เบอร์โทร">
            <Input placeholder="08x-xxx-xxxx" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
