import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import TaskPage from './pages/TaskPage';
import CheckinPage from './pages/CheckinPage';
import FormPage from './pages/FormPage';
import NotePage from './pages/NotePage';
import CarePlanPage from './pages/CarePlanPage';

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('No ID token');
        const { accessToken } = await api.verifyLiff(idToken);
        setToken(accessToken);
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TaskPage />} />
        <Route path="/checkin/:taskId" element={<CheckinPage />} />
        <Route path="/form/:taskId/:formId" element={<FormPage />} />
        <Route path="/note/:taskId" element={<NotePage />} />
        <Route path="/care-plan/:patientId" element={<CarePlanPage />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
