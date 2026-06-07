import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { FormField } from '@homemed/shared-types';

interface TaskPageProps {
  taskId: string;
  token: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
  NOT_FOUND: 'ไม่พบผู้ป่วย',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  NOT_FOUND: 'bg-red-100 text-red-600',
};

export default function TaskPage({ taskId, token }: TaskPageProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState('');
  const [noteSuccess, setNoteSuccess] = useState(false);

  useEffect(() => {
    api.getMyTasks().then((t) => {
      setTasks(t);
      if (taskId) setCurrentTask(t.find((x: any) => x.id === taskId) ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [taskId]);

  async function handleCheckin() {
    const id = currentTask?.id ?? taskId;
    if (!id) return;
    await api.checkin(id);
    setCurrentTask((prev: any) => prev ? { ...prev, status: 'IN_PROGRESS' } : prev);
  }

  async function handleNote() {
    if (!note.trim()) return;
    const id = currentTask?.id ?? taskId;
    if (!id) return;
    await api.addNote(id, note);
    setNote('');
    setShowNoteInput(false);
    setNoteSuccess(true);
    setTimeout(() => setNoteSuccess(false), 3000);
  }

  async function handleNotFound() {
    const id = currentTask?.id ?? taskId;
    if (!id) return;
    await api.updateStatus(id, 'NOT_FOUND');
    setNotFound(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = currentTask?.id ?? taskId;
    if (!id) return;
    const answerArray = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
    await api.submit(id, token, answerArray);
    setSubmitted(true);
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-6 text-gray-500 font-mono text-sm">กำลังโหลด...</div>;
  }

  // ─── Success screens ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-gray-700 text-lg">บันทึกข้อมูลสำเร็จ</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-semibold text-gray-700 text-lg">บันทึกสถานะ "ไม่พบผู้ป่วย" แล้ว</p>
          <button
            onClick={() => { setNotFound(false); setCurrentTask(null); }}
            className="mt-6 text-sm text-purple-600 underline"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  // ─── Task List ───────────────────────────────────────────────────────────────
  if (!taskId && !currentTask) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="mb-5">
          <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">งานของฉันวันนี้</h1>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">ไม่มีงานในวันนี้</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => setCurrentTask(task)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 shadow-sm active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {task.event?.title ?? 'ไม่ระบุชื่อกิจกรรม'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">HN: {task.patient?.hn}</p>
                    {task.patient?.locationText && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {task.patient.locationText}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Task Detail ─────────────────────────────────────────────────────────────
  const task = currentTask;
  const fields: FormField[] = task?.formTemplate?.fields ?? [];

  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Back button (only in list-navigation mode, not URL-direct mode) */}
      {!taskId && (
        <button
          onClick={() => setCurrentTask(null)}
          className="flex items-center gap-1 text-sm text-purple-600 mb-4"
        >
          ← กลับ
        </button>
      )}

      {/* Header */}
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">{task?.event?.title ?? 'งานที่ได้รับมอบหมาย'}</h1>
        {task && (
          <div className="mt-2 space-y-0.5">
            <p className="text-sm text-gray-500">ผู้ป่วย HN: {task.patient?.hn}</p>
            {task.patient?.locationText && (
              <p className="text-xs text-gray-400">📍 {task.patient.locationText}</p>
            )}
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${STATUS_COLOR[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          </div>
        )}
      </div>

      {!task && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">ไม่พบงานนี้</p>
        </div>
      )}

      {task && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Form fields */}
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

              {field.type === 'select' && (
                <select
                  required={field.required}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                >
                  <option value="">เลือก...</option>
                  {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}

              {field.type === 'radio' && (
                <div className="space-y-2">
                  {field.options?.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name={field.id}
                        value={opt}
                        onChange={() => setAnswers((a) => ({ ...a, [field.id]: opt }))}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {field.type === 'scale' && (
                <div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    defaultValue={3}
                    className="w-full"
                    onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: Number(e.target.value) }))}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                  </div>
                </div>
              )}

              {field.type === 'date' && (
                <input
                  type="date"
                  required={field.required}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {/* Note section */}
          <div className="pt-1">
            {noteSuccess && (
              <p className="text-xs text-green-600 mb-2">✓ บันทึกหมายเหตุแล้ว</p>
            )}
            {showNoteInput ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={note}
                  placeholder="เขียนหมายเหตุ..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleNote}
                    className="flex-1 bg-purple-600 text-white font-semibold py-2.5 rounded-lg text-sm"
                  >
                    บันทึกหมายเหตุ
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNoteInput(false); setNote(''); }}
                    className="px-4 border border-gray-300 text-gray-600 font-semibold py-2.5 rounded-lg text-sm"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNoteInput(true)}
                className="w-full border border-gray-300 text-gray-600 font-semibold py-2.5 rounded-lg text-sm"
              >
                📝 บันทึกหมายเหตุ
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCheckin}
                className="flex-1 border border-purple-300 text-purple-600 font-semibold py-3 rounded-lg text-sm"
              >
                Check-in
              </button>
              {fields.length > 0 && (
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 text-white font-semibold py-3 rounded-lg text-sm"
                >
                  ส่งแบบฟอร์ม
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleNotFound}
              className="w-full border border-red-300 text-red-500 font-semibold py-3 rounded-lg text-sm"
            >
              ไม่พบผู้ป่วย
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
