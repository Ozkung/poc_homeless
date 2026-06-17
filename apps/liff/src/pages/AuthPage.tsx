import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';

type Step = 'link' | 'tou';

const TERMS = `ข้อกำหนดการใช้งาน (Terms of Use)

1. การใช้งานแอปพลิเคชัน
ผู้ใช้ตกลงที่จะใช้งานระบบเพื่อวัตถุประสงค์ด้านสาธารณสุขและการดูแลผู้ป่วยไร้บ้านเท่านั้น ห้ามนำข้อมูลไปใช้ในทางที่ไม่เหมาะสมหรือผิดกฎหมาย

2. ความรับผิดชอบของผู้ใช้
ผู้ใช้มีหน้าที่รักษาข้อมูลส่วนตัวและรหัสผ่าน รวมถึงรายงานการใช้งานที่ผิดปกติแก่ผู้ดูแลระบบทันที

3. ข้อมูลผู้ป่วย
ข้อมูลผู้ป่วยทั้งหมดในระบบถือเป็นข้อมูลลับ ห้ามเปิดเผยหรือนำออกนอกระบบโดยไม่ได้รับอนุญาต

4. การยกเลิกบัญชี
ผู้ดูแลระบบมีสิทธิ์ระงับหรือยกเลิกบัญชีที่ละเมิดข้อกำหนดได้ทันที

นโยบายความเป็นส่วนตัว (Privacy Policy)

1. ข้อมูลที่เก็บรวบรวม
ระบบเก็บข้อมูล ชื่อ-นามสกุล, อีเมล, เบอร์โทรศัพท์, LINE User ID และข้อมูลการใช้งาน

2. วัตถุประสงค์การใช้ข้อมูล
ข้อมูลใช้เพื่อการประสานงานทีมสาธารณสุข การดูแลผู้ป่วย และการปรับปรุงระบบ

3. การเปิดเผยข้อมูล
ข้อมูลจะไม่ถูกเปิดเผยแก่บุคคลภายนอก ยกเว้นกรณีที่กฎหมายกำหนด

4. สิทธิ์ของผู้ใช้
ผู้ใช้มีสิทธิ์ขอดู แก้ไข หรือลบข้อมูลส่วนตัวได้โดยติดต่อผู้ดูแลระบบ`;

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, marginTop: 4,
};
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const btn = (primary = true): React.CSSProperties => ({
  width: '100%', padding: 12, borderRadius: 10, border: 'none',
  background: primary ? '#06c755' : '#f3f4f6',
  color: primary ? '#fff' : '#374151',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
});

const wrap = (children: React.ReactNode) => (
  <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 32 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
      {children}
    </div>
  </div>
);

export default function AuthPage() {
  const [step, setStep] = useState<Step>('link');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idToken] = useState(() => liff.getIDToken() ?? '');
  const navigate = useNavigate();

  if (step === 'link') {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.email || !form.password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
      setError('');
      setStep('tou');
    };

    return wrap(
      <form onSubmit={handleSubmit}>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>เชื่อมต่อบัญชี</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px' }}>ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ</p>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>อีเมล *</label>
          <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>รหัสผ่าน *</label>
          <input style={inp} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <button type="submit" style={btn(true)}>ถัดไป →</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
          <span style={{ color: '#6b7280', cursor: 'pointer' }} onClick={() => navigate('/welcome')}>
            ← ยังไม่มีบัญชี? กลับไปสมัคร
          </span>
        </p>
      </form>
    );
  }

  return wrap(
    <>
      <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>ข้อกำหนดและนโยบาย</h3>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}
      <div
        onScroll={e => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
        }}
        style={{ height: '55vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', background: '#fafafa' }}
      >
        {TERMS}
      </div>
      {!scrolled && <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" checked={checked} disabled={!scrolled} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13 }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
      </label>
      <button
        style={btn(true)}
        disabled={!checked || submitting}
        onClick={async () => {
          setSubmitting(true);
          setError('');
          try {
            const { accessToken } = await api.linkLine({ idToken, email: form.email, password: form.password });
            setToken(accessToken);
            navigate('/profile', { replace: true });
          } catch (err: any) {
            const msg =
              err.status === 409 ? 'LINE Account นี้ผูกกับบัญชีอื่นอยู่แล้ว'
              : err.status === 403 ? 'บัญชีนี้ไม่รองรับการผูก LINE'
              : err.status === 401 ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
              : 'เกิดข้อผิดพลาด กรุณาเปิดแอปใหม่';
            setError(msg);
            setScrolled(false);
            setChecked(false);
            setStep('link');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? 'กำลังบันทึก...' : 'ยืนยัน ✓'}
      </button>
      <button style={btn(false)} disabled={submitting} onClick={() => { setScrolled(false); setChecked(false); setStep('link'); }}>← ย้อนกลับ</button>
    </>
  );
}
