import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfileStore } from '../store/profileStore';

const ACCENT = '#6366F1';

const ROLE_LABEL: Record<string, string> = {
  GUEST:             'อาสาสมัคร (รออนุมัติ)',
  CARE_GIVER:        'ผู้ดูแลภาคสนาม',
  CASE_MANAGER:      'Case Manager',
  MEDICAL_VOLUNTEER: 'อาสาพยาบาล',
  DOCTOR:            'แพทย์',
  ADMIN:             'ผู้ดูแลระบบ',
  SUPER_ADMIN:       'ผู้อำนวยการ',
};

const ROLE_COLOR: Record<string, string> = {
  GUEST:             '#D97706',
  CARE_GIVER:        '#16A34A',
  CASE_MANAGER:      '#2563EB',
  MEDICAL_VOLUNTEER: ACCENT,
  DOCTOR:            '#0284C7',
  ADMIN:             '#DC2626',
  SUPER_ADMIN:       '#7C3AED',
};

export default function HomePage() {
  const navigate = useNavigate();
  const { lineProfile, systemProfile } = useProfileStore();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDoctorSchedules()
      .then((all) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const zoneId = systemProfile?.preferredZoneId;
        const upcoming = all
          .filter((s: any) => new Date(s.date) >= today && (!zoneId || s.zone?.id === zoneId))
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 10);
        setSchedules(upcoming);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [systemProfile?.preferredZoneId]);

  const role = systemProfile?.role ?? 'GUEST';
  const roleLabel = ROLE_LABEL[role] ?? role;
  const roleColor = ROLE_COLOR[role] ?? ACCENT;
  const picture = lineProfile?.pictureUrl;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 32 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 0' }}>

        {/* Profile chip */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {picture
            ? <img src={picture} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {systemProfile?.displayName ?? lineProfile?.displayName ?? '—'}
            </p>
            {systemProfile?.preferredZone && (
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>📍 {systemProfile.preferredZone.name}</p>
            )}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: roleColor, background: roleColor + '18', border: `1px solid ${roleColor}44`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
            {roleLabel}
          </span>
        </div>

        {/* Upcoming schedules */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', margin: 0 }}>📅 กำหนดการลงพื้นที่ที่จะถึง</p>
            {systemProfile?.preferredZone && (
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '3px 0 0' }}>เฉพาะพื้นที่: {systemProfile.preferredZone.name}</p>
            )}
          </div>
          {loading
            ? <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</div>
            : schedules.length === 0
              ? <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>ยังไม่มีกำหนดการ</div>
              : schedules.map((s, i) => (
                <div key={s.id} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid #F1F5F9' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>
                      {new Date(s.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>{s.startTime} – {s.endTime}</span>
                    {s.zone && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: s.zone.color ?? ACCENT, borderRadius: 20, padding: '1px 8px' }}>
                        {s.zone.name}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                    📍 {s.location ?? 'ไม่ระบุสถานที่'}
                    {s.doctor?.displayName ? ` · ${s.doctor.displayName}` : ''}
                  </p>
                </div>
              ))
          }
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/profile')}
            style={{ flex: 1, padding: '13px', background: '#fff', border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            แก้ไขโปรไฟล์
          </button>
          <button
            onClick={() => navigate('/report')}
            style={{ flex: 1, padding: '13px', background: ACCENT, border: 'none', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            รายงานผู้ป่วย
          </button>
        </div>

      </div>
    </div>
  );
}
