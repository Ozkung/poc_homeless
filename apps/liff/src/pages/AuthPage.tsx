import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';
import { liffLogin } from '../lib/liff';

const ACCENT = '#6366F1';

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box' as const,
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = { fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };

export default function AuthPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    const freshToken = liff.getIDToken() ?? '';
    if (!freshToken) { liffLogin(); return; }
    setError('');
    setSubmitting(true);
    try {
      const { accessToken } = await api.linkLine({ idToken: freshToken, email: form.email, password: form.password });
      setToken(accessToken);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      const errMsg: string = err.message ?? '';
      if (errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('invalid liff')) {
        liffLogin(); return;
      }
      setError(
        err.status === 409 ? 'LINE Account นี้ผูกกับบัญชีอื่นอยู่แล้ว'
          : err.status === 403 ? 'บัญชีนี้ไม่รองรับการผูก LINE (ต้องเป็น CARE_GIVER ขึ้นไป)'
          : err.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : 'เกิดข้อผิดพลาด กรุณาเปิดแอปใหม่'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 16px 14px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>HomeMed Connect</p>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>ผูกบัญชีในระบบ</h1>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>ใส่ข้อมูลบัญชีที่มีอยู่ในระบบ (ไม่รวม Guest)</p>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <label style={LBL}>อีเมล *</label>
              <input style={INP} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div style={{ padding: '12px 14px' }}>
              <label style={LBL}>รหัสผ่าน *</label>
              <input style={INP} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" disabled={submitting}
            style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: submitting ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
            {submitting ? 'กำลังผูกบัญชี...' : 'ผูกบัญชี ✓'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
          <span style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/register')}>
            ← ยังไม่มีบัญชี? กลับไปสมัคร
          </span>
        </p>
      </div>
    </div>
  );
}
