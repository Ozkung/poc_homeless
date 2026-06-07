'use client';
import { ConfigProvider } from 'antd';
import thTH from 'antd/locale/th_TH';
import type { ReactNode } from 'react';

export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 10,
          fontFamily: "'Sarabun', system-ui, sans-serif",
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f0f2f5',
        },
        components: {
          Card: { borderRadiusLG: 14 },
          Table: { borderRadiusLG: 14 },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
