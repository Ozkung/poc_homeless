'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import { Alert, Spin } from 'antd';

const PROFILE_ROLE_PREFIX: Record<string, string> = {
  CASE_MANAGER:      'cm',
  CARE_GIVER:        'fw',
  MEDICAL_VOLUNTEER: 'medvol',
  GUEST:             'guest',
};

// Only roles the backend actually allows to file expense claims.
const EXPENSE_CLAIMS_ROLE_PREFIX: Record<string, string> = {
  CASE_MANAGER: 'cm',
  CARE_GIVER:   'fw',
};

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
    const target = searchParams.get('target') === 'expense-claims' ? 'expense-claims' : 'profile';

    signIn('credentials', { liffHandoffCode: code, redirect: false }).then(async (result) => {
      if (result?.ok) {
        const session = await getSession();
        const role = (session as any)?.role;

        if (target === 'expense-claims') {
          const prefix = EXPENSE_CLAIMS_ROLE_PREFIX[role];
          if (!prefix) {
            setError('บัญชีนี้ยังไม่มีสิทธิ์เบิกค่าใช้จ่าย กรุณาเชื่อมต่อบัญชีเจ้าหน้าที่ก่อนในหน้าโปรไฟล์');
            return;
          }
          router.replace(`/${prefix}/expense-claims?liff=1`);
          return;
        }

        const prefix = PROFILE_ROLE_PREFIX[role];
        router.replace(prefix ? `/${prefix}/profile?liff=1` : '/');
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
