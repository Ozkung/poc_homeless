import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};
const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-amber-400',
  IN_PROGRESS: 'bg-blue-500',
  DONE: 'bg-green-500',
  NOT_FOUND: 'bg-gray-400',
};
const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', label: 'วิกฤต' },
  URGENT:   { bg: 'bg-amber-100', text: 'text-amber-700', label: 'เร่งด่วน' },
  NORMAL:   { bg: 'bg-blue-100', text: 'text-blue-700', label: 'ปกติ' },
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
  const me = useJwtPayload();

  useEffect(() => {
    api.getMyTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  // Group by event
  const eventGroups: Record<string, { event: any; tasks: any[] }> = {};
  for (const t of tasks) {
    const eid = t.event?.id ?? '__none__';
    if (!eventGroups[eid]) eventGroups[eid] = { event: t.event, tasks: [] };
    eventGroups[eid].tasks.push(t);
  }
  const groups = Object.values(eventGroups);

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
      <div className="max-w-lg mx-auto p-4">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
            <h1 className="text-xl font-bold text-gray-900 mt-1">งานในพื้นที่</h1>
            <p className="text-sm text-gray-400 mt-0.5">{tasks.length} ผู้ป่วย · {groups.length} กิจกรรม</p>
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

        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm">ไม่มีงานในพื้นที่ขณะนี้</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ event, tasks: groupTasks }) => {
              const priority = PRIORITY_BADGE[event?.priority] ?? PRIORITY_BADGE.NORMAL;
              const startDate = event?.startDate
                ? new Date(event.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                : null;
              return (
                <div key={event?.id ?? '__none__'} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Event header */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-snug truncate">
                          {event?.title ?? 'กิจกรรม'}
                        </p>
                        {startDate && (
                          <p className="text-xs text-gray-400 mt-0.5">📅 {startDate}</p>
                        )}
                        {event?.note && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{event.note}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priority.bg} ${priority.text}`}>
                          {priority.label}
                        </span>
                        <span className="text-xs text-gray-400">{groupTasks.length} คน</span>
                      </div>
                    </div>
                  </div>

                  {/* Patient list */}
                  <div className="divide-y divide-gray-50">
                    {groupTasks.map((task) => {
                      const canAct = task.status !== 'DONE' && task.status !== 'NOT_FOUND';
                      return (
                        <div key={task.id} className="px-4 py-3">
                          {/* Patient info row */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[task.status] ?? 'bg-gray-300'}`} />
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">
                                  {task.patient?.name ?? '—'}
                                </p>
                                <p className="text-xs text-gray-400">HN {task.patient?.hn ?? '—'}</p>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {STATUS_LABEL[task.status] ?? task.status}
                            </span>
                          </div>

                          {/* Location */}
                          {task.patient?.locationText && (
                            <p className="text-xs text-gray-500 mb-2 flex gap-1">
                              <span>📍</span>
                              <span className="line-clamp-1">{task.patient.locationText}</span>
                            </p>
                          )}

                          {/* Conditions */}
                          {task.patient?.conditions?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {task.patient.conditions.map((c: string) => (
                                <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                              ))}
                            </div>
                          )}

                          {/* Action buttons */}
                          {canAct && (
                            <div className="flex gap-2 flex-wrap mt-1">
                              {task.formTemplate && (
                                <Link
                                  to={`/form/${task.id}/${task.formTemplate.id}?token=${task.liffToken ?? ''}`}
                                  className="flex-1 text-center text-xs font-bold py-2.5 px-3 bg-purple-600 text-white rounded-xl"
                                >
                                  📋 {task.formTemplate.title}
                                </Link>
                              )}
                              {task.status === 'PENDING' && (
                                <Link
                                  to={`/checkin/${task.id}`}
                                  className="text-center text-xs font-semibold py-2.5 px-3 border border-purple-300 text-purple-600 rounded-xl"
                                >
                                  Check-in
                                </Link>
                              )}
                              <Link
                                to={`/note/${task.id}`}
                                className="text-center text-xs font-semibold py-2.5 px-3 border border-gray-300 text-gray-600 rounded-xl"
                              >
                                บันทึก
                              </Link>
                              {task.patient?.id && (
                                <Link
                                  to={`/care-plan/${task.patient.id}`}
                                  className="text-center text-xs font-semibold py-2.5 px-3 border border-blue-200 text-blue-600 rounded-xl"
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
