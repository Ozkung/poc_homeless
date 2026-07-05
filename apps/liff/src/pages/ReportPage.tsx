import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, TodayTask } from '../lib/api';
import { useProfileStore } from '../store/profileStore';
import PatientTaskSheet from '../components/PatientTaskSheet';

const ACCENT = '#6366F1';

const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ', IN_PROGRESS: 'กำลังดำเนินการ', DONE: 'เสร็จแล้ว', NOT_FOUND: 'ไม่พบผู้ป่วย',
};
const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', IN_PROGRESS: '#3B82F6', DONE: '#22C55E', NOT_FOUND: '#94A3B8',
};
const PAT_STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#EF4444', PENDING: '#F59E0B', STABLE: '#22C55E', MISSING: '#94A3B8',
};
const PAT_STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'L1', PENDING: 'L2', STABLE: 'L3', MISSING: 'L4',
};

export default function ReportPage() {
  const navigate = useNavigate();
  const { systemProfile } = useProfileStore();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [state, setState] = useState<'loading' | 'no-zone' | 'no-event' | 'list'>('loading');
  const [selected, setSelected] = useState<TodayTask | null>(null);

  useEffect(() => {
    if (!systemProfile) return;
    if (!systemProfile.preferredZoneId) { setState('no-zone'); return; }

    api.getTodayTasks()
      .then((data) => {
        setTasks(data);
        setState(data.length === 0 ? 'no-event' : 'list');
      })
      .catch(() => setState('no-event'));
  }, [systemProfile]);

  function handleStatusChange(taskId: string, status: string) {
    setTasks((prev) => prev.map((t) => t.taskId === taskId ? { ...t, status: status as TodayTask['status'] } : t));
    setSelected((prev) => prev?.taskId === taskId ? { ...prev, status: status as TodayTask['status'] } : prev);
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 12px', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>ลงตรวจวันนี้</h1>
        {systemProfile?.preferredZone && (
          <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{systemProfile.preferredZone.name}</p>
        )}
      </div>

      {/* States */}
      {state === 'loading' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#94A3B8', fontSize: 14 }}>กำลังโหลด...</p>
        </div>
      )}

      {state === 'no-zone' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📍</p>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15, marginBottom: 8 }}>ยังไม่ได้ตั้งค่าพื้นที่</p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>กรุณาตั้งค่า Zone ก่อนใช้งาน</p>
          <button onClick={() => navigate('/profile')}
            style={{ padding: '10px 24px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            ตั้งค่าโปรไฟล์
          </button>
        </div>
      )}

      {state === 'no-event' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15, marginBottom: 4 }}>ไม่มีการลงตรวจวันนี้</p>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>ในพื้นที่ของคุณยังไม่มี Event วันนี้</p>
        </div>
      )}

      {state === 'list' && (
        <div style={{ padding: 12 }}>
          <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10, fontWeight: 600 }}>
            {[...new Set(tasks.map((t) => t.eventTitle))].join(' / ')} · {tasks.length} ราย
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map((t) => (
              <div key={t.taskId} onClick={() => setSelected(t)}
                style={{
                  background: '#fff', borderRadius: 14, padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: t.status === 'DONE' ? 0.6 : 1,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                      background: PAT_STATUS_COLOR[t.patient.status] + '20',
                      color: PAT_STATUS_COLOR[t.patient.status],
                    }}>
                      {PAT_STATUS_LABEL[t.patient.status]}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.patient.name}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{t.patient.hn}</p>
                  {t.patient.conditions.length > 0 && (
                    <p style={{ fontSize: 11, color: '#64748B', margin: '4px 0 0' }}>{t.patient.conditions.slice(0, 2).join(', ')}</p>
                  )}
                </div>
                <div style={{ flexShrink: 0, marginLeft: 12, textAlign: 'right' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: TASK_STATUS_COLOR[t.status] + '15',
                    color: TASK_STATUS_COLOR[t.status],
                  }}>
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                  <p style={{ fontSize: 18, color: '#CBD5E1', margin: '4px 0 0' }}>›</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAB — เพิ่มผู้ป่วย */}
      <button onClick={() => navigate('/add')}
        style={{
          position: 'fixed', bottom: 24, right: 20, width: 52, height: 52,
          borderRadius: '50%', background: ACCENT, color: '#fff', border: 'none',
          fontSize: 26, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}>
        +
      </button>

      {/* Bottom Sheet */}
      {selected && (
        <PatientTaskSheet
          task={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
