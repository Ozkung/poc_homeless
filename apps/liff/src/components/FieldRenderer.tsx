import type { FormField } from '@homemed/shared-types';

interface Props {
  field: FormField;
  value: unknown;
  onChange: (fieldId: string, value: unknown) => void;
}

export function FieldRenderer({ field, value, onChange }: Props) {
  const base =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white';

  switch (field.type) {
    case 'text':
      return (
        <input type="text" required={field.required} placeholder={field.placeholder}
          value={(value as string) ?? ''} className={base}
          onChange={(e) => onChange(field.id, e.target.value)} />
      );

    case 'number':
      return (
        <input type="number" required={field.required} value={(value as string) ?? ''} className={base}
          onChange={(e) => onChange(field.id, e.target.value)} />
      );

    case 'textarea':
      return (
        <textarea required={field.required} rows={3} value={(value as string) ?? ''} className={base}
          onChange={(e) => onChange(field.id, e.target.value)} />
      );

    case 'select':
    case 'multiselect':
      return (
        <select required={field.required} value={(value as string) ?? ''} className={base}
          onChange={(e) => onChange(field.id, e.target.value)}>
          <option value="">เลือก...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name={field.id} value={opt} checked={value === opt}
                required={field.required} className="accent-purple-600"
                onChange={() => onChange(field.id, opt)} />
              {opt}
            </label>
          ))}
        </div>
      );

    case 'checkbox': {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" value={opt} checked={checked.includes(opt)} className="accent-purple-600"
                onChange={(e) => {
                  const next = e.target.checked ? [...checked, opt] : checked.filter((v) => v !== opt);
                  onChange(field.id, next);
                }} />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    case 'scale': {
      const min = field.min ?? 0;
      const max = field.max ?? 10;
      const current = (value as number) ?? min;
      return (
        <div className="space-y-2">
          <input type="range" min={min} max={max} value={current}
            className="w-full accent-purple-600" onChange={(e) => onChange(field.id, +e.target.value)} />
          <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>{min}</span>
            <span className="text-purple-600 font-semibold text-sm">{current}</span>
            <span>{max}</span>
          </div>
        </div>
      );
    }

    case 'date':
      return (
        <input type="date" required={field.required} value={(value as string) ?? ''} className={base}
          onChange={(e) => onChange(field.id, e.target.value)} />
      );

    default:
      return (
        <p className="text-xs text-gray-400 font-mono">ไม่รองรับ field type: {(field as any).type}</p>
      );
  }
}
