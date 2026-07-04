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

export default function ReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    alias: '', locationText: '', initialComplaint: '', gender: '', age: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; hn: string } | null>(null);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const data = await api.guestReportPatient({
        alias: form.alias.trim(),
        locationText: form.locationText.trim(),
        initialComplaint: form.initialComplaint.trim(),
        gender: form.gender || undefined,
        age: form.age ? parseInt(form.age, 10) : undefined,
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  const valid = form.alias.trim() && form.locationText.trim() && form.initialComplaint.trim();

  if (result) return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34 }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', marginBottom: 8 }}>ส่งข้อมูลสำเร็จ</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 4 }}>ทีมงานจะติดตามผู้ป่วยรายนี้</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 24 }}>{result.hn}</p>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '12px 32px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>รายงานผู้ป่วย</h2>
      </div>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>พบผู้ไร้บ้านที่ต้องการความช่วยเหลือ? กรอกข้อมูลเบื้องต้น</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={LBL}>ชื่อ / นามแฝง *</label>
          <input style={INP} value={form.alias} onChange={set('alias')} placeholder="เช่น ลุงดำ หรือ ไม่ทราบชื่อ" />
        </div>
        <div>
          <label style={LBL}>สถานที่พบ *</label>
          <input style={INP} value={form.locationText} onChange={set('locationText')} placeholder="เช่น ใต้สะพาน, หน้าวัด..." />
        </div>
        <div>
          <label style={LBL}>อาการเบื้องต้น *</label>
          <textarea
            style={{ ...INP, minHeight: 80, resize: 'vertical' } as React.CSSProperties}
            value={form.initialComplaint}
            onChange={set('initialComplaint')}
            placeholder="เช่น มีไข้ ไม่รู้สึกตัว บาดเจ็บที่ขา..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={LBL}>เพศ</label>
            <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.gender} onChange={set('gender')}>
              <option value="">— ไม่ระบุ —</option>
              <option value="MALE">ชาย</option>
              <option value="FEMALE">หญิง</option>
              <option value="OTHER">อื่นๆ</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={LBL}>อายุโดยประมาณ</label>
            <input style={INP} type="number" min="0" max="120" value={form.age} onChange={set('age')} placeholder="ปี" />
          </div>
        </div>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <button
        disabled={!valid || submitting}
        onClick={submit}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: valid && !submitting ? ACCENT : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: valid && !submitting ? 'pointer' : 'default' }}
      >
        {submitting ? 'กำลังส่งข้อมูล...' : 'ส่งรายงาน'}
      </button>
    </div>
  );
}
