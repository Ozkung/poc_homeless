import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { getToken } from '../lib/api';

const ROLE_LABEL: Record<string, string> = {
  GUEST: 'อาสาสมัคร (รออนุมัติ)',
  CARE_GIVER: 'ผู้ดูแลภาคสนาม',
  CASE_MANAGER: 'Case Manager',
  MEDICAL_VOLUNTEER: 'อาสาพยาบาล',
  DOCTOR: 'แพทย์',
  ADMIN: 'ผู้ดูแลระบบ',
  SUPER_ADMIN: 'ผู้อำนวยการ',
};
const ROLE_COLOR: Record<string, string> = {
  GUEST: '#f59e0b',
  CARE_GIVER: '#10b981',
  CASE_MANAGER: '#1677ff',
  MEDICAL_VOLUNTEER: '#6366f1',
  DOCTOR: '#0ea5e9',
  ADMIN: '#ef4444',
  SUPER_ADMIN: '#7c3aed',
};

interface Info {
  displayName: string;
  pictureUrl?: string;
  role: string;
  email: string;
}

export default function ProfilePage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const lineProfile = await liff.getProfile();
        const token = getToken();
        let role = '', email = '';
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            role = payload.role ?? '';
            email = payload.email ?? '';
          } catch { /* ignore */ }
        }
        setInfo({
          displayName: lineProfile.displayName,
          pictureUrl: lineProfile.pictureUrl ?? undefined,
          role,
          email,
        });
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้');
      }
    }
    load();
  }, []);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, paddingTop: 32 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        {children}
      </div>
    </div>
  );

  if (error) return wrap(
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 36, marginBottom: 8 }}>⚠️</p>
      <p style={{ color: '#888', fontSize: 13 }}>{error}</p>
      <button
        onClick={() => navigate('/')}
        style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        กลับหน้าหลัก
      </button>
    </div>
  );

  if (!info) return wrap(
    <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '16px 0' }}>กำลังโหลด...</div>
  );

  const roleColor = ROLE_COLOR[info.role] ?? '#888';
  const initials = info.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return wrap(
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← กลับ
      </button>

      {/* Avatar + name */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {info.pictureUrl ? (
          <img
            src={info.pictureUrl}
            alt="profile"
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f0f0f0', marginBottom: 12 }}
          />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: roleColor, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff' }}>
            {initials}
          </div>
        )}

        <div style={{ fontSize: 20, fontWeight: 800, color: '#111', marginBottom: 8 }}>
          {info.displayName}
        </div>

        <span style={{ display: 'inline-block', background: roleColor, color: '#fff', borderRadius: 20, padding: '4px 16px', fontSize: 12, fontWeight: 700 }}>
          {ROLE_LABEL[info.role] ?? info.role}
        </span>
      </div>

      {/* Info card */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {info.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>📧</span>
            <div>
              <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>อีเมล</div>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{info.email}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🏷️</span>
          <div>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>บทบาท</div>
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{ROLE_LABEL[info.role] ?? info.role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🟢</span>
          <div>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>LINE Account</div>
            <div style={{ fontSize: 13, color: '#06c755', fontWeight: 600 }}>เชื่อมต่อแล้ว</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => liff.closeWindow()}
        style={{ width: '100%', marginTop: 20, padding: 13, borderRadius: 12, border: 'none', background: '#f3f4f6', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        ปิดหน้าต่าง
      </button>
    </div>
  );
}
