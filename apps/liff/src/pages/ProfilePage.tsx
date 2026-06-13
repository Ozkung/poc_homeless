import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { getToken } from '../lib/api';

const ROLE_LABEL: Record<string, string> = {
  GUEST: 'อาสาสมัคร', CASE_MANAGER: 'Case Manager',
  CARE_GIVER: 'ผู้ดูแล', ADMIN: 'ผู้ดูแลระบบ',
};
const ROLE_COLOR: Record<string, string> = {
  GUEST: '#f59e0b', CASE_MANAGER: '#1677ff',
  CARE_GIVER: '#10b981', ADMIN: '#ef4444',
};

interface Info { displayName: string; pictureUrl?: string; role: string; email: string; }

export default function ProfilePage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');

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
          } catch {}
        }
        setInfo({ displayName: lineProfile.displayName, pictureUrl: lineProfile.pictureUrl ?? undefined, role, email });
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้');
      }
    }
    load();
  }, []);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 40 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        {children}
      </div>
    </div>
  );

  if (error) return wrap(<div style={{ textAlign: 'center', color: '#888' }}>{error}</div>);

  if (!info) return wrap(
    <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13 }}>กำลังโหลด...</div>
  );

  return wrap(
    <div style={{ textAlign: 'center' }}>
      {info.pictureUrl
        ? <img src={info.pictureUrl} alt="profile" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f0f0f0', marginBottom: 14 }} />
        : <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#e5e7eb', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>👤</div>
      }

      <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 6 }}>{info.displayName}</div>

      {info.role && (
        <div style={{ display: 'inline-block', background: ROLE_COLOR[info.role] ?? '#888', color: '#fff', borderRadius: 20, padding: '3px 14px', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
          {ROLE_LABEL[info.role] ?? info.role}
        </div>
      )}

      <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 18px', textAlign: 'left', marginBottom: 20 }}>
        {info.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', paddingBottom: 10, borderBottom: '1px solid #f0f0f0', marginBottom: 10 }}>
            <span style={{ fontSize: 15 }}>📧</span>
            <span>{info.email}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
          <span style={{ fontSize: 15 }}>🏷️</span>
          <span>{(ROLE_LABEL[info.role] ?? info.role) || '—'}</span>
        </div>
      </div>

      <button
        onClick={() => liff.closeWindow()}
        style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#f3f4f6', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        ปิดหน้าต่าง
      </button>
    </div>
  );
}
