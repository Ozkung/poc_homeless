'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from 'antd';
import type { FormField, FieldType } from '@homemed/shared-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'ข้อความ', icon: '📝' },
  { type: 'number', label: 'ตัวเลข', icon: '🔢' },
  { type: 'select', label: 'ตัวเลือก', icon: '📌' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
  { type: 'scale', label: 'สเกล', icon: '📊' },
  { type: 'date', label: 'วันที่', icon: '📅' },
  { type: 'textarea', label: 'ข้อความยาว', icon: '📄' },
];

function SortableField({ field, onUpdate, onRemove }: { field: FormField; onUpdate: (f: FormField) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card ref={setNodeRef as any} style={{ ...style, marginBottom: 0 }} styles={{ body: { padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 } }} size="small">
      <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab mt-1">⠿</button>
      <div className="flex-1 space-y-2">
        <input
          value={field.label} onChange={(e) => onUpdate({ ...field, label: e.target.value })}
          placeholder="Label ของฟิลด์"
          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{field.type}</span>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" checked={field.required} onChange={(e) => onUpdate({ ...field, required: e.target.checked })} />
            จำเป็น
          </label>
        </div>
      </div>
      <button onClick={() => onRemove(field.id)} className="text-gray-300 hover:text-red-400 transition-colors text-sm">✕</button>
    </Card>
  );
}

export default function FormEditPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [loadingForm, setLoadingForm] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!session?.accessToken || !id) return;
    setLoadingForm(true);
    fetch(`${API_URL}/forms/${id}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setTitle(data.title ?? '');
          setFields(data.fields ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingForm(false));
  }, [session?.accessToken, id]);

  const addField = useCallback((type: FieldType) => {
    const fieldId = Math.random().toString(36).slice(2);
    setFields((prev) => [...prev, { id: fieldId, type, label: '', required: false, order: prev.length }]);
  }, []);

  const updateField = useCallback((updated: FormField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
      });
    }
  }

  async function handleSave() {
    if (!title.trim()) return alert('กรุณาใส่ชื่อแบบฟอร์ม');
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/forms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({ title, fields }),
      });
      if (res.ok) router.push('/forms');
      else alert('บันทึกไม่สำเร็จ กรุณาลองใหม่');
    } catch {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Form Builder</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">แก้ไขแบบฟอร์ม</h1>
      </div>

      {loadingForm ? (
        <div className="py-16 text-center">
          <p className="font-mono text-sm text-gray-400 animate-pulse">กำลังโหลดแบบฟอร์ม...</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Left: Field palette */}
          <div className="w-52 shrink-0">
            <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">ประเภทฟิลด์</p>
            <div className="space-y-1.5">
              {FIELD_TYPES.map((ft) => (
                <button
                  key={ft.type}
                  onClick={() => addField(ft.type)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-purple-400 hover:text-purple-600 transition-colors"
                >
                  <span>{ft.icon}</span>
                  <span>{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Canvas */}
          <div className="flex-1">
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="ชื่อแบบฟอร์ม..."
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold mb-4 focus:outline-none focus:border-purple-400"
            />
            {fields.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">คลิกประเภทฟิลด์ทางซ้ายเพื่อเพิ่ม</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {fields.map((field) => (
                      <SortableField key={field.id} field={field} onUpdate={updateField} onRemove={removeField} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => router.push('/forms')}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ยกเลิก
              </button>
              <button
                className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกแบบฟอร์ม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
