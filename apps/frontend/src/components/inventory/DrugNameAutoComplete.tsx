'use client';
import { AutoComplete, Tag } from 'antd';
import type { AutoCompleteProps } from 'antd';

export interface DrugOption {
  id: string;
  name: string;
  unit?: string;
  currentStock?: number;
}

type Props = Omit<AutoCompleteProps, 'options' | 'filterOption' | 'children'> & {
  drugs: DrugOption[];
};

export default function DrugNameAutoComplete({ drugs, placeholder = 'พิมพ์เพื่อค้นหาชื่อยา...', ...rest }: Props) {
  return (
    <AutoComplete
      placeholder={placeholder}
      filterOption={(input, opt) => (opt?.value ?? '').toString().toLowerCase().includes(input.toLowerCase())}
      options={drugs.map((d) => ({
        value: d.name,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0 }}>{d.name}</span>
            {typeof d.currentStock === 'number' && (
              <Tag color={d.currentStock > 0 ? 'green' : 'red'} style={{ fontSize: 10, margin: 0, flexShrink: 0 }}>
                คงเหลือ {d.currentStock} {d.unit ?? ''}
              </Tag>
            )}
          </div>
        ),
      }))}
      {...rest}
    />
  );
}
