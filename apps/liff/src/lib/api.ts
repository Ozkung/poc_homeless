import { liffLogin } from './liff';

const API_URL = import.meta.env.VITE_API_URL as string;

let accessToken: string | null = null;

export function setToken(token: string) { accessToken = token; }
export function getToken(): string | null { return accessToken; }

export interface FormField {
  id: string;
  type: 'number' | 'text' | 'textarea' | 'radio' | 'select' | 'scale';
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

export interface TodayTask {
  taskId: string;
  eventId: string;
  eventTitle: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_FOUND';
  patient: {
    id: string; hn: string; name: string;
    age?: number; status: string; conditions: string[];
  };
  formTemplate: { id: string; title: string; fields: FormField[] } | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && accessToken) {
      accessToken = null;
      liffLogin();
      return new Promise(() => {});
    }
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? 'Request failed'), { status: res.status });
  }
  return res.json();
}

export interface Zone { id: string; name: string; color: string }

export interface SystemProfile {
  id: string;
  email: string;
  displayName?: string;
  phone?: string | null;
  role: string;
  preferredZoneId?: string | null;
  preferredZone?: Zone | null;
}

export const api = {
  verifyLiff: (idToken: string) =>
    request<{ accessToken: string }>('/auth/liff/verify', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  guestRegister: (data: {
    idToken: string; firstName: string; lastName: string;
    email: string; phone?: string; zoneId?: string;
  }) =>
    request<{ accessToken: string }>('/auth/liff/guest-register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPublicZones: (): Promise<Zone[]> =>
    fetch(`${API_URL}/auth/public/zones`).then((r) => r.ok ? r.json() : []),

  getMe: () => request<SystemProfile>('/auth/me'),

  updateMe: (data: { displayName?: string; phone?: string; preferredZoneId?: string }) =>
    request<SystemProfile>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getDoctorSchedules: () => request<any[]>('/doctor/schedules'),

  guestReportPatient: (data: {
    firstName: string; lastName?: string;
    nationalId?: string; phone?: string;
    gender?: string; birthDate?: string; age?: number;
    status?: string; locationText?: string;
    conditions?: string[]; initialComplaint?: string;
  }) =>
    request<{ id: string; hn: string }>('/patients/guest-report', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTodayTasks: () =>
    request<TodayTask[]>('/events/today/my-tasks'),

  guestCheckin: (taskId: string) =>
    request<{ activityId: string }>(`/tasks/${taskId}/guest-checkin`, { method: 'POST' }),

  guestAddNote: (taskId: string, note: string) =>
    request<{ activityId: string }>(`/tasks/${taskId}/guest-note`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  guestSubmitForm: (taskId: string, answers: Array<{ fieldId: string; value: string }>) =>
    request<{ submissionId: string }>(`/tasks/${taskId}/guest-submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  uploadPatientPhoto: async (patientId: string, file: File): Promise<{ photoUrl: string }> => {
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch(`${API_URL}/patients/${patientId}/photo`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error((err as any).message ?? 'อัพโหลดรูปไม่สำเร็จ'), { status: res.status });
    }
    return res.json();
  },
};
