import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';
const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = {
  fontSize: 11, color: '#94A3B8', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const TERMS = `ข้อกำหนดการใช้งาน (Terms of Use)

1. การใช้งานแอปพลิเคชัน
ผู้ใช้ตกลงที่จะใช้งานระบบเพื่อวัตถุประสงค์ด้านสาธารณสุขและการดูแลผู้ป่วยไร้บ้านเท่านั้น ห้ามนำข้อมูลไปใช้ในทางที่ไม่เหมาะสมหรือผิดกฎหมาย

2. ความรับผิดชอบของผู้ใช้
ผู้ใช้มีหน้าที่รักษาข้อมูลส่วนตัว รวมถึงรายงานการใช้งานที่ผิดปกติแก่ผู้ดูแลระบบทันที

3. ข้อมูลผู้ป่วย
ข้อมูลผู้ป่วยทั้งหมดในระบบถือเป็นข้อมูลลับ ห้ามเปิดเผยหรือนำออกนอกระบบโดยไม่ได้รับอนุญาต

4. การยกเลิกบัญชี
ผู้ดูแลระบบมีสิทธิ์ระงับหรือยกเลิกบัญชีที่ละเมิดข้อกำหนดได้ทันที`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { lineProfile, zones, setSystemProfile } = useProfileStore();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [step, setStep] = useState<'form' | 'terms'>('form');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('ไม่พบ LINE token');
      const { accessToken } = await api.guestRegister({
        idToken,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        zoneId: form.zoneId || undefined,
      });
      setToken(accessToken);
      const me = await api.getMe();
      setSystemProfile(me);
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message ?? 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'terms') return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>ข้อตกลงและนโยบาย</h2>
      <div
        onScroll={(e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolled(true); }}
        style={{ height: 320, overflowY: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 16 }}
      >
        {TERMS}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" disabled={!scrolled} checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13, color: '#0F172A' }}>ฉันได้อ่านและยอมรับข้อตกลงแล้ว</span>
      </label>
      {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <button
        disabled={!checked || loading}
        onClick={submit}
        style={{ width: '100%', padding: '12px', background: checked && !loading ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: checked && !loading ? 'pointer' : 'default' }}
      >
        {loading ? 'กำลังลงทะเบียน...' : 'ยืนยันและลงทะเบียน'}
      </button>
      <button onClick={() => setStep('form')} style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}>
        ← ย้อนกลับ
      </button>
    </div>
  );

  const valid = form.firstName.trim() && form.lastName.trim() && form.email.trim().includes('@');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      {lineProfile?.pictureUrl && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={lineProfile.pictureUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', border: `3px solid ${ACCENT}` }} />
          <p style={{ marginTop: 8, fontSize: 14, color: '#64748B' }}>สวัสดี, {lineProfile.displayName}</p>
        </div>
      )}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>ลงทะเบียนอาสาสมัคร</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>กรอกข้อมูลเพื่อเข้าร่วมเครือข่ายคลินิกผู้ไร้บ้าน</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={LBL}>ชื่อ *</label>
            <input style={INP} value={form.firstName} onChange={set('firstName')} placeholder="สมชาย" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={LBL}>นามสกุล *</label>
            <input style={INP} value={form.lastName} onChange={set('lastName')} placeholder="ใจดี" />
          </div>
        </div>
        <div>
          <label style={LBL}>อีเมล *</label>
          <input style={INP} type="email" value={form.email} onChange={set('email')} placeholder="example@email.com" />
        </div>
        <div>
          <label style={LBL}>เบอร์โทรศัพท์</label>
          <input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxx" />
        </div>
        <div>
          <label style={LBL}>พื้นที่ที่สนใจ</label>
          <select style={{ ...INP, appearance: 'none' }} value={form.zoneId} onChange={set('zoneId')}>
            <option value="">— เลือกพื้นที่ —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      </div>

      <button
        disabled={!valid}
        onClick={() => setStep('terms')}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid ? 'pointer' : 'default' }}
      >
        ถัดไป: อ่านข้อตกลง →
      </button>
    </div>
  );
}
