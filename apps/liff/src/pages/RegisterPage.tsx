import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, getToken } from '../lib/api';

type Step = 'loading' | 'form' | 'submitting';

interface Me {
  email: string;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, marginTop: 4, background: '#fff',
};
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const btn = (primary = true): React.CSSProperties => ({
  width: '100%', padding: 12, borderRadius: 10, border: 'none',
  background: primary ? '#7c3aed' : '#f3f4f6',
  color: primary ? '#fff' : '#374151',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
});

function isComplete(me: Me): boolean {
  return !!me.phone && !!me.birthDate && !!me.email;
}

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

const wrap = (children: React.ReactNode) => (
  <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 0 }}>
    <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
  </div>
);

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('loading');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [form, setForm] = useState({ phone: '', birthDate: '', gender: '' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      navigate('/welcome', { replace: true });
      return;
    }
    async function load() {
      try {
        const [me, profile] = await Promise.all([
          api.getMe(),
          liff.getProfile().catch(() => null),
        ]);
        if (profile) setLineProfile({ displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? undefined });
        setEmail(me.email);
        if (isComplete(me)) {
          navigate('/profile', { replace: true });
          return;
        }
        setForm({
          phone: me.phone ?? '',
          birthDate: toDateInput(me.birthDate),
          gender: me.gender ?? '',
        });
        setStep('form');
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
        setStep('form');
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.phone.trim()) { setError('กรุณาระบุเบอร์โทรศัพท์'); return; }
    if (!form.birthDate) { setError('กรุณาระบุวันเกิด'); return; }
    setError('');
    setStep('submitting');
    try {
      await api.updateMe({
        phone: form.phone.trim(),
        birthDate: form.birthDate,
        gender: form.gender || undefined,
      });
      navigate('/profile', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setStep('form');
    }
  }

  if (step === 'loading') return wrap(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: '#9ca3af', fontSize: 13, fontFamily: 'monospace' }}>กำลังโหลด...</p>
    </div>
  );

  const today = new Date().toISOString().slice(0, 10);

  return wrap(
    <>
      {/* Purple gradient header */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', padding: '20px 20px 18px', borderRadius: '0 0 24px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'monospace', margin: '0 0 8px' }}>HomeMed Connect</p>

        {/* LINE profile row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px', marginBottom: 12 }}>
          {lineProfile?.pictureUrl ? (
            <img src={lineProfile.pictureUrl} alt="LINE" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16, flexShrink: 0 }}>
              {lineProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{lineProfile?.displayName ?? '...'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>LINE Account เชื่อมต่อแล้ว ✓</div>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>ข้อมูลส่วนตัว</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>กรอกให้ครบก่อนเริ่มใช้งาน</div>
      </div>

      {/* Form */}
      <div style={{ padding: '0 16px 32px' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email read-only */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>อีเมล</label>
            <div style={{ ...inp, background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', cursor: 'not-allowed' }}>
              {email}
            </div>
            <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>ไม่สามารถแก้ไขอีเมลได้ที่นี่</p>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>เบอร์โทรศัพท์ *</label>
            <input
              style={inp}
              type="tel"
              placeholder="08x-xxx-xxxx"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          {/* BirthDate */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>วันเกิด *</label>
            <input
              style={inp}
              type="date"
              max={today}
              value={form.birthDate}
              onChange={e => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>

          {/* Gender chips */}
          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>เพศ</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => {
                const label = g === 'MALE' ? 'ชาย' : g === 'FEMALE' ? 'หญิง' : 'อื่นๆ';
                const selected = form.gender === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, gender: selected ? '' : g })}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 10, border: '1.5px solid',
                      borderColor: selected ? '#7c3aed' : '#e2e8f0',
                      background: selected ? '#7c3aed' : '#fff',
                      color: selected ? '#fff' : '#374151',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" style={btn(true)} disabled={step === 'submitting'}>
            {step === 'submitting' ? 'กำลังบันทึก...' : 'บันทึกและเริ่มใช้งาน →'}
          </button>
        </form>
      </div>
    </>
  );
}
