const API_URL = import.meta.env.VITE_API_URL as string;

let accessToken: string | null = null;

export function setToken(token: string) {
  accessToken = token;
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
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? 'Request failed'), { status: res.status });
  }
  return res.json();
}

export const api = {
  verifyLiff: (idToken: string) =>
    request<{ accessToken: string }>('/auth/liff/verify', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  getMyTasks: () => request<any[]>('/tasks/my'),
  getTask: (taskId: string) =>
    request<any[]>('/tasks/my').then((tasks: any[]) =>
      tasks.find((t: any) => t.id === taskId) ?? null,
    ),
  checkin: (taskId: string) =>
    request(`/tasks/${taskId}/checkin`, { method: 'POST' }),
  addNote: (taskId: string, note: string) =>
    request(`/tasks/${taskId}/note`, { method: 'POST', body: JSON.stringify({ note }) }),
  submit: (taskId: string, token: string, answers: any[]) =>
    request('/submissions', { method: 'POST', body: JSON.stringify({ taskId, token, answers }) }),
  updateStatus: (taskId: string, status: string) =>
    request(`/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  sos: (taskId: string, coords: { lat?: number; lng?: number }) =>
    request(`/patients/sos-by-task/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(coords),
    }),
};
