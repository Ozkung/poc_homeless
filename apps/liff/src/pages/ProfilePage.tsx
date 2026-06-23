import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, getToken } from '../lib/api';

const ACCENT = '#6366F1';

const ROLE_LABEL: Record<string, string> = {
  GUEST: 'อาสาสมัคร (รออนุมัติ)',
  CARE_GIVER: 'ผู้ดูแลภาคสนาม',
  CASE_MANAGER: 'Case Manager',
  MEDICAL_VOLUNTEER: 'อาสาพยาบาล',
  DOCTOR: 'แพทย์',
  ADMIN: 'ผู้ดูแลระบบ',
  SUPER_ADMIN: 'ผู้อำนวยการ',
};

const ROLE_CHIP: Record<string, React.CSSProperties> = {
  GUEST:            { background: '#FFFBEB', color: '#D97706', borderColor: '#FDE68A' },
  CARE_GIVER:       { background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' },
  CASE_MANAGER:     { background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' },
  MEDICAL_VOLUNTEER:{ background: '#EEF2FF', color: ACCENT,   borderColor: '#C7D2FE' },
  DOCTOR:           { background: '#F0F9FF', color: '#0284C7', borderColor: '#BAE6FD' },
  ADMIN:            { background: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' },
  SUPER_ADMIN:      { background: '#FAF5FF', color: '#7C3AED', borderColor: '#DDD6FE' },
};

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 9, fontSize: 14, boxSizing: 'border-box' as const,
  background: '#F8FAFC', color: '#0F172A', outline: 'none', marginTop: 4,
};
const LBL: React.CSSProperties = { fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [me, setMe] = useState<{
    email: string; displayName?: string; phone?: string | null;
    birthDate?: string | null; gender?: string | null; role: string;
    preferredZoneId?: string | null;
    preferredZone?: { id: string; name: string; color: string } | null;
  } | null>(null);
  const [zones, setZones] = useState<{ id: string; name: string; color: string }[]>([]);
  const [form, setForm] = useState({ displayName: '', email: '', phone: '', birthDate: '', gender: '', preferredZoneId: '' });
  const [currentPassword, setCurrentPassword] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { navigate('/register', { replace: true }); return; }
    async function load() {
      try {
        const [meData, lineP, zoneList] = await Promise.all([
          api.getMe(),
          liff.getProfile().catch(() => null),
          api.getPublicZones(),
        ]);
        setMe(meData);
        setZones(zoneList);
        if (lineP) setLineProfile({ displayName: lineP.displayName, pictureUrl: lineP.pictureUrl ?? undefined });
        setOriginalEmail(meData.email);
        setForm({
          displayName: meData.displayName ?? '',
          email: meData.email,
          phone: meData.phone ?? '',
          birthDate: toDateInput(meData.birthDate),
          gender: meData.gender ?? '',
          preferredZoneId: meData.preferredZoneId ?? '',
        });
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const emailChanged = form.email !== originalEmail;
    if (emailChanged && !currentPassword) { setError('กรุณาใส่รหัสผ่านปัจจุบันเพื่อเปลี่ยน Email'); return; }
    setError('');
    setSaving(true);
    try {
      const updated = await api.updateMe({
        displayName: form.displayName || undefined,
        email: emailChanged ? form.email : undefined,
        currentPassword: emailChanged ? currentPassword : undefined,
        phone: form.phone || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        preferredZoneId: form.preferredZoneId || undefined,
      });
      setOriginalEmail(updated.email);
      setCurrentPassword('');
      setMe(prev => prev ? { ...prev, ...updated } : prev);
      showToast('บันทึกเรียบร้อยแล้ว ✓');
    } catch (err: any) {
      setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</p>
    </div>
  );

  const chipStyle: React.CSSProperties = {
    ...(ROLE_CHIP[me?.role ?? ''] ?? { background: '#F1F5F9', color: '#475569', borderColor: '#E2E8F0' }),
    display: 'inline-block', fontSize: 11, fontWeight: 700,
    padding: '3px 12px', borderRadius: 20, border: '1px solid',
  };
  const pic = lineProfile?.pictureUrl;
  const name = lineProfile?.displayName ?? me?.displayName ?? '?';
  const initial = name[0]?.toUpperCase() ?? '?';
  const emailChanged = form.email !== originalEmail;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 40 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#0F172A', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap' }}>
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px', alignSelf: 'flex-start' }}>
          HomeMed Connect
        </p>
        {pic ? (
          <img src={pic} alt="LINE" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff', boxShadow: `0 0 0 3px #E0E7FF` }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 24, boxShadow: `0 0 0 3px #E0E7FF` }}>
            {initial}
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#06C755' }} />
          LINE เชื่อมต่อแล้ว
        </div>
        <span style={chipStyle}>{ROLE_LABEL[me?.role ?? ''] ?? me?.role}</span>
        {me?.role === 'GUEST' && (
          <p style={{ fontSize: 12, color: '#D97706', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
            รอการอนุมัติ Role จาก SuperAdmin
          </p>
        )}
      </div>

      {/* Form */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 0' }}>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#DC2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSave}>

          {/* Section label */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>ข้อมูลส่วนตัว</p>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 14 }}>

            {/* Display Name */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <label style={LBL}>ชื่อ-นามสกุล</label>
              <input style={INP} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="ชื่อ นามสกุล" />
            </div>

            {/* Email */}
            <div style={{ padding: '12px 14px', borderBottom: emailChanged ? '1px solid #F1F5F9' : '1px solid #F1F5F9' }}>
              <label style={LBL}>Email</label>
              <input style={{ ...INP, borderColor: emailChanged ? ACCENT : '#E2E8F0', background: emailChanged ? '#EEF2FF' : '#F8FAFC' }} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>

            {emailChanged && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                <label style={{ ...LBL, color: '#F59E0B' }}>รหัสผ่านปัจจุบัน (ยืนยันการเปลี่ยน Email) *</label>
                <input style={INP} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="รหัสผ่าน" />
              </div>
            )}

            {/* Phone */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <label style={LBL}>เบอร์โทรศัพท์</label>
              <input style={INP} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
            </div>

            {/* Birth Date */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <label style={LBL}>วันเกิด</label>
              <input style={INP} type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} />
            </div>

            {/* Gender */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <label style={LBL}>เพศ</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {(['MALE', 'FEMALE', 'OTHER'] as const).map(g => {
                  const label = g === 'MALE' ? 'ชาย' : g === 'FEMALE' ? 'หญิง' : 'อื่นๆ';
                  const selected = form.gender === g;
                  return (
                    <button key={g} type="button" onClick={() => setForm({ ...form, gender: selected ? '' : g })}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: '1.5px solid', borderColor: selected ? ACCENT : '#E2E8F0', background: selected ? ACCENT : '#F8FAFC', color: selected ? '#fff' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Zone */}
            <div style={{ padding: '12px 14px' }}>
              <label style={LBL}>Zone ที่ลงพื้นที่</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={form.preferredZoneId} onChange={e => setForm({ ...form, preferredZoneId: e.target.value })}>
                <option value="">-- ยังไม่ได้เลือก Zone --</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>

          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: saving ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </form>

        <button onClick={() => navigate('/auth')}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
          ผูกบัญชีในระบบ →
        </button>

        <button onClick={() => liff.closeWindow()}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'transparent', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}>
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}
