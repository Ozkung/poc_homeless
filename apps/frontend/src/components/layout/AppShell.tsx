'use client';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // I1: reset drawer when resizing back to desktop
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  return (
    <div className={`flex h-screen bg-[#f0f2f5] ${isMobile ? 'flex-col' : ''}`}>
      {/* Mobile header */}
      {isMobile && (
        <header style={{
          height: 56, background: '#fff', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
          flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            aria-label="เปิดเมนู"
          >
            <Menu size={22} color="#111" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, background: '#1677ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 8, color: '#1677ff', letterSpacing: 2, textTransform: 'uppercase', lineHeight: 1 }}>HomeMed</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111', lineHeight: 1 }}>Connect</div>
            </div>
          </div>
        </header>
      )}

      {/* Sidebar — desktop: always visible, mobile: overlay Drawer */}
      <Sidebar
        mobileOpen={isMobile ? sidebarOpen : undefined}
        onMobileClose={isMobile ? () => setSidebarOpen(false) : undefined}
      />

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto ${isMobile ? 'p-4' : 'p-7'}`}>
        {children}
      </main>
    </div>
  );
}
