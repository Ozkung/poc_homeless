'use client';
import { Select, Tag, Tooltip } from 'antd';
import type { SelectProps } from 'antd';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/patientStatus';

export interface PatientOption {
  id: string;
  name: string;
  hn: string;
  status: string;
}

type Props = Omit<SelectProps, 'options' | 'filterOption' | 'optionRender' | 'mode'> & {
  patients: PatientOption[];
};

export default function PatientSelect({ patients, placeholder = 'พิมพ์ชื่อหรือ HN เพื่อค้นหา...', ...rest }: Props) {
  return (
    <Select
      mode="multiple"
      showSearch
      maxTagCount={3}
      maxTagPlaceholder={(omitted) => (
        <Tooltip title={omitted.map((o) => String(o.label ?? o.value)).join(', ')}>
          <span>+{omitted.length} คน</span>
        </Tooltip>
      )}
      placeholder={placeholder}
      filterOption={(input, opt) => {
        const p = patients.find((px) => px.id === opt?.value);
        if (!p) return false;
        const q = input.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.hn.toLowerCase().includes(q);
      }}
      optionRender={(opt) => {
        const p = patients.find((px) => px.id === opt.value);
        if (!p) return <span>{String(opt.label ?? opt.value)}</span>;
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0 }}>{p.name}</span>
            <Tag color={STATUS_COLOR[p.status] ?? 'default'} style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
              {STATUS_LABEL[p.status] ?? p.status}
            </Tag>
          </div>
        );
      }}
      options={patients.map((p) => ({ value: p.id, label: p.name }))}
      {...rest}
    />
  );
}
