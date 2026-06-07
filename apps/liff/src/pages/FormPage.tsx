import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { FieldRenderer } from '../components/FieldRenderer';
import type { FormField } from '@homemed/shared-types';

export default function FormPage() {
  const { taskId } = useParams<{ taskId: string; formId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!taskId) return;
    api.getTask(taskId)
      .then(setTask)
      .finally(() => setLoading(false));
  }, [taskId]);

  function handleChange(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId) return;
    setSubmitting(true);
    setError('');
    try {
      const answerArray = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
      await api.submit(taskId, token, answerArray);
      setSubmitted(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (e: any) {
      setError(e.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-4 space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />)}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-gray-700 text-lg">ส่งแบบฟอร์มสำเร็จ</p>
        </div>
      </div>
    );
  }

  const fields: FormField[] = task?.formTemplate?.fields ?? [];

  return (
    <div className="max-w-lg mx-auto p-4">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">
        ← กลับ
      </button>
      <div className="mb-5">
        <p className="text-xs text-purple-600 font-mono uppercase tracking-wider">HomeMed Connect</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">
          {task?.formTemplate?.title ?? task?.event?.title ?? 'แบบฟอร์ม'}
        </h1>
        {task && <p className="text-sm text-gray-500 mt-1">ผู้ป่วย HN: {task.patient?.hn}</p>}
      </div>

      {!task && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">ไม่พบงานนี้</p>
        </div>
      )}

      {task && fields.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">ไม่มีฟิลด์ในแบบฟอร์ม</div>
      )}

      {task && fields.length > 0 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {fields
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <FieldRenderer
                  field={field}
                  value={answers[field.id]}
                  onChange={handleChange}
                />
              </div>
            ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งแบบฟอร์ม'}
          </button>
        </form>
      )}
    </div>
  );
}
