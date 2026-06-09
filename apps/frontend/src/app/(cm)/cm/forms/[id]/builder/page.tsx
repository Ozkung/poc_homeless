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
import { Button, Card, Checkbox, Input, InputNumber, Spin, Tag, Typography, message } from 'antd';
import { HolderOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons';
import {
  Type, Hash, ChevronDown, Circle, BarChart2, Calendar, AlignLeft, ClipboardList,
} from 'lucide-react';
import type { FormField, FieldType } from '@homemed/shared-types';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const HAS_OPTIONS: FieldType[] = ['radio', 'select', 'multiselect', 'checkbox'];

const FIELD_TYPES: { type: FieldType; label: string; icon: React.ReactNode }[] = [
  { type: 'text',     label: 'ข้อความ',    icon: <Type size={14} /> },
  { type: 'number',   label: 'ตัวเลข',     icon: <Hash size={14} /> },
  { type: 'select',   label: 'ตัวเลือก',   icon: <ChevronDown size={14} /> },
  { type: 'radio',    label: 'Radio',       icon: <Circle size={14} /> },
  { type: 'scale',    label: 'สเกล',       icon: <BarChart2 size={14} /> },
  { type: 'date',     label: 'วันที่',     icon: <Calendar size={14} /> },
  { type: 'textarea', label: 'ข้อความยาว', icon: <AlignLeft size={14} /> },
];

function SortableField({ field, onUpdate, onRemove, onDuplicate }: {
  field: FormField;
  onUpdate: (f: FormField) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [optInput, setOptInput] = useState('');
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });

  function addOption() {
    const val = optInput.trim();
    if (!val) return;
    onUpdate({ ...field, options: [...(field.options ?? []), val] });
    setOptInput('');
  }

  function removeOption(opt: string) {
    onUpdate({ ...field, options: (field.options ?? []).filter((o) => o !== opt) });
  }

  return (
    <Card
      ref={setNodeRef as any}
      style={{ transform: CSS.Transform.toString(transform), transition, marginBottom: 0 }}
      styles={{ body: { padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 } }}
      size="small"
    >
      <button
        {...attributes}
        {...listeners}
        style={{ color: '#ccc', cursor: 'grab', background: 'none', border: 'none', padding: '2px 0', marginTop: 2, flexShrink: 0 }}
      >
        <HolderOutlined />
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input
          value={field.label}
          onChange={(e) => onUpdate({ ...field, label: e.target.value })}
          placeholder="Label ของฟิลด์"
          size="small"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tag style={{ margin: 0, fontSize: 10 }}>{field.type}</Tag>
          <Checkbox
            checked={field.required}
            onChange={(e) => onUpdate({ ...field, required: e.target.checked })}
            style={{ fontSize: 12 }}
          >
            จำเป็น
          </Checkbox>
        </div>

        {/* Options editor — radio / select / checkbox */}
        {HAS_OPTIONS.includes(field.type) && (
          <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              ตัวเลือก {field.options?.length ? `(${field.options.length})` : ''}
            </div>
            {(field.options ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(field.options ?? []).map((opt) => (
                  <Tag
                    key={opt}
                    closable
                    onClose={() => removeOption(opt)}
                    style={{ fontSize: 12, margin: 0 }}
                  >
                    {opt}
                  </Tag>
                ))}
              </div>
            )}
            <Input.Search
              value={optInput}
              size="small"
              placeholder="พิมพ์ตัวเลือก แล้วกด Enter หรือ +"
              enterButton="+"
              onChange={(e) => setOptInput(e.target.value)}
              onSearch={addOption}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
            />
          </div>
        )}

        {/* Scale min / max */}
        {field.type === 'scale' && (
          <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 8, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>ค่าต่ำสุด</div>
              <InputNumber
                size="small"
                value={field.min ?? 0}
                onChange={(v) => onUpdate({ ...field, min: v ?? 0 })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>ค่าสูงสุด</div>
              <InputNumber
                size="small"
                value={field.max ?? 10}
                onChange={(v) => onUpdate({ ...field, max: v ?? 10 })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onDuplicate(field.id)}
          title="Duplicate"
          style={{ color: '#ccc', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', transition: 'color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1677ff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}
        >
          <CopyOutlined />
        </button>
        <button
          onClick={() => onRemove(field.id)}
          style={{ color: '#ccc', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', transition: 'color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}
        >
          <CloseOutlined />
        </button>
      </div>
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

  const duplicateField = useCallback((fieldId: string) => {
    setFields((prev) => {
      const source = prev.find((f) => f.id === fieldId);
      if (!source) return prev;
      const copy: FormField = { ...source, id: Math.random().toString(36).slice(2), order: prev.length };
      return [...prev, copy];
    });
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
    if (!title.trim()) {
      message.warning('กรุณาใส่ชื่อแบบฟอร์ม');
      return;
    }
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
      if (res.ok) {
        router.push('/cm/forms');
      } else {
        message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Form Builder
        </div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
          แก้ไขแบบฟอร์ม
        </Title>
      </div>

      {loadingForm ? (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <Spin size="large" />
          <Text type="secondary" style={{ display: 'block', marginTop: 16, fontFamily: "'Sarabun',sans-serif", fontSize: 12 }}>
            กำลังโหลดแบบฟอร์ม...
          </Text>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Left: Field palette */}
          <div style={{ width: 208, flexShrink: 0 }}>
            <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
              ประเภทฟิลด์
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FIELD_TYPES.map((ft) => (
                <Button
                  key={ft.type}
                  block
                  icon={ft.icon}
                  onClick={() => addField(ft.type)}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {ft.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Right: Canvas */}
          <div style={{ flex: 1 }}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ชื่อแบบฟอร์ม..."
              size="large"
              style={{ marginBottom: 16, fontWeight: 600, fontSize: 16 }}
            />

            {fields.length === 0 ? (
              <div style={{
                border: '2px dashed #f0f0f0', borderRadius: 12, padding: 48,
                textAlign: 'center', color: '#bbb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><ClipboardList size={32} strokeWidth={1.5} /></div>
                <p style={{ fontSize: 13 }}>คลิกประเภทฟิลด์ทางซ้ายเพื่อเพิ่ม</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fields.map((field) => (
                      <SortableField key={field.id} field={field} onUpdate={updateField} onRemove={removeField} onDuplicate={duplicateField} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button onClick={() => router.push('/cm/forms')}>ยกเลิก</Button>
              <Button type="primary" onClick={handleSave} loading={saving}>
                บันทึกแบบฟอร์ม
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
