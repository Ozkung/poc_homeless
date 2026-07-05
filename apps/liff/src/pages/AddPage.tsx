import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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

const STATUS_OPTIONS = [
  { value: 'CRITICAL', label: 'L1 ฉุกเฉินวิกฤติ' },
  { value: 'PENDING',  label: 'L2 ฉุกเฉินเร่งด่วน' },
  { value: 'STABLE',   label: 'L3 ไม่เร่งด่วน' },
  { value: 'MISSING',  label: 'L4 ทั่วไป' },
];

export default function AddPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', nationalId: '', phone: '',
    gender: '', birthDate: '', age: '',
    status: 'PENDING', locationText: '', conditions: '', initialComplaint: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; hn: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [photoError, setPhotoError] = useState('');

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const data = await api.guestReportPatient({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        phone: form.phone.trim() || undefined,
        gender: form.gender || undefined,
        birthDate: form.birthDate || undefined,
        age: form.age ? parseInt(form.age, 10) : undefined,
        status: form.status || undefined,
        locationText: form.locationText.trim() || undefined,
        conditions: form.conditions.trim()
          ? form.conditions.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        initialComplaint: form.initialComplaint.trim() || undefined,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !result) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('รูปใหญ่เกินไป (max 5MB)'); setPhotoState('error'); return;
    }
    setPhotoState('uploading'); setPhotoError('');
    try {
      const data = await api.uploadPatientPhoto(result.id, file);
      setPhotoUrl(data.photoUrl); setPhotoState('uploaded');
    } catch (err: any) {
      setPhotoError(err.message ?? 'อัพโหลดรูปไม่สำเร็จ'); setPhotoState('error');
    }
  }

  const valid = form.firstName.trim().length > 0;

  if (result) return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 320, width: '100%' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34 }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', marginBottom: 8 }}>ส่งข้อมูลสำเร็จ</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 4 }}>ทีมงานจะติดตามผู้ป่วยรายนี้</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 24 }}>{result.hn}</p>
        {photoState === 'uploaded' && photoUrl ? (
          <div style={{ marginBottom: 20 }}>
            <img src={`${import.meta.env.VITE_API_URL}${photoUrl}`} alt="รูปผู้ป่วย"
              style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', border: '2px solid #E2E8F0' }} />
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>บันทึกรูปผู้ป่วยแล้ว</p>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <input id="patient-photo-input" type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handlePhoto} />
            <label htmlFor="patient-photo-input" style={{
              display: 'inline-block', padding: '10px 24px',
              background: photoState === 'uploading' ? '#CBD5E1' : '#F1F5F9',
              color: photoState === 'uploading' ? '#94A3B8' : '#334155',
              border: '1px dashed #CBD5E1', borderRadius: 10, fontWeight: 600, fontSize: 14,
              cursor: photoState === 'uploading' ? 'default' : 'pointer',
              pointerEvents: photoState === 'uploading' ? 'none' : 'auto' as any,
            }}>
              {photoState === 'uploading' ? 'กำลังอัพโหลด...' : '📷 ถ่ายรูปผู้ป่วย'}
            </label>
            {photoState === 'error' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: '#EF4444', margin: '0 0 6px' }}>{photoError}</p>
                <label htmlFor="patient-photo-input" style={{ fontSize: 12, color: ACCENT, cursor: 'pointer', textDecoration: 'underline' }}>ลองใหม่</label>
              </div>
            )}
            {photoState === 'idle' && <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>ไม่บังคับ — สามารถข้ามได้</p>}
          </div>
        )}
        <button onClick={() => navigate('/report')}
          style={{ padding: '12px 32px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          กลับหน้าลงตรวจ
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/report')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>เพิ่มผู้ป่วยใหม่</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>ชื่อ *</label><input style={INP} value={form.firstName} onChange={set('firstName')} placeholder="สมชาย" /></div>
          <div style={{ flex: 1 }}><label style={LBL}>นามสกุล</label><input style={INP} value={form.lastName} onChange={set('lastName')} placeholder="ใจดี" /></div>
        </div>
        <div><label style={LBL}>เลขบัตรประชาชน</label><input style={INP} value={form.nationalId} onChange={set('nationalId')} placeholder="1234567890123" maxLength={13} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>เบอร์โทรศัพท์</label><input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="081-234-5678" /></div>
          <div style={{ flex: 1 }}><label style={LBL}>เพศ</label>
            <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.gender} onChange={set('gender')}>
              <option value="">— ไม่ระบุ —</option><option value="MALE">ชาย</option><option value="FEMALE">หญิง</option><option value="OTHER">อื่นๆ</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={LBL}>วันเกิด</label><input style={INP} type="date" value={form.birthDate} onChange={set('birthDate')} /></div>
          <div style={{ flex: 1 }}><label style={LBL}>อายุ (ปี)</label><input style={INP} type="number" min="0" max="150" value={form.age} onChange={set('age')} placeholder="ปี" /></div>
        </div>
        <div><label style={LBL}>สถานะ (Triage)</label>
          <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div><label style={LBL}>สถานที่ที่พบ</label><input style={INP} value={form.locationText} onChange={set('locationText')} placeholder="เช่น ใต้สะพาน ถ.พระราม 4" /></div>
        <div>
          <label style={LBL}>โรคประจำตัว</label>
          <input style={INP} value={form.conditions} onChange={set('conditions')} placeholder="เบาหวาน, ความดัน" />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>คั่นด้วยเครื่องหมายจุลภาค</p>
        </div>
        <div>
          <label style={LBL}>อาการเบื้องต้น</label>
          <textarea style={{ ...INP, minHeight: 80, resize: 'vertical' } as React.CSSProperties}
            value={form.initialComplaint} onChange={set('initialComplaint')}
            placeholder="เช่น ปวดศีรษะ เวียนหัว อ่อนเพลีย มา 3 วัน..." />
        </div>
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
      <button disabled={!valid || submitting} onClick={submit}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid && !submitting ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid && !submitting ? 'pointer' : 'default' }}>
        {submitting ? 'กำลังบันทึก...' : 'บันทึกผู้ป่วย'}
      </button>
    </div>
  );
}
