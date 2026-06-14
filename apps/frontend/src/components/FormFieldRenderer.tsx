'use client';
import { Checkbox, Input, InputNumber, Radio, Select, Slider } from 'antd';
import type { FormField } from '@homemed/shared-types';

interface Props {
  field: FormField;
  value: unknown;
  onChange: (fieldId: string, value: unknown) => void;
}

export function FormFieldRenderer({ field, value, onChange }: Props) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          value={(value as number) ?? undefined}
          onChange={(v) => onChange(field.id, v)}
        />
      );

    case 'textarea':
      return (
        <Input.TextArea
          rows={3}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    case 'select':
      return (
        <Select
          style={{ width: '100%' }}
          placeholder="เลือก..."
          value={(value as string) || undefined}
          onChange={(v) => onChange(field.id, v)}
          options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
        />
      );

    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="เลือก..."
          value={selected}
          onChange={(v) => onChange(field.id, v)}
          options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
        />
      );
    }

    case 'radio':
      return (
        <Radio.Group
          value={value as string}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(field.options ?? []).map((opt) => (
              <Radio key={opt} value={opt}>{opt}</Radio>
            ))}
          </div>
        </Radio.Group>
      );

    case 'checkbox': {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Checkbox.Group
          value={checked}
          onChange={(v) => onChange(field.id, v)}
          options={(field.options ?? []).map((opt) => ({ label: opt, value: opt }))}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        />
      );
    }

    case 'scale': {
      const min = field.min ?? 0;
      const max = field.max ?? 10;
      return (
        <div>
          <Slider
            min={min} max={max}
            value={(value as number) ?? min}
            onChange={(v) => onChange(field.id, v)}
            marks={{ [min]: String(min), [max]: String(max) }}
          />
        </div>
      );
    }

    case 'date':
      return (
        <Input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );

    default:
      return <span style={{ fontSize: 12, color: '#aaa' }}>ไม่รองรับ field type: {(field as any).type}</span>;
  }
}
