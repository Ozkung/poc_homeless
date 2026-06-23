import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken, getToken } from '../lib/api';
import { liffLogin } from '../lib/liff';

const ACCENT = '#6366F1';
type Step = 'form' | 'tou';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zoneId: string;
}

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

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box' as const,
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = { fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('form');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [form, setForm] = useState<FormData>({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (getToken()) { navigate('/profile', { replace: true }); return; }
    liff.getProfile().then(p => setLineProfile({ displayName: p.displayName, pictureUrl: p.pictureUrl ?? undefined })).catch(() => {});
    api.getPublicZones().then(setZones).catch(() => {});
  }, []);

  const LineProfileBar = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
      {lineProfile?.pictureUrl ? (
        <img src={lineProfile.pictureUrl} alt="LINE" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #86EFAC', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14, flexShrink: 0 }}>
          {lineProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>{lineProfile?.displayName ?? '...'}</div>
        <div style={{ fontSize: 10, color: '#4ADE80', fontWeight: 600 }}>LINE เชื่อมต่อแล้ว ✓</div>
      </div>
    </div>
  );

  // ── Step: form ──
  if (step === 'form') {
    const handleNext = (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.firstName.trim() || !form.lastName.trim()) { setError('กรุณากรอกชื่อและนามสกุล'); return; }
      if (!form.email.trim()) { setError('กรุณากรอก Email'); return; }
      setError('');
      setStep('tou');
    };

    return (
      <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 16px 14px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>HomeMed Connect</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>สมัครสมาชิก</h1>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>กรอกข้อมูลเพื่อเข้าร่วมโครงการดูแลผู้ป่วยไร้บ้าน</p>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
          <LineProfileBar />

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleNext}>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ flex: 1, padding: '12px 14px', borderRight: '1px solid #F1F5F9' }}>
                  <label style={LBL}>ชื่อ *</label>
                  <input style={INP} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="สมชาย" />
                </div>
                <div style={{ flex: 1, padding: '12px 14px' }}>
                  <label style={LBL}>นามสกุล *</label>
                  <input style={INP} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="ใจดี" />
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
                <label style={LBL}>อีเมล *</label>
                <input style={INP} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
                <label style={LBL}>เบอร์โทรศัพท์</label>
                <input style={INP} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
              </div>
              <div style={{ padding: '12px 14px' }}>
                <label style={LBL}>Zone ที่ต้องการลงพื้นที่</label>
                <select style={{ ...INP, cursor: 'pointer' }} value={form.zoneId} onChange={e => setForm({ ...form, zoneId: e.target.value })}>
                  <option value="">-- เลือก Zone (ไม่บังคับ) --</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            </div>

            <button type="submit"
              style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
              ถัดไป →
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
            มีบัญชีในระบบอยู่แล้ว?{' '}
            <span style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/auth')}>
              เชื่อมบัญชี →
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ── Step: ToU ──
  const handleSubmit = async () => {
    const freshToken = liff.getIDToken() ?? '';
    if (!freshToken) { liffLogin(); return; }
    setSubmitting(true);
    setError('');
    try {
      const { accessToken } = await api.guestRegister({
        idToken: freshToken,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        zoneId: form.zoneId || undefined,
      });
      setToken(accessToken);
      navigate('/profile', { replace: true });
    } catch (err: any) {
      const msg = (err.message ?? '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid liff')) { liffLogin(); return; }
      setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 16px 14px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>HomeMed Connect</p>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>ข้อกำหนดและนโยบาย</h1>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>กรุณาอ่านและยอมรับก่อนสมัครสมาชิก</p>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
            {error}
          </div>
        )}

        <div
          onScroll={e => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
          }}
          style={{ height: '50vh', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, fontSize: 13, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-wrap', background: '#fff', marginBottom: 8 }}
        >
          {TERMS}
        </div>

        {!scrolled && (
          <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginBottom: 12 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4, marginBottom: 12 }}>
          <input type="checkbox" checked={checked} disabled={!scrolled} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18, accentColor: ACCENT }} />
          <span style={{ fontSize: 13, color: '#374151' }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
        </label>

        <button disabled={!checked || submitting} onClick={handleSubmit}
          style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: !checked || submitting ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: !checked || submitting ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
          {submitting ? 'กำลังสมัคร...' : 'สมัครสมาชิก ✓'}
        </button>
        <button disabled={submitting} onClick={() => { setScrolled(false); setChecked(false); setStep('form'); }}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ← ย้อนกลับ
        </button>
      </div>
    </div>
  );
}
