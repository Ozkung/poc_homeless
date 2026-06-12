import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';

type Step = 'choice' | 'register' | 'link' | 'tou' | 'done';
interface UserInfo { name: string; role: string; email: string; zone?: string }

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

function ChoiceStep({ onChoice }: { onChoice: (c: 'register' | 'link') => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>เข้าร่วมโครงการ</h2>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: '#9ca3af' }}>เลือกวิธีเข้าใช้งาน</p>
      <button style={btn(true)} onClick={() => onChoice('register')}>📝 สมัครสมาชิกใหม่</button>
      <button style={btn(false)} onClick={() => onChoice('link')}>🔗 เชื่อมต่อบัญชีที่มีอยู่</button>
    </div>
  );
}

function RegisterStep({ idToken, onSuccess, onBack }: { idToken: string; onSuccess: () => void; onBack: () => void }) {
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getPublicZones().then(setZones).catch(() => {}); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setSubmitting(true); setError('');
    try {
      const { accessToken } = await api.guestRegister({ idToken, ...form });
      setToken(accessToken);
      onSuccess();
    } catch (err: any) { setError(err.message ?? 'สมัครไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>สมัครสมาชิกใหม่</h3>
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}><label style={lbl}>ชื่อ *</label><input style={inp} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>นามสกุล *</label><input style={inp} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      </div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>อีเมล *</label><input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>เบอร์โทรศัพท์</label><input style={inp} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Zone ที่ต้องการลงพื้นที่</label>
        <select style={{ ...inp, background: '#fff' }} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
          <option value="">-- เลือก Zone --</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      <button type="submit" style={btn(true)} disabled={submitting}>{submitting ? 'กำลังสมัคร...' : 'ถัดไป →'}</button>
      <button type="button" style={btn(false)} onClick={onBack}>← ย้อนกลับ</button>
    </form>
  );
}

function LinkStep({ idToken, onSuccess, onBack }: { idToken: string; onSuccess: () => void; onBack: () => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setSubmitting(true); setError('');
    try {
      const { accessToken } = await api.linkLine({ idToken, ...form });
      setToken(accessToken);
      onSuccess();
    } catch (err: any) { setError(err.message ?? 'เชื่อมต่อไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>เชื่อมต่อบัญชี</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px' }}>ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ</p>
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      <div style={{ marginBottom: 12 }}><label style={lbl}>อีเมล *</label><input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div style={{ marginBottom: 20 }}><label style={lbl}>รหัสผ่าน *</label><input style={inp} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
      <button type="submit" style={btn(true)} disabled={submitting}>{submitting ? 'กำลังเชื่อมต่อ...' : 'ถัดไป →'}</button>
      <button type="button" style={btn(false)} onClick={onBack}>← ย้อนกลับ</button>
    </form>
  );
}

function TouStep({ onConfirm }: { onConfirm: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>ข้อกำหนดและนโยบาย</h3>
      <div onScroll={handleScroll} style={{ height: '55vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', background: '#fafafa' }}>
        {TERMS}
      </div>
      {!scrolled && <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" checked={checked} disabled={!scrolled} onChange={(e) => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13 }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
      </label>
      <button style={btn(true)} disabled={!checked} onClick={onConfirm}>ยืนยัน ✓</button>
    </div>
  );
}

function DoneStep({ info }: { info: UserInfo }) {
  const roleLabel: Record<string, string> = { GUEST: 'อาสาสมัคร', CASE_MANAGER: 'Case Manager', CARE_GIVER: 'ผู้ดูแล' };
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับ!</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#9ca3af' }}>เข้าร่วมโครงการสำเร็จแล้ว</p>
      <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 20, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{info.name}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>📧 {info.email}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>🏷️ {roleLabel[info.role] ?? info.role}</div>
        {info.zone && <div style={{ fontSize: 13, color: '#6b7280' }}>📍 Zone: {info.zone}</div>}
      </div>
      <button style={{ ...btn(false), marginTop: 20 }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</button>
    </div>
  );
}

export default function AuthPage() {
  const [step, setStep] = useState<Step>('choice');
  const [idToken, setIdToken] = useState('');
  const [userInfo] = useState<UserInfo>({ name: '', role: '', email: '' });

  useEffect(() => {
    const token = liff.getIDToken();
    if (token) setIdToken(token);
  }, []);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 32 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        {children}
      </div>
    </div>
  );

  if (step === 'choice') return wrap(<ChoiceStep onChoice={(c) => setStep(c)} />);
  if (step === 'register') return wrap(<RegisterStep idToken={idToken} onBack={() => setStep('choice')} onSuccess={() => setStep('tou')} />);
  if (step === 'link') return wrap(<LinkStep idToken={idToken} onBack={() => setStep('choice')} onSuccess={() => setStep('tou')} />);
  if (step === 'tou') return wrap(<TouStep onConfirm={() => setStep('done')} />);
  return wrap(<DoneStep info={userInfo} />);
}
