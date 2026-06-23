import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { FieldRenderer } from '../components/FieldRenderer';

const ACCENT = '#6366F1';

export default function SessionPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [task, setTask] = useState<any>(location.state?.task ?? null);
  const [loading, setLoading] = useState(!location.state?.task);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [doneLoading, setDoneLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (task) return;
    api.getMyTasks().then((all: any[]) => {
      const found = all.find((t: any) => t.id === taskId);
      if (found) setTask(found);
    }).finally(() => setLoading(false));
  }, [taskId]);

  function showToast(msg: string) {
    setToast(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToast(''), 300);
    }, 2000);
  }

  function handleFieldChange(fieldId: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task?.liffToken) { alert('ไม่พบ LIFF token กรุณาเปิดแอปใหม่'); return; }
    setFormSubmitting(true);
    try {
      const fields: any[] = task.formTemplate?.fields ?? [];
      const answerArr = fields
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .map((f: any) => ({ fieldId: f.id, value: answers[f.id] ?? null }));
      await api.submit(taskId!, task.liffToken, answerArr);
      setFormSubmitted(true);
      showToast('บันทึกเรียบร้อยแล้ว');
    } catch (err: any) {
      const msg = err.message ?? '';
      if (msg.toLowerCase().includes('token')) {
        alert('แบบฟอร์มนี้ถูกส่งไปแล้ว หรือ token หมดอายุ');
        setFormSubmitted(true);
      } else {
        alert(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleNoteSubmit() {
    if (!note.trim()) return;
    setNoteSubmitting(true);
    try {
      await api.addNote(taskId!, note.trim());
      setNote('');
      showToast('บันทึกเรียบร้อยแล้ว');
    } catch (err: any) {
      alert(err.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function handleDone() {
    setDoneLoading(true);
    try {
      await api.updateStatus(taskId!, 'DONE');
      navigate('/', { replace: true });
    } catch (err: any) {
      alert(err.message ?? 'เกิดข้อผิดพลาด');
      setDoneLoading(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#94A3B8', fontSize: 13 }}>กำลังโหลด...</p>
    </div>
  );

  if (!task) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 36 }}>⚠️</p>
      <p style={{ color: '#64748B', fontSize: 13 }}>ไม่พบข้อมูล</p>
      <button onClick={() => navigate('/')}
        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        กลับหน้าหลัก
      </button>
    </div>
  );

  const formTemplate = task.formTemplate;
  const fields: any[] = formTemplate?.fields
    ? [...formTemplate.fields].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    : [];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 32 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#0F172A', color: '#fff', borderRadius: 10, padding: '10px 20px',
          fontSize: 13, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap',
          opacity: toastVisible ? 1 : 0, transition: 'opacity 0.3s',
        }}>
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 16px' }}>
        <button onClick={() => navigate(`/patient/${taskId}`, { state: { task } })}
          style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← กลับ
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>{task.patient?.name ?? '—'}</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
          HN {task.patient?.hn ?? '—'} · กำลังตรวจสุขภาพ
        </div>
      </div>

      <div style={{ padding: 12, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Form section */}
        {formTemplate ? (
          formSubmitted ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A' }}>ส่งแบบฟอร์มแล้ว</div>
              <div style={{ fontSize: 12, color: '#4ADE80', marginTop: 2 }}>{formTemplate.title}</div>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📋 {formTemplate.title}
                </div>
              </div>
              <form onSubmit={handleFormSubmit} style={{ padding: '14px 16px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fields.map((field: any) => (
                    <div key={field.id}>
                      <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                        {field.label ?? field.id}
                        {field.required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
                      </label>
                      <FieldRenderer field={field} value={answers[field.id]} onChange={handleFieldChange} />
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={formSubmitting}
                  style={{ width: '100%', marginTop: 16, padding: 13, borderRadius: 12, border: 'none', background: formSubmitting ? '#A5B4FC' : ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, cursor: formSubmitting ? 'not-allowed' : 'pointer' }}>
                  {formSubmitting ? 'กำลังส่ง...' : 'ส่งแบบฟอร์ม'}
                </button>
              </form>
            </div>
          )
        ) : (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
            ไม่มีแบบฟอร์มสำหรับผู้ป่วยรายนี้
          </div>
        )}

        {/* Note section */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
              📝 บันทึกเพิ่มเติม
            </div>
          </div>
          <div style={{ padding: '12px 16px 14px' }}>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="บันทึกสิ่งที่พบ ข้อสังเกต หรือข้อมูลเพิ่มเติม..."
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', background: '#F8FAFC', fontFamily: 'inherit', color: '#0F172A', outline: 'none' }}
            />
            <button onClick={handleNoteSubmit} disabled={!note.trim() || noteSubmitting}
              style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 10, border: 'none', background: note.trim() && !noteSubmitting ? '#0F172A' : '#E2E8F0', color: note.trim() && !noteSubmitting ? '#fff' : '#94A3B8', fontSize: 13, fontWeight: 700, cursor: note.trim() && !noteSubmitting ? 'pointer' : 'not-allowed' }}>
              {noteSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>

        {/* Done button */}
        <button onClick={handleDone} disabled={doneLoading}
          style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: doneLoading ? '#A7F3D0' : '#10B981', color: '#fff', fontSize: 14, fontWeight: 700, cursor: doneLoading ? 'not-allowed' : 'pointer' }}>
          {doneLoading ? 'กำลังบันทึก...' : '✓ เสร็จสิ้นการตรวจ'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: -2 }}>ผู้ป่วยจะหายออกจากรายการงาน</p>
      </div>
    </div>
  );
}
