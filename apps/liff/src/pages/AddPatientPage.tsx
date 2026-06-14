import { useState } from 'react';
import liff from '@line/liff';
import { api } from '../lib/api';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box', marginTop: 4, background: '#fff',
};
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const btn = (primary = true): React.CSSProperties => ({
  width: '100%', padding: 13, borderRadius: 10, border: 'none',
  background: primary ? '#1677ff' : '#f3f4f6',
  color: primary ? '#fff' : '#374151',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
});

const CONDITIONS = ['เบาหวาน', 'ความดัน', 'โรคหัวใจ', 'วัณโรค', 'HIV', 'ซึมเศร้า', 'โรคไต', 'หอบหืด'];

export default function AddPatientPage() {
  const [form, setForm] = useState({
    name: '', age: '', gender: '', phone: '',
    initialComplaint: '', locationText: '', status: 'PENDING',
  });
  const [conditions, setConditions] = useState<string[]>([]);
  const [customCondition, setCustomCondition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ hn: string; name: string } | null>(null);
  const [error, setError] = useState('');

  function toggleCondition(c: string) {
    setConditions((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function addCustomCondition() {
    const val = customCondition.trim();
    if (val && !conditions.includes(val)) setConditions((prev) => [...prev, val]);
    setCustomCondition('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('กรุณาระบุชื่อผู้ป่วย'); return; }
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createPatient({
        name: form.name.trim(),
        age: form.age ? Number(form.age) : undefined,
        gender: form.gender || undefined,
        status: form.status || undefined,
        phone: form.phone || undefined,
        initialComplaint: form.initialComplaint || undefined,
        locationText: form.locationText || undefined,
        conditions,
      });
      setDone({ hn: result.hn, name: form.name.trim() });
    } catch (err: any) {
      setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: 16, paddingTop: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, maxWidth: 480, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
        {children}
      </div>
    </div>
  );

  if (done) return wrap(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>เพิ่มผู้ป่วยสำเร็จ</h2>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>{done.name}</p>
      <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 20px', marginBottom: 24, display: 'inline-block' }}>
        <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>HN</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace' }}>{done.hn}</div>
      </div>
      <button style={btn(false)} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</button>
      <button style={btn(true)} onClick={() => { setDone(null); setForm({ name: '', age: '', gender: '', phone: '', initialComplaint: '', locationText: '', status: 'PENDING' }); setConditions([]); }}>
        เพิ่มผู้ป่วยอีกคน
      </button>
    </div>
  );

  return wrap(
    <form onSubmit={handleSubmit}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>เพิ่มผู้ป่วยใหม่</h2>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>ชื่อ-นามสกุล *</label>
        <input style={inp} placeholder="ชื่อ นามสกุล" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>อายุ</label>
          <input style={inp} type="number" min="0" max="120" placeholder="ปี" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>เพศ</label>
          <select style={inp} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">-- เลือก --</option>
            <option value="MALE">ชาย</option>
            <option value="FEMALE">หญิง</option>
            <option value="OTHER">อื่นๆ</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>เบอร์โทรศัพท์</label>
        <input style={inp} type="tel" placeholder="08x-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>ระดับ Triage *</label>
        <select style={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="CRITICAL">L1 ฉุกเฉินวิกฤติ (สีแดง)</option>
          <option value="PENDING">L2 ฉุกเฉินเร่งด่วน (สีเหลือง)</option>
          <option value="STABLE">L3 ไม่เร่งด่วน (สีเขียว)</option>
          <option value="MISSING">L4 ทั่วไป (สีฟ้า)</option>
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>สถานที่พบ / ที่อยู่</label>
        <input style={inp} placeholder="เช่น ใต้สะพาน, ชุมชน..." value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>อาการเบื้องต้น</label>
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 72 }} placeholder="อาการที่พบ..." value={form.initialComplaint} onChange={(e) => setForm({ ...form, initialComplaint: e.target.value })} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>โรคประจำตัว</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {CONDITIONS.map((c) => (
            <button key={c} type="button" onClick={() => toggleCondition(c)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, cursor: 'pointer',
                background: conditions.includes(c) ? '#1677ff' : '#fff',
                color: conditions.includes(c) ? '#fff' : '#374151',
                borderColor: conditions.includes(c) ? '#1677ff' : '#d1d5db' }}>
              {c}
            </button>
          ))}
          {conditions.filter((c) => !CONDITIONS.includes(c)).map((c) => (
            <button key={c} type="button" onClick={() => toggleCondition(c)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #1677ff', fontSize: 12, cursor: 'pointer', background: '#1677ff', color: '#fff' }}>
              {c} ×
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input style={{ ...inp, flex: 1, marginTop: 0 }} placeholder="เพิ่มโรคอื่นๆ..." value={customCondition}
            onChange={(e) => setCustomCondition(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCondition(); } }} />
          <button type="button" onClick={addCustomCondition}
            style={{ padding: '0 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>
            เพิ่ม
          </button>
        </div>
      </div>

      <button type="submit" style={btn(true)} disabled={submitting}>
        {submitting ? 'กำลังบันทึก...' : 'บันทึกผู้ป่วย'}
      </button>
    </form>
  );
}
