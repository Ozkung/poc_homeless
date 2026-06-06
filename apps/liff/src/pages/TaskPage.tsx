import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { FormField } from '@homemed/shared-types';

interface TaskPageProps {
  taskId: string;
  token: string;
}

export default function TaskPage({ taskId, token }: TaskPageProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyTasks().then((t) => {
      setTasks(t);
      if (taskId) setCurrentTask(t.find((x: any) => x.id === taskId) ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [taskId]);

  async function handleCheckin() {
    await api.checkin(taskId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const answerArray = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
    await api.submit(taskId, token, answerArray);
    setSubmitted(true);
  }

  if (loading) return <div className="p-6 text-gray-500 font-mono text-sm">กำลังโหลด...</div>;
  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-5xl mb-4">✅</p>
        <p className="font-semibold text-gray-700 text-lg">บันทึกข้อมูลสำเร็จ</p>
      </div>
    </div>
  );

  const task = currentTask;
  const fields: FormField[] = task?.formTemplate?.fields ?? [];

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">{task?.event?.title ?? 'งานที่ได้รับมอบหมาย'}</h1>
        {task && <p className="text-sm text-gray-500 mt-1">ผู้ป่วย HN: {task.patient?.hn}</p>}
      </div>

      {!task && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">ไม่พบงานนี้</p>
        </div>
      )}

      {task && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === 'text' && (
                <input
                  type="text"
                  required={field.required}
                  placeholder={field.placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {field.type === 'number' && (
                <input
                  type="number"
                  required={field.required}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {field.type === 'textarea' && (
                <textarea
                  required={field.required}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {(field.type === 'select') && (
                <select
                  required={field.required}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                >
                  <option value="">เลือก...</option>
                  {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCheckin}
              className="flex-1 border border-purple-300 text-purple-600 font-semibold py-3 rounded-lg text-sm"
            >
              Check-in
            </button>
            <button
              type="submit"
              className="flex-1 bg-purple-600 text-white font-semibold py-3 rounded-lg text-sm"
            >
              ส่งแบบฟอร์ม
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
