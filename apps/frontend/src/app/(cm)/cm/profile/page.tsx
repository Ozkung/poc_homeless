'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';
import {
  App, Avatar, Button, Card, Form, Input, Modal,
  Radio, Typography,
} from 'antd';
import { CameraOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface MeData {
  id: string; email: string; displayName: string; role: string;
  phone: string | null; gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  avatarUrl: string | null; lineUserId: string | null; createdAt: string;
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const { message, modal } = App.useApp();
  const [me, setMe] = useState<MeData | null>(null);
  const [infoForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmPwOpen, setConfirmPwOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [confirmPwVal, setConfirmPwVal] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = (session as any)?.accessToken ?? '';
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: headers() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMe(d);
          infoForm.setFieldsValue({ displayName: d.displayName, email: d.email, phone: d.phone ?? '', gender: d.gender });
        }
      });
  }, [token, headers, infoForm]);

  async function handleSaveInfo(values: any) {
    if (values.email && values.email !== me?.email) {
      setPendingEmail(values.email);
      setConfirmPwOpen(true);
      return;
    }
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ displayName: values.displayName, phone: values.phone || null, gender: values.gender ?? null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMe(prev => prev ? { ...prev, ...updated } : prev);
        await update({ displayName: updated.displayName });
        message.success('บันทึกข้อมูลแล้ว');
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingInfo(false); }
  }

  async function handleEmailChange() {
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ email: pendingEmail, currentPassword: confirmPwVal }),
      });
      if (res.ok) {
        message.success('เปลี่ยน email แล้ว กรุณา login ใหม่');
        setConfirmPwOpen(false);
        await signOut({ callbackUrl: '/login' });
      } else {
        const err = await res.json();
        message.error(err.message ?? 'รหัสผ่านไม่ถูกต้อง');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingInfo(false); }
  }

  async function handleChangePassword(values: any) {
    if (values.newPassword !== values.confirmPassword) {
      message.error('รหัสผ่านใหม่ไม่ตรงกัน'); return;
    }
    setSavingPw(true);
    try {
      const res = await fetch(`${API}/auth/me/change-password`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      if (res.ok) { message.success('เปลี่ยนรหัสผ่านแล้ว'); pwForm.resetFields(); }
      else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSavingPw(false); }
  }

  async function handleUnlinkLine() {
    modal.confirm({
      title: 'ยกเลิกการเชื่อมต่อ LINE?',
      content: 'คุณจะไม่สามารถรับการแจ้งเตือนผ่าน LINE ได้',
      okText: 'ยืนยัน', cancelText: 'ยกเลิก', okButtonProps: { danger: true },
      onOk: async () => {
        setUnlinking(true);
        try {
          const res = await fetch(`${API}/auth/me/line`, { method: 'DELETE', headers: headers() });
          if (res.ok) { setMe(prev => prev ? { ...prev, lineUserId: null } : prev); message.success('ยกเลิกการเชื่อมต่อ LINE แล้ว'); }
          else message.error('เกิดข้อผิดพลาด');
        } catch { message.error('เกิดข้อผิดพลาด'); }
        finally { setUnlinking(false); }
      },
    });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      const res = await fetch(`${API}/auth/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const { avatarUrl } = await res.json();
        setMe(prev => prev ? { ...prev, avatarUrl } : prev);
        message.success('อัปเดตรูปโปรไฟล์แล้ว');
      } else { const e = await res.json(); message.error(e.message ?? 'เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const initials = me?.displayName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '??';
  const roleLabel: Record<string, string> = { ADMIN: 'ผู้ดูแลระบบ', SUPER_ADMIN: 'ผู้อำนวยการ', CASE_MANAGER: 'เคสแมเนเจอร์', FIELD_WORKER: 'อาสาสมัคร', MEDICAL_VOLUNTEER: 'อาสาพยาบาล' };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Account</div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>โปรไฟล์ของฉัน</Title>
      </div>

      {/* Avatar + role header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
            <Avatar
              size={64}
              src={me?.avatarUrl ? `${API}${me.avatarUrl}` : undefined}
              style={{ background: '#1677ff', fontSize: 22, fontWeight: 700 }}
            >
              {initials}
            </Avatar>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, background: '#fff', borderRadius: '50%', border: '1px solid #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
              <CameraOutlined style={{ fontSize: 11 }} />
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{me?.displayName}</div>
            <div style={{ marginTop: 4 }}>
              <span style={{ background: '#e6f4ff', color: '#1677ff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                {me?.role ? (roleLabel[me.role] ?? me.role) : '…'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              เข้าร่วม {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '…'}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal info */}
      <Card title={<span style={{ color: '#1677ff', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>ข้อมูลส่วนตัว</span>} style={{ marginBottom: 16 }}>
        <Form form={infoForm} layout="vertical" onFinish={handleSaveInfo}>
          <Form.Item name="displayName" label="ชื่อแสดง" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={<span>อีเมล <Text type="secondary" style={{ fontSize: 11 }}>(เปลี่ยนแล้วจะออกจากระบบอัตโนมัติ)</Text></span>}>
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
          <Button type="primary" htmlType="submit" loading={savingInfo} block>บันทึกข้อมูล</Button>
        </Form>
      </Card>

      {/* Change password */}
      <Card title={<span style={{ color: '#faad14', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>เปลี่ยนรหัสผ่าน</span>} style={{ marginBottom: 16 }}>
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="currentPassword" label="รหัสผ่านเดิม" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="รหัสผ่านใหม่" rules={[{ required: true }, { min: 8, message: 'อย่างน้อย 8 ตัว' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="ยืนยันรหัสผ่านใหม่" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingPw} style={{ background: '#faad14', borderColor: '#faad14' }} block>
            เปลี่ยนรหัสผ่าน
          </Button>
        </Form>
      </Card>

      {/* LINE */}
      <Card title={<span style={{ color: '#06c755', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>LINE Account</span>}>
        {me?.lineUserId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text style={{ color: '#06c755', fontWeight: 600 }}>● เชื่อมต่อแล้ว</Text>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{me.lineUserId.slice(0, 20)}...</div>
            </div>
            <Button danger size="small" loading={unlinking} onClick={handleUnlinkLine}>Unlink</Button>
          </div>
        ) : (
          <Text type="secondary">ยังไม่เชื่อมต่อ LINE</Text>
        )}
      </Card>

      {/* Email change confirm modal */}
      <Modal
        title="ยืนยันรหัสผ่านก่อนเปลี่ยน Email"
        open={confirmPwOpen}
        onCancel={() => setConfirmPwOpen(false)}
        onOk={handleEmailChange}
        okText="ยืนยันและเปลี่ยน Email"
        confirmLoading={savingInfo}
      >
        <Text type="warning" style={{ display: 'block', marginBottom: 12 }}>
          หลังเปลี่ยน email คุณจะถูก logout อัตโนมัติ
        </Text>
        <Input.Password
          placeholder="รหัสผ่านปัจจุบัน"
          value={confirmPwVal}
          onChange={e => setConfirmPwVal(e.target.value)}
        />
      </Modal>
    </div>
  );
}
