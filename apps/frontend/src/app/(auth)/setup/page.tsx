'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SetupForm {
  orgName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [form] = Form.useForm<SetupForm>();

  async function handleSubmit(values: SetupForm) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.status === 409) {
        setError('ระบบถูกตั้งค่าแล้ว กรุณาเข้าสู่ระบบ');
        return;
      }
      if (!res.ok) {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f2f5',
        backgroundImage: 'radial-gradient(circle, #d0d7e3 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card
        style={{ maxWidth: 440, width: '100%', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.10)' }}
        styles={{ body: { padding: '36px 40px 32px' } }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#1677ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Home size={20} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 8, color: '#1677ff', textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1, marginBottom: 2 }}>
              Homeless Mobile Clinic
            </div>
            <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 18, fontWeight: 800, color: '#111', lineHeight: 1 }}>
              by AUTRA
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #f5f5f5', margin: '0 -40px 24px' }} />

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>
            ตั้งค่าระบบครั้งแรก
          </div>
          <div style={{ fontSize: 12, color: '#aaa' }}>สร้างองค์กรและผู้ดูแลระบบ — ใช้ได้ครั้งเดียว</div>
        </div>

        {done ? (
          <Alert
            type="success"
            showIcon
            message="ตั้งค่าเรียบร้อย กำลังนำไปหน้าเข้าสู่ระบบ..."
          />
        ) : (
          <>
            {error && (
              <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
            )}

            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="orgName"
                label={<span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.5px' }}>ชื่อองค์กร</span>}
                rules={[{ required: true, message: 'กรุณาใส่ชื่อองค์กร' }]}
              >
                <Input placeholder="โรงพยาบาลชุมชน..." size="large" />
              </Form.Item>

              <Form.Item
                name="adminName"
                label={<span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.5px' }}>ชื่อผู้ดูแลระบบ</span>}
                rules={[{ required: true, message: 'กรุณาใส่ชื่อ' }]}
              >
                <Input placeholder="ชื่อ-นามสกุล" size="large" />
              </Form.Item>

              <Form.Item
                name="adminEmail"
                label={<span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.5px' }}>อีเมล</span>}
                rules={[{ required: true, type: 'email', message: 'กรุณาใส่อีเมลที่ถูกต้อง' }]}
              >
                <Input type="email" placeholder="admin@hospital.th" size="large" />
              </Form.Item>

              <Form.Item
                name="adminPassword"
                label={<span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.5px' }}>รหัสผ่าน</span>}
                rules={[{ required: true, min: 8, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }]}
              >
                <Input.Password size="large" />
              </Form.Item>

              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                ตั้งค่าระบบ
              </Button>
            </Form>
          </>
        )}

        <div style={{
          borderTop: '1px solid #f5f5f5', marginTop: 20, paddingTop: 16,
          textAlign: 'center', fontFamily: "'Sarabun',sans-serif", fontSize: 11, color: '#ccc',
        }}>
          v1.0 · First-run setup
        </div>
      </Card>
    </div>
  );
}
