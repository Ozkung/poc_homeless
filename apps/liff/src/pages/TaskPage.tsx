import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};

const STATUS_DOT_HEX: Record<string, string> = {
  PENDING: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  DONE: '#10b981',
  NOT_FOUND: '#9ca3af',
};

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  URGENT: 'เร่งด่วน',
  NORMAL: 'ปกติ',
};

const PRIORITY_HEADER: Record<string, string> = {
  CRITICAL: 'linear-gradient(135deg, #ef4444, #dc2626)',
  URGENT:   'linear-gradient(135deg, #f59e0b, #d97706)',
  NORMAL:   'linear-gradient(135deg, #3b82f6, #2563eb)',
};

const PRIORITY_GLOW: Record<string, string> = {
  CRITICAL: '#ef4444',
  URGENT:   '#f59e0b',
};

const TILE_BORDER: Record<string, string> = {
  CRITICAL: '#fca5a5',
  URGENT:   '#fcd34d',
};

const TILE_BG: Record<string, string> = {
  CRITICAL: 'linear-gradient(145deg, #fff5f5, #fff)',
  URGENT:   'linear-gradient(145deg, #fffbeb, #fff)',
};

function useJwtPayload() {
  const token = getToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function TaskPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const me = useJwtPayload();

  useEffect(() => {
    api.getMyTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  // Group tasks by event
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

  async function handleSos() {
    if (!window.confirm('ยืนยันส่ง SOS? CM จะได้รับแจ้งทันที')) return;
    setSosLoading(true);
    let coords: { lat?: number; lng?: number } = {};
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* location denied */ }
    const taskId = tasks[0]?.id ?? '';
    try {
      await api.sos(taskId, coords);
      setSosSent(true);
    } catch (e: any) {
      alert(e.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSosLoading(false);
    }
  }

  const SosBar = () => (
    <div
      onClick={!sosLoading ? handleSos : undefined}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: sosLoading ? '#d9363e' : '#ff4d4f',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: sosLoading ? 'not-allowed' : 'pointer', zIndex: 100,
      }}
    >
      <span style={{ fontSize: 18 }}>🚨</span>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 0.5 }}>
        {sosLoading ? 'กำลังส่ง SOS…' : 'SOS ฉุกเฉิน'}
      </span>
    </div>
  );

  if (sosSent) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-5xl mb-4">✅</p>
        <p className="font-semibold text-gray-700 text-lg">ส่ง SOS แล้ว</p>
        <p className="text-sm text-gray-400 mt-1">รอ CM ติดต่อกลับ</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ paddingBottom: 56 }}>
      <div className="max-w-lg mx-auto p-4 space-y-3 mt-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />)}
      </div>
      <SosBar />
    </div>
  );

  return (
    <div style={{ paddingBottom: 72 }}>
      <div className="max-w-lg mx-auto">

        {/* Top bar */}
        <div className="p-4 mb-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
              <h1 className="text-xl font-bold text-gray-900 mt-1">งานในพื้นที่</h1>
              <p className="text-sm text-gray-400 mt-0.5">{groups.length} กิจกรรม · {tasks.length} ผู้ป่วย</p>
            </div>
            {me && (
              <Link to="/profile" className="flex flex-col items-center gap-1 flex-shrink-0">
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
                    {(me.displayName ?? me.email ?? '?')[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-400">โปรไฟล์</span>
              </Link>
            )}
          </div>
        </div>

        {/* Empty state */}
        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm">ไม่มีงานในพื้นที่ขณะนี้</p>
          </div>
        ) : (
          <div className="px-3 space-y-2">
            {groups.map(({ event, tasks: groupTasks }) => {
              const priority: string = event?.priority ?? 'NORMAL';
              const eventId: string = event?.id ?? '__none__';
              const isCollapsed = collapsed.has(eventId);
              const startDate = event?.startDate
                ? new Date(event.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                : null;
              // CRITICAL events or single-patient events → all tiles full-width
              const allFullWidth = priority === 'CRITICAL' || groupTasks.length === 1;

              return (
                <div
                  key={eventId}
                  style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
                >
                  {/* Collapsible event header */}
                  <div
                    onClick={() => toggleCollapse(eventId)}
                    style={{
                      background: PRIORITY_HEADER[priority] ?? PRIORITY_HEADER.NORMAL,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
                        {event?.title ?? 'กิจกรรม'}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {startDate && <span>📅 {startDate}</span>}
                        <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: 8, fontWeight: 700, fontSize: 9, color: '#fff' }}>
                          {PRIORITY_LABEL[priority] ?? 'ปกติ'}
                        </span>
                        <span>{groupTasks.length} ผู้ป่วย</span>
                      </div>
                    </div>
                    <span style={{
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: 12,
                      flexShrink: 0,
                      marginTop: 2,
                      display: 'inline-block',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}>▼</span>
                  </div>

                  {/* Patient bento grid */}
                  {!isCollapsed && (
                    <div style={{
                      background: '#fff',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      padding: 10,
                    }}>
                      {groupTasks.map((task) => {
                        const canAct = task.status !== 'DONE' && task.status !== 'NOT_FOUND';
                        const glow = PRIORITY_GLOW[priority];

                        return (
                          <div
                            key={task.id}
                            style={{
                              gridColumn: allFullWidth ? 'span 2' : 'span 1',
                              background: TILE_BG[priority] ?? '#f8fafc',
                              borderRadius: 14,
                              padding: 10,
                              border: `1.5px solid ${TILE_BORDER[priority] ?? '#e2e8f0'}`,
                              opacity: canAct ? 1 : 0.55,
                              position: 'relative',
                            }}
                          >
                            {/* Priority glow dot — top-right */}
                            {glow && canAct && (
                              <div style={{
                                position: 'absolute', top: 8, right: 8,
                                width: 7, height: 7, borderRadius: '50%',
                                background: glow, boxShadow: `0 0 4px ${glow}`,
                              }} />
                            )}

                            {/* Patient name + HN */}
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, paddingRight: glow ? 16 : 0 }}>
                              {task.patient?.name ?? '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                              HN {task.patient?.hn ?? '—'}
                            </div>

                            {/* Location */}
                            {task.patient?.locationText && (
                              <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                                📍 {task.patient.locationText}
                              </div>
                            )}

                            {/* Status row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_DOT_HEX[task.status] ?? '#d1d5db', flexShrink: 0 }} />
                              <span style={{ fontSize: 9, color: '#64748b' }}>{STATUS_LABEL[task.status] ?? task.status}</span>
                            </div>

                            {/* Condition tags */}
                            {task.patient?.conditions?.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                {task.patient.conditions.map((c: string) => (
                                  <span key={c} style={{ fontSize: 8, background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: 5 }}>{c}</span>
                                ))}
                              </div>
                            )}

                            {/* Action buttons */}
                            {canAct && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                                {task.formTemplate && (
                                  <Link
                                    to={`/form/${task.id}/${task.formTemplate.id}?token=${task.liffToken ?? ''}`}
                                    style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 7, background: '#7c3aed', color: '#fff', textDecoration: 'none' }}
                                  >
                                    📋 {task.formTemplate.title}
                                  </Link>
                                )}
                                {task.status === 'PENDING' && (
                                  <Link
                                    to={`/checkin/${task.id}`}
                                    style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 7, border: '1px solid #c4b5fd', color: '#7c3aed', background: '#fff', textDecoration: 'none' }}
                                  >
                                    Check-in
                                  </Link>
                                )}
                                <Link
                                  to={`/note/${task.id}`}
                                  style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 7, border: '1px solid #e2e8f0', color: '#64748b', background: '#fff', textDecoration: 'none' }}
                                >
                                  บันทึก
                                </Link>
                                {task.patient?.id && (
                                  <Link
                                    to={`/care-plan/${task.patient.id}`}
                                    style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 7, border: '1px solid #bfdbfe', color: '#3b82f6', background: '#eff6ff', textDecoration: 'none' }}
                                  >
                                    แผนดูแล
                                  </Link>
                                )}
                              </div>
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

      <SosBar />
    </div>
  );
}
