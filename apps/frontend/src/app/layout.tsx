import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import './globals.css';

export const metadata: Metadata = {
  title: 'HomeMed Connect',
  description: 'ระบบดูแลผู้ป่วยไร้บ้านในชุมชน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
