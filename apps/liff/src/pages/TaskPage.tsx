import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  DONE: 'bg-green-50 text-green-700 border-green-200',
  NOT_FOUND: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function TaskPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  useEffect(() => {
    api.getMyTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  async function handleSos() {
    if (!window.confirm('ยืนยันส่ง SOS? CM จะได้รับแจ้งทันที')) return;
    setSosLoading(true);
    let coords: { lat?: number; lng?: number } = {};
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      // location denied — proceed without coordinates
    }
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

  if (sosSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-gray-700 text-lg">ส่ง SOS แล้ว</p>
          <p className="text-sm text-gray-400 mt-1">รอ CM ติดต่อกลับ</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ paddingBottom: 56 }}>
        <div className="max-w-lg mx-auto p-4 space-y-3 mt-4">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}
        </div>

        {/* Fixed SOS bottom bar */}
        <div
          onClick={handleSos}
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
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 56 }}>
      <div className="max-w-lg mx-auto p-4">
        <div className="mb-5">
          <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">งานของฉัน</h1>
          <p className="text-sm text-gray-400 mt-0.5">{tasks.length} งาน</p>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm">ไม่มีงานในขณะนี้</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{task.event?.title ?? 'งาน'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">ผู้ป่วย HN: {task.patient?.hn}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[task.status] ?? ''}`}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  {task.status !== 'DONE' && task.status !== 'NOT_FOUND' && task.status === 'PENDING' && (
                    <Link
                      to={`/checkin/${task.id}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 border border-purple-300 text-purple-600 rounded-lg"
                    >
                      Check-in
                    </Link>
                  )}
                  {task.status !== 'DONE' && task.status !== 'NOT_FOUND' && task.formTemplate && (
                    <Link
                      to={`/form/${task.id}/${task.formTemplate.id ?? 'default'}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 bg-purple-600 text-white rounded-lg"
                    >
                      กรอกแบบฟอร์ม
                    </Link>
                  )}
                  {task.status !== 'DONE' && task.status !== 'NOT_FOUND' && (
                    <Link
                      to={`/note/${task.id}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 border border-gray-300 text-gray-600 rounded-lg"
                    >
                      บันทึก
                    </Link>
                  )}
                  {task.patient?.id && (
                    <Link
                      to={`/care-plan/${task.patient.id}`}
                      className="flex-1 text-center text-xs font-semibold py-2 px-3 border border-blue-200 text-blue-600 rounded-lg"
                    >
                      📋 แผนดูแล
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed SOS bottom bar */}
      <div
        onClick={handleSos}
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
    </div>
  );
}
