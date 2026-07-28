'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Alert, Spin } from 'antd';

export default function LiffHandoffPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>}>
      <LiffHandoffContent />
    </Suspense>
  );
}

function LiffHandoffContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('ไม่พบรหัสเข้าสู่ระบบ กรุณาเปิดจากลิงก์ใน LINE อีกครั้ง');
      return;
    }
    signIn('credentials', { liffHandoffCode: code, redirect: false }).then((result) => {
      if (result?.ok) {
        router.replace('/guest/profile');
      } else {
        setError('เข้าสู่ระบบไม่สำเร็จ รหัสอาจหมดอายุ กรุณาเปิดจากลิงก์ใน LINE อีกครั้ง');
      }
    });
  }, [searchParams, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {error ? (
        <Alert type="error" showIcon message={error} style={{ maxWidth: 400 }} />
      ) : (
        <Spin size="large" tip="กำลังเข้าสู่ระบบ..." />
      )}
    </div>
  );
}
