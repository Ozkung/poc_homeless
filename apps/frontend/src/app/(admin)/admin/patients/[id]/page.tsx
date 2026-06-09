export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import PatientDetailPage from '@/components/patients/PatientDetailPage';

export default async function AdminPatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  return (
    <PatientDetailPage
      id={id}
      token={session?.accessToken ?? ''}
      backHref="/admin/dashboard"
      backLabel="← Dashboard"
    />
  );
}
