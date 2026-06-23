import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import liff from '@line/liff';
import { api, getToken } from '../lib/api';

const ACCENT = '#6366F1';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};

const STATUS_DOT: Record<string, string> = {
  PENDING: '#F59E0B',
  IN_PROGRESS: '#6366F1',
  DONE: '#10B981',
  NOT_FOUND: '#9CA3AF',
};

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  URGENT: 'เร่งด่วน',
  NORMAL: 'ปกติ',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: '#EF4444',
  URGENT: '#F59E0B',
  NORMAL: ACCENT,
};

function useJwtPayload() {
  const token = getToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function TaskPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const me = useJwtPayload();
  const navigate = useNavigate();

  useEffect(() => {
    api.getMyTasks().then(setTasks).finally(() => setLoading(false));
    liff.getProfile().then(p => setLineProfile({ displayName: p.displayName, pictureUrl: p.pictureUrl ?? undefined })).catch(() => {});
  }, []);

  const eventGroups: Record<string, { event: any; tasks: any[] }> = {};
  for (const t of tasks) {
    const eid = t.event?.id ?? '__none__';
    if (!eventGroups[eid]) eventGroups[eid] = { event: t.event, tasks: [] };
    eventGroups[eid].tasks.push(t);
  }
  const groups = Object.values(eventGroups);

  function toggleCollapse(eventId: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(eventId) ? next.delete(eventId) : next.add(eventId);
      return next;
    });
  }

  if (loading) return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: 16, paddingTop: 24 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 88, background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    </div>
  );

  const isGuest = me?.role === 'GUEST';

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 32 }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                HomeMed Connect
              </p>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>งานในพื้นที่วันนี้</h1>
              {!isGuest && (
                <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 3, marginBottom: 0 }}>
                  {groups.length} กิจกรรม · {tasks.length} ผู้ป่วย
                </p>
              )}
            </div>
            {me && (
              <Link to="/profile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', flexShrink: 0 }}>
                {lineProfile?.pictureUrl ? (
                  <img src={lineProfile.pictureUrl} alt="profile"
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid #E0E7FF` }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                      {(lineProfile?.displayName ?? me.displayName ?? me.email ?? '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <span style={{ fontSize: 10, color: '#94A3B8' }}>โปรไฟล์</span>
              </Link>
            )}
          </div>
        </div>

        {/* GUEST empty state */}
        {isGuest && groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFFBEB', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>รอการอนุมัติ</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
              บัญชีของคุณอยู่ในสถานะ Guest<br />SuperAdmin จะอนุมัติ Role ให้เร็วๆ นี้
            </div>
            <Link to="/profile"
              style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 10, background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              ดูโปรไฟล์ของฉัน
            </Link>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94A3B8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 14, margin: 0 }}>ไม่มีงานในพื้นที่ขณะนี้</p>
          </div>
        ) : (
          <div style={{ padding: '12px 12px 0' }}>
            {groups.map(({ event, tasks: groupTasks }) => {
              const priority: string = event?.priority ?? 'NORMAL';
              const eventId: string = event?.id ?? '__none__';
              const isCollapsed = collapsed.has(eventId);
              const startDate = event?.startDate
                ? new Date(event.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                : null;
              const dotColor = PRIORITY_DOT[priority] ?? ACCENT;
              const allFullWidth = priority === 'CRITICAL' || groupTasks.length === 1;

              return (
                <div key={eventId} style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 10 }}>

                  {/* Event header */}
                  <div
                    onClick={() => toggleCollapse(eventId)}
                    style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: isCollapsed ? 'none' : '1px solid #F1F5F9' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                          {event?.title ?? 'กิจกรรม'}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {startDate && <span>{startDate}</span>}
                          <span>·</span>
                          <span>{groupTasks.length} ผู้ป่วย</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: priority === 'CRITICAL' ? '#FEF2F2' : priority === 'URGENT' ? '#FFFBEB' : '#EEF2FF',
                        color: priority === 'CRITICAL' ? '#DC2626' : priority === 'URGENT' ? '#D97706' : ACCENT,
                      }}>
                        {PRIORITY_LABEL[priority] ?? 'ปกติ'}
                      </span>
                      <span style={{ color: '#CBD5E1', fontSize: 11, display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
                    </div>
                  </div>

                  {/* Patient bento grid */}
                  {!isCollapsed && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 8 }}>
                      {groupTasks.map((task, index) => {
                        const isDone = task.status === 'DONE' || task.status === 'NOT_FOUND';
                        return (
                          <div
                            key={task.id}
                            onClick={() => !isDone && navigate(`/patient/${task.id}`, { state: { task } })}
                            style={{
                              gridColumn: (allFullWidth || (groupTasks.length % 2 !== 0 && index === groupTasks.length - 1)) ? 'span 2' : 'span 1',
                              background: isDone ? '#F8FAFC' : priority === 'CRITICAL' ? '#FFF5F5' : '#F8FAFC',
                              borderRadius: 12, padding: '10px 12px',
                              border: `1px solid ${isDone ? '#E2E8F0' : priority === 'CRITICAL' ? '#FECACA' : '#E2E8F0'}`,
                              opacity: isDone ? 0.5 : 1,
                              cursor: isDone ? 'default' : 'pointer',
                              position: 'relative',
                            }}
                          >
                            {priority === 'CRITICAL' && !isDone && (
                              <div style={{ position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                            )}
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', lineHeight: 1.3, paddingRight: priority === 'CRITICAL' ? 16 : 0 }}>
                              {task.patient?.name ?? '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>HN {task.patient?.hn ?? '—'}</div>
                            {task.patient?.locationText && (
                              <div style={{ fontSize: 9, color: '#64748B', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                                📍 {task.patient.locationText}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_DOT[task.status] ?? '#D1D5DB', flexShrink: 0 }} />
                              <span style={{ fontSize: 9, color: '#64748B' }}>{STATUS_LABEL[task.status] ?? task.status}</span>
                            </div>
                            {task.patient?.conditions?.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                                {task.patient.conditions.map((c: string) => (
                                  <span key={c} style={{ fontSize: 8, background: '#F1F5F9', color: '#64748B', padding: '1px 6px', borderRadius: 20 }}>{c}</span>
                                ))}
                              </div>
                            )}
                            {!isDone && (
                              <div style={{ marginTop: 6, fontSize: 9, color: ACCENT, fontWeight: 600 }}>กดเพื่อดูข้อมูล →</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
