export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import PatientDetailPage from '@/components/patients/PatientDetailPage';
import CarePlanTab from './care-plan-tab';

export default async function CMPatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  return (
    <PatientDetailPage
      id={id}
      token={session?.accessToken ?? ''}
      backHref="/cm/patients"
      backLabel="← ผู้ป่วย"
      showCarePlan
      CarePlanTabComponent={CarePlanTab}
      showStatusUpdate
    />
  );
}
