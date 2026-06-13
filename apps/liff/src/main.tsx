import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import TaskPage from './pages/TaskPage';
import CheckinPage from './pages/CheckinPage';
import FormPage from './pages/FormPage';
import NotePage from './pages/NotePage';
import CarePlanPage from './pages/CarePlanPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import AddPatientPage from './pages/AddPatientPage';

function AppRoutes() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const token = liff.getIDToken();
        if (!token) return; // liff.login() redirect is in progress — stay on loading screen
        try {
          const { accessToken } = await api.verifyLiff(token);
          setToken(accessToken);
          setReady(true);
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            navigate('/auth');
            setReady(true);
          } else {
            throw e;
          }
        }
      } catch (e: any) {
        setError(e.message ?? 'เกิดข้อผิดพลาด');
      }
    }
    init();
  }, []);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-semibold text-gray-700">{error}</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm font-mono">กำลังโหลด...</p>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<TaskPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/checkin/:taskId" element={<CheckinPage />} />
      <Route path="/form/:taskId/:formId" element={<FormPage />} />
      <Route path="/note/:taskId" element={<NotePage />} />
      <Route path="/care-plan/:patientId" element={<CarePlanPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/add-patient" element={<AddPatientPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename="/liff">
      <AppRoutes />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
