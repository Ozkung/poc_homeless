import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function NotePage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!taskId || !note.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.addNote(taskId, note.trim());
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">📝</p>
          <p className="font-semibold text-gray-700 text-lg">บันทึกสำเร็จ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 mt-4">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
        ← กลับ
      </button>
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">บันทึกภาคสนาม</h1>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="บันทึกสิ่งที่พบ..."
        rows={6}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-none"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mt-3">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !note.trim()}
        className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
