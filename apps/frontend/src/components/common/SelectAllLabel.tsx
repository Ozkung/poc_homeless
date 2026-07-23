'use client';
import { Button } from 'antd';

export default function SelectAllLabel({ text, onSelectAll }: { text: string; onSelectAll: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <span>{text}</span>
      <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 11 }} onClick={onSelectAll}>
        เลือกทั้งหมด
      </Button>
    </div>
  );
}
