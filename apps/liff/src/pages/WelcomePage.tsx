import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';
import { liffLogin } from '../lib/liff';

type Step = 'form' | 'tou' | 'done';

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

interface HeaderProps {
  lineProfile: { displayName: string; pictureUrl?: string } | null;
}

function Header({ lineProfile }: HeaderProps) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      {lineProfile?.pictureUrl ? (
        <img
          src={lineProfile.pictureUrl}
          alt="LINE profile"
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f0f0f0', marginBottom: 10 }}
        />
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#06c755', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff' }}>
          {lineProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{lineProfile?.displayName ?? ''}</div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>ยินดีต้อนรับสู่โครงการ</div>
    </div>
  );
}

export default function WelcomePage() {
  const [step, setStep] = useState<Step>('form');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idToken, setIdToken] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    liff.getProfile().then(setLineProfile).catch(() => {});
    api.getPublicZones().then(setZones).catch(() => {});
    const token = liff.getIDToken();
    if (token) setIdToken(token);
  }, []);

  if (step === 'form') {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.firstName || !formData.lastName || !formData.email) {
        setError('กรุณากรอกข้อมูลให้ครบ');
        return;
      }
      setError('');
      setStep('tou');
    };

    return wrap(
      <>
        <Header lineProfile={lineProfile} />
        <form onSubmit={handleSubmit}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>สมัครสมาชิก</h3>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>ชื่อ *</label>
              <input style={inp} value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>นามสกุล *</label>
              <input style={inp} value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>อีเมล *</label>
            <input style={inp} type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>เบอร์โทรศัพท์</label>
            <input style={inp} type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Zone ที่ต้องการลงพื้นที่</label>
            <select style={{ ...inp, background: '#fff' }} value={formData.zoneId} onChange={e => setFormData({ ...formData, zoneId: e.target.value })}>
              <option value="">-- เลือก Zone --</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <button type="submit" style={btn(true)}>ถัดไป →</button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
          มีบัญชีในระบบอยู่แล้ว?{' '}
          <span
            style={{ color: '#06c755', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => navigate('/auth')}
          >
            เชื่อมบัญชี →
          </span>
        </p>
      </>
    );
  }

  if (step === 'tou') {
    return wrap(
      <>
        <Header lineProfile={lineProfile} />
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
            const freshToken = liff.getIDToken() ?? '';
            if (!freshToken) {
              liffLogin();
              return;
            }
            setSubmitting(true);
            setError('');
            try {
              const { accessToken } = await api.guestRegister({
                idToken: freshToken,
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                phone: formData.phone,
                zoneId: formData.zoneId,
              });
              setToken(accessToken);
              setStep('done');
            } catch (err: any) {
              const msg = (err.message ?? '').toLowerCase();
              if (msg.includes('expired') || msg.includes('invalid liff')) {
                liffLogin();
                return;
              }
              setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
              setScrolled(false);
              setChecked(false);
              setStep('form');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? 'กำลังบันทึก...' : 'ยืนยัน ✓'}
        </button>
        <button style={btn(false)} disabled={submitting} onClick={() => { setScrolled(false); setChecked(false); setStep('form'); }}>← ย้อนกลับ</button>
      </>
    );
  }

  return wrap(
    <div style={{ textAlign: 'center' }}>
      <Header lineProfile={lineProfile} />
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับ!</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>สมัครสมาชิกสำเร็จแล้ว</p>
      <span style={{ display: 'inline-block', background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '4px 16px', fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
        อาสาสมัคร (รออนุมัติ)
      </span>
      <button style={{ ...btn(true), marginTop: 0 }} onClick={() => navigate('/profile', { replace: true })}>
        ดูโปรไฟล์ →
      </button>
    </div>
  );
}
