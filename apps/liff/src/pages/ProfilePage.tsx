import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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

export default function ProfilePage() {
  const navigate = useNavigate();
  const { systemProfile, zones, updateSystemProfile } = useProfileStore();
  const [form, setForm] = useState({ displayName: '', phone: '', preferredZoneId: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!systemProfile) return;
    setForm({
      displayName: systemProfile.displayName ?? '',
      phone: systemProfile.phone ?? '',
      preferredZoneId: systemProfile.preferredZoneId ?? '',
    });
  }, [systemProfile]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateMe({
        displayName: form.displayName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        preferredZoneId: form.preferredZoneId, // always send; empty string → backend sets null
      });
      updateSystemProfile(updated);
      setToast('บันทึกสำเร็จ');
      setTimeout(() => { setToast(''); navigate('/'); }, 1200);
    } catch (e: any) {
      setError(e.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 0 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>แก้ไขโปรไฟล์</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={LBL}>ชื่อที่แสดง</label>
          <input style={INP} value={form.displayName} onChange={set('displayName')} placeholder="ชื่อ-นามสกุล" />
        </div>
        <div>
          <label style={LBL}>เบอร์โทรศัพท์</label>
          <input style={INP} type="tel" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxx" />
        </div>
        <div>
          <label style={LBL}>พื้นที่ที่สนใจ</label>
          <select style={{ ...INP, appearance: 'none' } as React.CSSProperties} value={form.preferredZoneId} onChange={set('preferredZoneId')}>
            <option value="">— ไม่ระบุ —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
      {toast && <p style={{ color: '#16A34A', fontSize: 13, marginTop: 12, fontWeight: 600 }}>{toast}</p>}

      <button
        onClick={save}
        disabled={saving}
        style={{ width: '100%', marginTop: 24, padding: '12px', background: saving ? '#CBD5E1' : ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer' }}
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
