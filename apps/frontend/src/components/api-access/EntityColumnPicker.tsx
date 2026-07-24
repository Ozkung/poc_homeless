'use client';
import { useEffect, useState } from 'react';
import { Checkbox, Spin } from 'antd';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface EntityColumnPickerProps {
  value: Record<string, string[]>;
  onChange: (scope: Record<string, string[]>) => void;
}

const ENTITY_LABEL: Record<string, string> = {
  Patient: 'ผู้ป่วย',
  Diagnosis: 'การวินิจฉัย',
  Prescription: 'ใบสั่งยา',
  CarePlanItem: 'แผนการดูแล',
  Activity: 'กิจกรรม/ไทม์ไลน์',
  DoctorSchedule: 'ตารางแพทย์',
  CareGiver: 'รายชื่อ Care Giver',
};

export default function EntityColumnPicker({ value, onChange }: EntityColumnPickerProps) {
  const [catalog, setCatalog] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api-access-requests/catalog`)
      .then((res) => res.json())
      .then(setCatalog)
      .catch(() => setCatalog({}));
  }, []);

  if (!catalog) return <Spin size="small" />;

  function toggleEntity(entity: string, columns: string[], checked: boolean) {
    const next = { ...value };
    if (checked) {
      next[entity] = columns;
    } else {
      delete next[entity];
    }
    onChange(next);
  }

  function toggleColumn(entity: string, column: string, checked: boolean) {
    const current = value[entity] ?? [];
    const next = { ...value };
    if (checked) {
      next[entity] = [...current, column];
    } else {
      const remaining = current.filter((c) => c !== column);
      if (remaining.length === 0) delete next[entity];
      else next[entity] = remaining;
    }
    onChange(next);
  }

  return (
    <div>
      {Object.entries(catalog).map(([entity, columns]) => {
        const selected = value[entity] ?? [];
        const allChecked = selected.length === columns.length;
        return (
          <div key={entity} style={{ marginBottom: 12 }}>
            <Checkbox
              checked={allChecked}
              indeterminate={selected.length > 0 && !allChecked}
              onChange={(e) => toggleEntity(entity, columns, e.target.checked)}
            >
              <strong>{ENTITY_LABEL[entity] ?? entity}</strong>
            </Checkbox>
            <div style={{ marginLeft: 24, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {columns.map((column) => (
                <Checkbox
                  key={column}
                  checked={selected.includes(column)}
                  onChange={(e) => toggleColumn(entity, column, e.target.checked)}
                >
                  {column}
                </Checkbox>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
