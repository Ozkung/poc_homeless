'use client';

import { useState } from 'react';
import { Collapse, Select, Empty } from 'antd';

interface FieldDef { id: string; label: string; type: string }
interface Submission {
  id: string; submittedAt: string; answers?: any[];
  formTemplate: { title: string; fields?: FieldDef[] };
  submittedBy: { displayName: string };
}

export default function SubmissionsHistory({ submissions }: { submissions: Submission[] }) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templates = Array.from(
    new Map(submissions.map((s) => [s.formTemplate.title, s.formTemplate.title])).entries(),
  ).map(([value, label]) => ({ value, label }));

  const filtered = selectedTemplate
    ? submissions.filter((s) => s.formTemplate.title === selectedTemplate)
    : submissions;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="กรองตาม Form Template"
          style={{ width: '100%', maxWidth: 320 }}
          options={templates}
          value={selectedTemplate}
          onChange={(v) => setSelectedTemplate(v ?? null)}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty description="ไม่พบการส่งแบบฟอร์ม" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Collapse
          items={filtered.slice(0, 50).map((s) => ({
            key: s.id,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', flexShrink: 0 }}>
                  {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, minWidth: 120 }}>{s.formTemplate.title}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{s.submittedBy.displayName}</span>
              </div>
            ),
            children: (
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.isArray(s.answers) && (s.answers as any[]).map((ans: any, i: number) => {
                  const fieldDef = s.formTemplate.fields?.find((f) => f.id === ans.fieldId);
                  const label = fieldDef?.label ?? ans.fieldId;
                  const raw = ans.value;
                  const display = Array.isArray(raw)
                    ? (raw as string[]).join(', ')
                    : raw === null || raw === undefined || raw === ''
                      ? '—'
                      : String(raw);
                  return (
                    <div key={i}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, padding: '4px 10px', background: '#f5f5f5', borderRadius: 6, display: 'inline-block', color: '#333' }}>
                        {display}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}
