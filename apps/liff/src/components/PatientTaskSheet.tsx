import { useEffect, useState } from 'react';
import { api, TodayTask } from '../lib/api';

const ACCENT = '#6366F1';

const STATUS_COLOR: Record<string, string> = {
  CRITICAL: '#EF4444', PENDING: '#F59E0B', STABLE: '#22C55E', MISSING: '#94A3B8',
};
const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'L1 วิกฤติ', PENDING: 'L2 เร่งด่วน', STABLE: 'L3 ปกติ', MISSING: 'L4 ไม่พบ',
};

interface Props {
  task: TodayTask;
  onClose: () => void;
  onStatusChange: (taskId: string, status: string) => void;
}

export default function PatientTaskSheet({ task, onClose, onStatusChange }: Props) {
  const [tab, setTab] = useState<'form' | 'note'>('form');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkinState, setCheckinState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [note, setNote] = useState('');
  const [noteState, setNoteState] = useState<'idle' | 'loading'>('idle');
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const fields = task.formTemplate?.fields ?? [];
  const requiredIds = fields.filter((f) => f.required).map((f) => f.id);
  const formValid = requiredIds.every((id) => (answers[id] ?? '').toString().trim() !== '');

  async function handleCheckin() {
    if (checkinState !== 'idle') return;
    setCheckinState('loading'); setError('');
    try {
      await api.guestCheckin(task.taskId);
      setCheckinState('done');
      onStatusChange(task.taskId, 'IN_PROGRESS');
    } catch (e: any) {
      setError(e.message ?? 'Check-in ล้มเหลว');
      setCheckinState('idle');
    }
  }

  async function handleSubmitForm() {
    if (submitState !== 'idle' || !formValid) return;
    setSubmitState('loading'); setError('');
    try {
      const ans = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
      await api.guestSubmitForm(task.taskId, ans);
      setSubmitState('done');
      onStatusChange(task.taskId, 'DONE');
    } catch (e: any) {
      setError(e.message ?? 'ส่งแบบสำรวจไม่สำเร็จ');
      setSubmitState('idle');
    }
  }

  async function handleNote() {
    if (!note.trim() || noteState === 'loading') return;
    setNoteState('loading'); setError('');
    try {
      await api.guestAddNote(task.taskId, note.trim());
      setNotes((prev) => [note.trim(), ...prev]);
      setNote('');
      setNoteState('idle');
    } catch (e: any) {
      setError(e.message ?? 'บันทึก Note ไม่สำเร็จ');
      setNoteState('idle');
    }
  }

  function renderField(f: typeof fields[0]) {
    const val = answers[f.id] ?? '';
    const set = (v: string) => setAnswers((a) => ({ ...a, [f.id]: v }));
    const base: React.CSSProperties = {
      width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0',
      borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
      background: '#F8FAFC', color: '#0F172A', marginTop: 4, outline: 'none',
    };
    if (f.type === 'textarea')
      return <textarea key={f.id} style={{ ...base, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
        value={val} onChange={(e) => set(e.target.value)} />;
    if (f.type === 'radio' && f.options)
      return (
        <div key={f.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {f.options.map((o) => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" checked={val === o} onChange={() => set(o)} /> {o}
            </label>
          ))}
        </div>
      );
    if (f.type === 'select' && f.options)
      return (
        <select key={f.id} style={{ ...base, appearance: 'none' } as React.CSSProperties}
          value={val} onChange={(e) => set(e.target.value)}>
          <option value="">— เลือก —</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    if (f.type === 'scale')
      return (
        <div key={f.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {Array.from({ length: (f.max ?? 5) - (f.min ?? 1) + 1 }, (_, i) => String((f.min ?? 1) + i)).map((n) => (
            <button key={n} onClick={() => set(n)}
              style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: val === n ? ACCENT : '#F8FAFC', color: val === n ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              {n}
            </button>
          ))}
        </div>
      );
    return <input key={f.id} type={f.type === 'number' ? 'number' : 'text'} style={base}
      value={val} onChange={(e) => set(e.target.value)} />;
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>{task.patient.name}</p>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{task.patient.hn}</p>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: (STATUS_COLOR[task.patient.status] ?? '#94A3B8') + '20',
              color: STATUS_COLOR[task.patient.status] ?? '#94A3B8',
            }}>
              {STATUS_LABEL[task.patient.status] ?? task.patient.status}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
          {(['form', 'note'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                color: tab === t ? ACCENT : '#94A3B8',
                borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent',
              }}>
              {t === 'form' ? 'แบบสำรวจ' : 'Note'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {error && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}

          {tab === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fields.length === 0
                ? <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>ไม่มีแบบสำรวจสำหรับ task นี้</p>
                : [...fields]
                    .sort((a, b) => a.order - b.order)
                    .map((f) => (
                      <div key={f.id}>
                        <label style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                          {f.label}{f.required ? ' *' : ''}
                        </label>
                        {renderField(f)}
                      </div>
                    ))
              }

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={handleCheckin} disabled={checkinState === 'loading'}
                  style={{
                    flex: 1, padding: '11px 0', border: `1px solid ${ACCENT}`, borderRadius: 10,
                    background: checkinState === 'done' ? '#F0FDF4' : '#fff',
                    color: checkinState === 'done' ? '#16A34A' : ACCENT,
                    fontWeight: 700, fontSize: 14, cursor: checkinState === 'loading' ? 'default' : 'pointer',
                  }}>
                  {checkinState === 'loading' ? '...' : checkinState === 'done' ? '✓ Check-in แล้ว' : 'Check-in'}
                </button>
                <button onClick={handleSubmitForm} disabled={!formValid || submitState !== 'idle'}
                  style={{
                    flex: 2, padding: '11px 0', border: 'none', borderRadius: 10,
                    background: submitState === 'done' ? '#F0FDF4' : (formValid && submitState === 'idle') ? ACCENT : '#CBD5E1',
                    color: submitState === 'done' ? '#16A34A' : '#fff',
                    fontWeight: 700, fontSize: 14, cursor: (!formValid || submitState !== 'idle') ? 'default' : 'pointer',
                  }}>
                  {submitState === 'loading' ? 'กำลังส่ง...' : submitState === 'done' ? '✓ ส่งแล้ว' : 'ส่งแบบสำรวจ'}
                </button>
              </div>
            </div>
          )}

          {tab === 'note' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="บันทึกข้อสังเกต สภาพผู้ป่วย หรือข้อมูลเพิ่มเติม..."
                style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
              />
              <button onClick={handleNote} disabled={!note.trim() || noteState === 'loading'}
                style={{
                  padding: '11px', border: 'none', borderRadius: 10,
                  background: note.trim() && noteState === 'idle' ? ACCENT : '#CBD5E1',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: !note.trim() || noteState === 'loading' ? 'default' : 'pointer',
                }}>
                {noteState === 'loading' ? 'กำลังบันทึก...' : 'บันทึก Note'}
              </button>

              {notes.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>บันทึกในวันนี้</p>
                  {notes.map((n, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, marginBottom: 6, fontSize: 13, color: '#374151' }}>
                      {n}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
