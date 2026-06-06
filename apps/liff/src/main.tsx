import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import liff from '@line/liff';
import { initLiff, getUrlParams } from './lib/liff';
import { api, setToken } from './lib/api';
import TaskPage from './pages/TaskPage';

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');
  const [token, setLiffToken] = useState('');

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('No ID token');
        const { accessToken } = await api.verifyLiff(idToken);
        setToken(accessToken);

        const params = getUrlParams();
        const tid = params.get('taskId') ?? '';
        const tok = params.get('token') ?? '';
        setTaskId(tid);
        setLiffToken(tok);
        setReady(true);
      } catch (e: any) {
        setError(e.message ?? 'เกิดข้อผิดพลาด');
      }
    }
    init();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-semibold text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm font-mono">กำลังโหลด...</p>
      </div>
    );
  }

  return <TaskPage taskId={taskId} token={token} />;
}

createRoot(document.getElementById('root')!).render(<App />);
