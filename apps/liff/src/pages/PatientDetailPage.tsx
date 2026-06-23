import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';

const ACCENT = '#6366F1';
type Tab = 'info' | 'timeline' | 'careplan';

const PRIORITY_COLOR: Record<string, string> = { HIGH: '#DC2626', MED: '#F59E0B', LOW: '#10B981' };
const PRIORITY_BG: Record<string, string>    = { HIGH: '#FEF2F2', MED: '#FFFBEB', LOW: '#F0FDF4' };
const ACTIVITY_ICON: Record<string, string> = {
  CHECK_IN: '📍', NOTE: '📝', FORM_SUBMISSION: '📋', CARE_PLAN: '🗂️', SOS: '🚨',
};

export default function PatientDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [task, setTask] = useState<any>(location.state?.task ?? null);
  const [activities, setActivities] = useState<any[]>([]);
  const [carePlan, setCarePlan] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(!location.state?.task);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!task) {
        try {
          const all = await api.getMyTasks();
          const found = all.find((t: any) => t.id === taskId);
          if (!found) { setError('ไม่พบข้อมูลผู้ป่วย'); setLoading(false); return; }
          setTask(found);
        } catch {
          setError('ไม่สามารถโหลดข้อมูลได้');
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    }
    load();
  }, [taskId]);

  useEffect(() => {
    if (!task?.patient?.id) return;
    api.getPatientActivities(task.patient.id).then(setActivities).catch(() => {});
    api.getCarePlan(task.patient.id).then(setCarePlan).catch(() => {});
  }, [task?.patient?.id]);

  async function handleStartExam() {
    if (!taskId) return;
    setCheckinLoading(true);
    try {
      await api.checkin(taskId);
      navigate(`/session/${taskId}`, { state: { task: { ...task, status: 'IN_PROGRESS' } } });
    } catch (e: any) {
      alert(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setCheckinLoading(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</p>
    </div>
  );

  if (error || !task) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 36 }}>⚠️</p>
      <p style={{ color: '#64748B', fontSize: 13 }}>{error || 'ไม่พบข้อมูล'}</p>
      <button onClick={() => navigate('/')}
        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        กลับหน้าหลัก
      </button>
    </div>
  );

  const patient = task.patient ?? {};
  const isPending = task.status === 'PENDING';
  const isInProgress = task.status === 'IN_PROGRESS';
  const priority: string = task.event?.priority ?? '';

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: (isPending || isInProgress) ? 88 : 32 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 16px' }}>
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← กลับ
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>{patient.name ?? '—'}</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>HN {patient.hn ?? '—'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {priority && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: priority === 'CRITICAL' ? '#FEF2F2' : priority === 'URGENT' ? '#FFFBEB' : '#EEF2FF',
              color: priority === 'CRITICAL' ? '#DC2626' : priority === 'URGENT' ? '#D97706' : ACCENT,
            }}>
              {priority === 'CRITICAL' ? 'วิกฤต' : priority === 'URGENT' ? 'เร่งด่วน' : 'ปกติ'}
            </span>
          )}
          {patient.conditions?.map((c: string) => (
            <span key={c} style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#F1F5F9', color: '#475569' }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        {(['info', 'timeline', 'careplan'] as Tab[]).map(t => {
          const labels: Record<Tab, string> = { info: 'ข้อมูล', timeline: 'ไทม์ไลน์', careplan: 'แผนดูแล' };
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '11px 0', border: 'none', background: 'transparent', borderBottom: `2px solid ${tab === t ? ACCENT : 'transparent'}`, color: tab === t ? ACCENT : '#94A3B8', fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', transition: 'color 0.15s' }}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ padding: 12, maxWidth: 480, margin: '0 auto' }}>

        {tab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'ที่อยู่ / สถานที่', value: patient.locationText },
              { label: 'อายุ', value: patient.age ? `${patient.age} ปี` : undefined },
              { label: 'เพศ', value: patient.gender === 'MALE' ? 'ชาย' : patient.gender === 'FEMALE' ? 'หญิง' : patient.gender === 'OTHER' ? 'อื่นๆ' : undefined },
              { label: 'เบอร์โทร', value: patient.phone },
              { label: 'อาการเบื้องต้น', value: patient.initialComplaint },
            ].filter(r => r.value).map(row => (
              <div key={row.label} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{row.label}</div>
                <div style={{ fontSize: 14, color: '#0F172A', lineHeight: 1.5 }}>{row.value}</div>
              </div>
            ))}
            {patient.conditions?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>โรคประจำตัว</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {patient.conditions.map((c: string) => (
                    <span key={c} style={{ fontSize: 12, background: '#F1F5F9', color: '#475569', padding: '4px 12px', borderRadius: 20, fontWeight: 500 }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {!patient.locationText && !patient.age && !patient.phone && !patient.initialComplaint && (!patient.conditions || patient.conditions.length === 0) && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8' }}>
                <p style={{ fontSize: 13, margin: 0 }}>ยังไม่มีข้อมูลผู้ป่วย</p>
              </div>
            )}
          </div>
        )}

        {tab === 'timeline' && (
          activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
              <p style={{ fontSize: 13, margin: 0 }}>ยังไม่มีประวัติกิจกรรม</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activities.map((act: any) => (
                <div key={act.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E2E8F0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{ACTIVITY_ICON[act.type] ?? '📌'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{act.actor?.displayName ?? 'ไม่ระบุ'}</div>
                    {act.payload?.note && <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>{act.payload.note}</div>}
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 5 }}>
                      {new Date(act.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'careplan' && (
          carePlan.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>🗂️</p>
              <p style={{ fontSize: 13, margin: 0 }}>ยังไม่มีแผนการดูแล</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {carePlan.map((item: any) => (
                <div key={item.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{item.isDone ? '✅' : '⬜'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', textDecoration: item.isDone ? 'line-through' : 'none', opacity: item.isDone ? 0.5 : 1, lineHeight: 1.4 }}>
                      {item.title}
                    </div>
                    {item.frequency && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{item.frequency}</div>}
                    {item.assigneeName && <div style={{ fontSize: 11, color: '#94A3B8' }}>ผู้รับผิดชอบ: {item.assigneeName}</div>}
                  </div>
                  {item.priority && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[item.priority] ?? '#94A3B8', background: PRIORITY_BG[item.priority] ?? '#F1F5F9', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
                      {item.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Fixed bottom action */}
      {(isPending || isInProgress) && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E2E8F0', padding: '12px 16px 16px' }}>
          {isPending ? (
            <button onClick={handleStartExam} disabled={checkinLoading}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: checkinLoading ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: checkinLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {checkinLoading ? 'กำลังเช็คอิน...' : '🏥 เริ่มตรวจสุขภาพ'}
            </button>
          ) : (
            <button onClick={() => navigate(`/session/${taskId}`, { state: { task } })}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#0F172A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ดำเนินการตรวจต่อ →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
