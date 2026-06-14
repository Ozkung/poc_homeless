'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, DatePicker, Drawer, Descriptions, Radio, Popconfirm, Space, message } from 'antd';
import { EditOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useSession } from 'next-auth/react';

interface Zone { id: string; name: string; color: string }
interface User {
  id: string; displayName: string; email: string; role: string;
  phone: string | null; gender: string | null; isActive: boolean;
  lineUserId: string | null;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  supervisorId?: string; zone?: Zone | null; supervisor?: { zone?: Zone | null };
  createdAt: string;
}

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: 'purple', ADMIN: 'geekblue', CASE_MANAGER: 'green',
  CARE_GIVER: 'orange', MEDICAL_VOLUNTEER: 'blue', DOCTOR: 'cyan',
};
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'SUPER ADMIN', ADMIN: 'ADMIN', CASE_MANAGER: 'CASE MANAGER',
  CARE_GIVER: 'CARE GIVER', MEDICAL_VOLUNTEER: 'MED VOLUNTEER', DOCTOR: 'DOCTOR',
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [users, setUsers] = useState<User[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [form] = Form.useForm();

  // Profile drawer state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) return;
    const [uRes, zRes] = await Promise.all([
      fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/zones', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (uRes.ok) setUsers(await uRes.json());
    if (zRes.ok) setZones(await zRes.json());
  };

  useEffect(() => { load(); }, [token]);

  const openEdit = (user: User) => {
    setEditUser(user);
    editForm.setFieldsValue({
      displayName: user.displayName,
      phone: user.phone ?? '',
      gender: user.gender ?? undefined,
      role: user.role,
      isActive: user.isActive,
    });
  };

  const handleSaveProfile = async () => {
    if (!editUser) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: values.displayName,
          phone: values.phone || null,
          gender: values.gender ?? null,
          role: values.role,
          isActive: values.isActive,
        }),
      });
      if (res.ok) {
        message.success('บันทึกข้อมูลแล้ว');
        setEditUser(null);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.message ?? 'เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    if (res.ok) { message.success(user.isActive ? 'ปิดการใช้งานแล้ว' : 'เปิดการใช้งานแล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    const payload: any = { ...values };
    if (values.lastName) { payload.displayName = `${values.displayName} ${values.lastName}`; delete payload.lastName; }
    if (values.birthDate) { payload.birthDate = values.birthDate.toISOString(); }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) { message.success('สร้างผู้ใช้สำเร็จ'); setCreateModal(false); form.resetFields(); setSelectedRole(''); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleAssignZone = async (userId: string, zoneId: string | null) => {
    const res = await fetch(`/api/users/${userId}/zone`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId }),
    });
    if (res.ok) { message.success('กำหนด Zone แล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
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
          { title: 'ชื่อ', dataIndex: 'displayName', render: (v, r) => (
            <span>
              <span style={{ fontWeight: 600 }}>{v}</span>
              {r.phone && <div style={{ fontSize: 11, color: '#aaa' }}>{r.phone}</div>}
            </span>
          )},
          { title: 'อีเมล', dataIndex: 'email' },
          { title: 'Role', dataIndex: 'role', render: (r) => <Tag color={ROLE_COLOR[r] ?? 'default'}>{ROLE_LABEL[r] ?? r}</Tag> },
          {
            title: 'Zone', dataIndex: 'zone',
            render: (zone: Zone | null, record: User) => {
              const effectiveZone = zone ?? record.supervisor?.zone ?? null;
              if (record.role !== 'CASE_MANAGER') return effectiveZone ? <Tag color={effectiveZone.color ?? 'default'}>{effectiveZone.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>;
              return (
                <Select size="small" style={{ width: 150 }} value={zone?.id ?? null} allowClear placeholder="เลือก Zone"
                  onChange={(val) => handleAssignZone(record.id, val ?? null)}
                  options={zones.map((z) => ({ value: z.id, label: z.name }))}
                />
              );
            },
          },
          {
            title: 'LINE', dataIndex: 'lineUserId', width: 160,
            render: (_: any, record: User) => record.lineUserId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {record.linePictureUrl ? (
                  <img src={record.linePictureUrl} alt="LINE" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>L</span>
                  </div>
                )}
                <span style={{ fontSize: 12, color: '#111' }}>{record.lineDisplayName ?? '—'}</span>
              </div>
            ) : <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>,
          },
          { title: 'สถานะ', dataIndex: 'isActive', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
          {
            title: '',
            width: 80,
            render: (_: any, record: User) => (
              <Space size={4}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                <Popconfirm
                  title={record.isActive ? 'ปิดการใช้งานผู้ใช้นี้?' : 'เปิดการใช้งานผู้ใช้นี้?'}
                  onConfirm={() => handleToggleActive(record)}
                  okText="ยืนยัน" cancelText="ยกเลิก"
                  okButtonProps={{ danger: record.isActive }}
                >
                  <Button
                    size="small"
                    danger={record.isActive}
                    icon={record.isActive ? <StopOutlined /> : <CheckCircleOutlined />}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* Profile edit drawer */}
      <Drawer
        title={
          <span>
            แก้ไขโปรไฟล์
            {editUser && <Tag color={ROLE_COLOR[editUser.role] ?? 'default'} style={{ marginLeft: 8, fontSize: 11 }}>{ROLE_LABEL[editUser.role] ?? editUser.role}</Tag>}
          </span>
        }
        open={!!editUser}
        onClose={() => setEditUser(null)}
        width={400}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditUser(null)}>ยกเลิก</Button>
            <Button type="primary" loading={saving} onClick={handleSaveProfile}>บันทึก</Button>
          </div>
        }
      >
        {editUser && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 20 }} bordered>
              <Descriptions.Item label="อีเมล">{editUser.email}</Descriptions.Item>
              <Descriptions.Item label="LINE">
                {editUser.lineUserId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editUser.linePictureUrl ? (
                      <img
                        src={editUser.linePictureUrl}
                        alt="LINE"
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>L</span>
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {editUser.lineDisplayName ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace' }}>
                        {editUser.lineUserId.slice(0, 16)}…
                      </div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#aaa', fontSize: 12 }}>ยังไม่ได้เชื่อมต่อ</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="เข้าร่วม">
                {new Date(editUser.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </Descriptions.Item>
            </Descriptions>

            <Form form={editForm} layout="vertical">
              <Form.Item name="displayName" label="ชื่อแสดง" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label="เบอร์โทรศัพท์">
                <Input placeholder="0812345678" />
              </Form.Item>
              <Form.Item name="gender" label="เพศ">
                <Radio.Group>
                  <Radio.Button value="MALE">ชาย</Radio.Button>
                  <Radio.Button value="FEMALE">หญิง</Radio.Button>
                  <Radio.Button value="OTHER">อื่นๆ</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                <Select options={['CASE_MANAGER','CARE_GIVER','MEDICAL_VOLUNTEER','DOCTOR','ADMIN','SUPER_ADMIN'].map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))} />
              </Form.Item>
              <Form.Item name="isActive" label="สถานะ">
                <Radio.Group>
                  <Radio.Button value={true}>Active</Radio.Button>
                  <Radio.Button value={false}>Inactive</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Form>

          </>
        )}
      </Drawer>

      {/* Create user modal */}
      <Modal title="เพิ่มผู้ใช้" open={createModal} onOk={handleCreate} onCancel={() => { setCreateModal(false); form.resetFields(); setSelectedRole(''); }} okText="สร้าง">
        <Form form={form} layout="vertical">
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              options={['CASE_MANAGER','CARE_GIVER','MEDICAL_VOLUNTEER','DOCTOR','ADMIN'].map((r) => ({ value: r, label: r }))}
              onChange={(v) => setSelectedRole(v)}
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 10 }}>
            <Form.Item name="displayName" label="ชื่อ" rules={[{ required: true }]} style={{ flex: 1 }}><Input placeholder="ชื่อ" /></Form.Item>
            {(selectedRole === 'CARE_GIVER' || selectedRole === 'DOCTOR') && (
              <Form.Item name="lastName" label="นามสกุล" style={{ flex: 1 }}><Input placeholder="นามสกุล" /></Form.Item>
            )}
          </div>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>

          {selectedRole === 'CARE_GIVER' && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <Form.Item name="birthDate" label="วันเกิด" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
                <Form.Item name="phone" label="เบอร์โทร" style={{ flex: 1 }}><Input placeholder="08x-xxx-xxxx" /></Form.Item>
              </div>
              <Form.Item name="address" label="ที่อยู่"><Input.TextArea rows={2} placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด" /></Form.Item>
            </>
          )}

          {selectedRole === 'DOCTOR' && (
            <>
              <Form.Item name="phone" label="เบอร์โทร"><Input placeholder="08x-xxx-xxxx" /></Form.Item>
              <Form.Item name="address" label="ที่อยู่"><Input.TextArea rows={2} placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด" /></Form.Item>
              <Form.Item name="specialty" label="ประเภทของแพทย์">
                <Select allowClear placeholder="เลือกสาขา" options={[
                  'อายุรกรรม', 'ศัลยกรรม', 'กุมารเวชกรรม', 'สูติ-นรีเวชกรรม',
                  'จักษุวิทยา', 'หู คอ จมูก', 'ออร์โธปิดิกส์', 'จิตเวชศาสตร์',
                  'ผิวหนัง', 'ทันตกรรม', 'รังสีวิทยา', 'แพทย์ฉุกเฉิน', 'เวชศาสตร์ครอบครัว',
                ].map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
