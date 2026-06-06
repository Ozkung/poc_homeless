export type PatientStatus = 'critical' | 'pending' | 'stable';
export type Gender = 'male' | 'female' | 'other';

export interface PatientSummary {
  id: string;
  name: string;
  hn: string;
  age?: number;
  gender?: Gender;
  status: PatientStatus;
  conditions: string[];
  locationText?: string;
}
