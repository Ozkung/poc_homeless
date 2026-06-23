import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box' as const,
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = { fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };

const CONDITIONS = ['เบาหวาน', 'ความดัน', 'โรคหัวใจ', 'วัณโรค', 'HIV', 'ซึมเศร้า', 'โรคไต', 'หอบหืด'];

export default function AddPatientPage() {
  const navigate = useNavigate();
  const { lineProfile, systemProfile } = useProfileStore();
  const [guardState, setGuardState] = useState<'loading' | 'no-zone' | 'ok'>('loading');
  const [form, setForm] = useState({
    name: '', age: '', gender: '', phone: '',
    initialComplaint: '', locationText: '', status: 'PENDING',
  });
  const [conditions, setConditions] = useState<string[]>([]);
  const [customCondition, setCustomCondition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ hn: string; name: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (systemProfile) {
      setGuardState(systemProfile.preferredZoneId ? 'ok' : 'no-zone');
    } else {
      // fallback: fetch if store is empty (e.g. deep link opened directly)
      api.getMe().then(me => {
        setGuardState(me.preferredZoneId ? 'ok' : 'no-zone');
      }).catch(() => setGuardState('ok'));
    }
  }, [systemProfile?.id]);

  function toggleCondition(c: string) {
    setConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function addCustomCondition() {
    const val = customCondition.trim();
    if (val && !conditions.includes(val)) setConditions(prev => [...prev, val]);
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

  const PageWrap = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 16px 14px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>HomeMed Connect</p>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>เพิ่มผู้ป่วยใหม่</h1>
      </div>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        {children}
      </div>
    </div>
  );

  if (guardState === 'loading') return (
    <PageWrap>
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</div>
    </PageWrap>
  );

  if (guardState === 'no-zone') return (
    <PageWrap>
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EEF2FF', border: '1px solid #C7D2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>📍</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>ยังไม่ได้เลือก Zone</div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
          กรุณาเพิ่ม Zone ในหน้าโปรไฟล์ก่อน<br />จึงจะสามารถเพิ่มผู้ป่วยได้
        </div>
        <button style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} onClick={() => navigate('/profile')}>
          ไปหน้าโปรไฟล์
        </button>
      </div>
    </PageWrap>
  );

  if (done) return (
    <PageWrap>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#0F172A' }}>เพิ่มผู้ป่วยสำเร็จ</h2>
        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: 13 }}>{done.name}</p>
        <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 12, padding: '12px 20px', marginBottom: 24, display: 'inline-block' }}>
          <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>HN</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#3730A3', fontFamily: 'monospace', marginTop: 2 }}>{done.hn}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            onClick={() => { setDone(null); setForm({ name: '', age: '', gender: '', phone: '', initialComplaint: '', locationText: '', status: 'PENDING' }); setConditions([]); }}>
            เพิ่มผู้ป่วยอีกคน
          </button>
          <button style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            onClick={() => liff.closeWindow()}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </PageWrap>
  );

  return (
    <PageWrap>
      {/* LINE profile bar */}
      {lineProfile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
          {lineProfile.pictureUrl ? (
            <img src={lineProfile.pictureUrl} alt="LINE" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '2px solid #86EFAC', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 13, flexShrink: 0 }}>
              {lineProfile.displayName[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>{lineProfile.displayName}</div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 12 }}>

          {/* Name */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <label style={LBL}>ชื่อ-นามสกุล *</label>
            <input style={INP} placeholder="ชื่อ นามสกุล" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          {/* Age + Gender */}
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ flex: 1, padding: '12px 14px', borderRight: '1px solid #F1F5F9' }}>
              <label style={LBL}>อายุ</label>
              <input style={INP} type="number" min="0" max="120" placeholder="ปี" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
            </div>
            <div style={{ flex: 1, padding: '12px 14px' }}>
              <label style={LBL}>เพศ</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                <option value="">-- เลือก --</option>
                <option value="MALE">ชาย</option>
                <option value="FEMALE">หญิง</option>
                <option value="OTHER">อื่นๆ</option>
              </select>
            </div>
          </div>

          {/* Phone */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <label style={LBL}>เบอร์โทรศัพท์</label>
            <input style={INP} type="tel" placeholder="08x-xxx-xxxx" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>

          {/* Triage */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <label style={LBL}>ระดับ Triage</label>
            <select style={{ ...INP, cursor: 'pointer' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="CRITICAL">L1 ฉุกเฉินวิกฤติ (สีแดง)</option>
              <option value="PENDING">L2 ฉุกเฉินเร่งด่วน (สีเหลือง)</option>
              <option value="STABLE">L3 ไม่เร่งด่วน (สีเขียว)</option>
              <option value="MISSING">L4 ทั่วไป (สีฟ้า)</option>
            </select>
          </div>

          {/* Location */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <label style={LBL}>สถานที่พบ / ที่อยู่</label>
            <input style={INP} placeholder="เช่น ใต้สะพาน, ชุมชน..." value={form.locationText} onChange={e => setForm({ ...form, locationText: e.target.value })} />
          </div>

          {/* Initial complaint */}
          <div style={{ padding: '12px 14px' }}>
            <label style={LBL}>อาการเบื้องต้น</label>
            <textarea style={{ ...INP, resize: 'vertical', minHeight: 72, lineHeight: 1.6 } as React.CSSProperties} placeholder="อาการที่พบ..." value={form.initialComplaint} onChange={e => setForm({ ...form, initialComplaint: e.target.value })} />
          </div>
        </div>

        {/* Conditions */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: '14px 14px 16px', marginBottom: 14 }}>
          <label style={LBL}>โรคประจำตัว</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {CONDITIONS.map(c => (
              <button key={c} type="button" onClick={() => toggleCondition(c)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, cursor: 'pointer', background: conditions.includes(c) ? ACCENT : '#F8FAFC', color: conditions.includes(c) ? '#fff' : '#475569', borderColor: conditions.includes(c) ? ACCENT : '#E2E8F0', fontWeight: conditions.includes(c) ? 600 : 400 }}>
                {c}
              </button>
            ))}
            {conditions.filter(c => !CONDITIONS.includes(c)).map(c => (
              <button key={c} type="button" onClick={() => toggleCondition(c)}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${ACCENT}`, fontSize: 12, cursor: 'pointer', background: ACCENT, color: '#fff', fontWeight: 600 }}>
                {c} ×
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input style={{ ...INP, flex: 1, marginTop: 0 }} placeholder="เพิ่มโรคอื่นๆ..." value={customCondition}
              onChange={e => setCustomCondition(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCondition(); } }} />
            <button type="button" onClick={addCustomCondition}
              style={{ padding: '0 14px', borderRadius: 9, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontSize: 13, color: '#475569' }}>
              เพิ่ม
            </button>
          </div>
        </div>

        <button type="submit" disabled={submitting}
          style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: submitting ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'กำลังบันทึก...' : 'บันทึกผู้ป่วย'}
        </button>
      </form>
    </PageWrap>
  );
}
