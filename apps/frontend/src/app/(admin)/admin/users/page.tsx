'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, DatePicker, message } from 'antd';
import { useSession } from 'next-auth/react';

interface Zone { id: string; name: string; color: string }
interface User { id: string; displayName: string; email: string; role: string; isActive: boolean; supervisorId?: string; zone?: Zone | null; supervisor?: { zone?: Zone | null } }

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [users, setUsers] = useState<User[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [form] = Form.useForm();

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
    if (res.ok) {
      message.success('กำหนด Zone แล้ว');
      setUsers((prev) => prev.map((u) => {
        if (u.id !== userId) return u;
        const zone = zones.find((z) => z.id === zoneId) ?? null;
        return { ...u, zone };
      }));
    } else {
      message.error('เกิดข้อผิดพลาด');
    }
  };

  const roleColor: Record<string, string> = {
    SUPER_ADMIN: 'purple', ADMIN: 'geekblue', CASE_MANAGER: 'green',
    CARE_GIVER: 'orange', MEDICAL_VOLUNTEER: 'blue', DOCTOR: 'cyan',
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
          // { title: 'สังกัด CM', dataIndex: 'supervisorId', render: (id) => cms.find((c) => c.id === id)?.displayName ?? '-' },
          {
            title: 'Zone',
            dataIndex: 'zone',
            render: (zone: Zone | null, record: User) => {
              const effectiveZone = zone ?? record.supervisor?.zone ?? null;
              if (record.role !== 'CASE_MANAGER') return effectiveZone ? <Tag color={effectiveZone.color ?? 'default'}>{effectiveZone.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>;
              return (
                <Select
                  size="small"
                  style={{ width: 150 }}
                  value={zone?.id ?? null}
                  allowClear
                  placeholder="เลือก Zone"
                  onChange={(val) => handleAssignZone(record.id, val ?? null)}
                  options={zones.map((z) => ({ value: z.id, label: z.name }))}
                />
              );
            },
          },
          { title: 'สถานะ', dataIndex: 'isActive', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
        ]}
      />
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
