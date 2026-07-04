import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import { useProfileStore } from './store/profileStore';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import ReportPage from './pages/ReportPage';


function AppRoutes() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setLineProfile, setSystemProfile, setZones } = useProfileStore();

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const idToken = liff.getIDToken();
        if (!idToken) return; // redirect in progress

        liff.getProfile()
          .then((p) => setLineProfile({ userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl ?? undefined }))
          .catch(() => {});

        try {
          const { accessToken } = await api.verifyLiff(idToken);
          setToken(accessToken);
          navigate('/', { replace: true });
          Promise.all([api.getMe(), api.getPublicZones()])
            .then(([me, zones]) => { setSystemProfile(me); setZones(zones); })
            .catch(() => {});
          setReady(true);
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            const zones = await api.getPublicZones().catch(() => []);
            setZones(zones);
            navigate('/register', { replace: true });
            setReady(true);
          } else if (e.status === 403) {
            setError('ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
        <p style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>{error}</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'monospace' }}>กำลังโหลด...</p>
    </div>
  );

  return (
    <Routes>
      <Route path="/"         element={<HomePage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/profile"  element={<ProfilePage />} />
      <Route path="/report"   element={<ReportPage />} />
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
