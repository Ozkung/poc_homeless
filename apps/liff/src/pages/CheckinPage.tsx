import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function CheckinPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleCheckin() {
    if (!taskId) return;
    setLoading(true);
    setError('');
    try {
      await api.checkin(taskId);
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">📍</p>
          <p className="font-semibold text-gray-700 text-lg">Check-in สำเร็จ</p>
          <p className="text-sm text-gray-400 mt-1">กลับสู่รายการงาน...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 mt-8">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← กลับ
      </button>
      <div className="text-center">
        <p className="text-5xl mb-4">📍</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Check-in</h1>
        <p className="text-sm text-gray-500 mb-8">ยืนยันว่าคุณอยู่ที่ไซต์งาน</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckin}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'ยืนยัน Check-in'}
        </button>
      </div>
    </div>
  );
}
