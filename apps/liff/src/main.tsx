import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import TaskPage from './pages/TaskPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import AddPatientPage from './pages/AddPatientPage';
import PatientDetailPage from './pages/PatientDetailPage';
import SessionPage from './pages/SessionPage';

function AppRoutes() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const token = liff.getIDToken();
        if (!token) return; // liff.login() redirect in progress — stay on loading screen
        try {
          const { accessToken } = await api.verifyLiff(token);
          setToken(accessToken);
          // Already linked — if user opened the register page, bounce to profile
          if (location.pathname === '/register') {
            navigate('/profile', { replace: true });
          }
          setReady(true);
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            // Not linked — send to registration
            navigate('/register', { replace: true });
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
      <Route path="/"                element={<TaskPage />} />
      <Route path="/register"        element={<RegisterPage />} />
      <Route path="/auth"            element={<AuthPage />} />
      <Route path="/profile"         element={<ProfilePage />} />
      <Route path="/add-patient"     element={<AddPatientPage />} />
      <Route path="/patient/:taskId" element={<PatientDetailPage />} />
      <Route path="/session/:taskId" element={<SessionPage />} />
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
