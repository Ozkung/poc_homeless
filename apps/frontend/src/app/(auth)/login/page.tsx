'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Input, Tag, Typography } from 'antd';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.ok) {
      router.replace('/dashboard');
    } else {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
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
        padding: '16px',
      }}
    >
      <Card
        style={{
          maxWidth: 400,
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,.10)',
          padding: 0,
        }}
        styles={{ body: { padding: '36px 40px 32px' } }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🏥
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Sarabun',sans-serif",
                fontSize: 9,
                color: '#1677ff',
                textTransform: 'uppercase',
                letterSpacing: '2.5px',
                lineHeight: 1,
                marginBottom: 2,
              }}
            >
              HomeMed
            </div>
            <div
              style={{
                fontFamily: "'Sarabun',sans-serif",
                fontSize: 20,
                fontWeight: 800,
                color: '#111',
                lineHeight: 1,
              }}
            >
              Connect
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #f5f5f5', margin: '0 -40px 24px' }} />

        {/* Heading */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "'Sarabun',sans-serif",
              fontSize: 15,
              fontWeight: 700,
              color: '#111',
              marginBottom: 4,
            }}
          >
            เข้าสู่ระบบ
          </div>
          <div style={{ fontSize: 12, color: '#aaa' }}>ระบบดูแลผู้ป่วยไร้บ้านในชุมชน</div>
        </div>

        {/* Error alert */}
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontFamily: "'Sarabun',sans-serif",
                fontSize: 10,
                color: '#aaa',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                marginBottom: 6,
              }}
            >
              EMAIL
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cm@hospital.th"
              required
              size="large"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label
                style={{
                  fontFamily: "'Sarabun',sans-serif",
                  fontSize: 10,
                  color: '#aaa',
                  textTransform: 'uppercase',
                  letterSpacing: '1.5px',
                }}
              >
                PASSWORD
              </label>
              <Typography.Link href="#" style={{ fontSize: 11 }}>
                ลืมรหัสผ่าน?
              </Typography.Link>
            </div>
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              size="large"
            />
          </div>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={loading}
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </Button>
        </form>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #f5f5f5',
            marginTop: 20,
            paddingTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'Sarabun',sans-serif",
              fontSize: 11,
              color: '#ccc',
            }}
          >
            v1.0 ·
          </span>
          <Tag color="blue" style={{ margin: 0 }}>
            CASE_MANAGER
          </Tag>
        </div>
      </Card>
    </div>
  );
}
