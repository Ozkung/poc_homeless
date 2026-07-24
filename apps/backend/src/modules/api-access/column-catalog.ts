export const API_ACCESS_CATALOG: Record<string, string[]> = {
  Patient: [
    'name', 'nationalId', 'hn', 'age', 'gender', 'status', 'conditions',
    'phone', 'locationText', 'birthDate', 'followUpTarget', 'photoUrl',
  ],
  Diagnosis: [
    'title', 'description', 'icd10', 'severity', 'chiefComplaint',
    'presentIllness', 'physicalExam', 'treatmentPlan', 'createdAt',
  ],
  Prescription: ['medications', 'notes', 'createdAt'],
  CarePlanItem: ['title', 'frequency', 'priority', 'assigneeName', 'isDone', 'createdAt'],
  Activity: ['type', 'payload', 'createdAt'],
  DoctorSchedule: ['date', 'startTime', 'endTime', 'location', 'notes'],
  CareGiver: ['displayName', 'phone', 'email', 'zoneId', 'specialty', 'isActive'],
};

export function isValidScope(scope: Record<string, string[]>): boolean {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) return false;
  for (const [entity, columns] of Object.entries(scope)) {
    const allowedColumns = API_ACCESS_CATALOG[entity];
    if (!allowedColumns) return false;
    if (!Array.isArray(columns) || columns.length === 0) return false;
    if (!columns.every((c) => allowedColumns.includes(c))) return false;
  }
  return Object.keys(scope).length > 0;
}
