'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button, Card, Checkbox, DatePicker, Input, InputNumber, Radio,
  Select, Slider, Spin, Tag, Typography,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import type { FormField } from '@homemed/shared-types';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function FieldPreview({ field }: { field: FormField }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {field.label || <span style={{ color: '#bbb', fontStyle: 'italic' }}>ไม่มีชื่อฟิลด์</span>}
        {field.required && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
        <Tag style={{ marginLeft: 8, fontSize: 10, fontWeight: 400 }}>{field.type}</Tag>
      </div>

      {field.type === 'text' && <Input placeholder={field.label} disabled />}
      {field.type === 'textarea' && <Input.TextArea placeholder={field.label} rows={3} disabled />}
      {field.type === 'number' && <InputNumber placeholder={field.label} disabled style={{ width: '100%' }} />}
      {field.type === 'date' && <DatePicker disabled style={{ width: '100%' }} />}

      {field.type === 'select' && (
        <Select disabled placeholder="เลือก..." style={{ width: '100%' }}>
          {(field.options ?? []).map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
        </Select>
      )}

      {field.type === 'multiselect' && (
        <Select mode="multiple" disabled placeholder="เลือกได้หลายตัวเลือก" style={{ width: '100%' }}>
          {(field.options ?? []).map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
        </Select>
      )}

      {field.type === 'radio' && (
        <Radio.Group disabled>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(field.options ?? []).map((o) => <Radio key={o} value={o}>{o}</Radio>)}
          </div>
        </Radio.Group>
      )}

      {field.type === 'checkbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(field.options ?? []).map((o) => <Checkbox key={o} disabled>{o}</Checkbox>)}
        </div>
      )}

      {field.type === 'scale' && (
        <div>
          <Slider
            min={field.min ?? 0}
            max={field.max ?? 10}
            disabled
            marks={{ [field.min ?? 0]: field.min ?? 0, [field.max ?? 10]: field.max ?? 10 }}
          />
        </div>
      )}
    </div>
  );
}

export default function FormViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken || !id) return;
    fetch(`${API_URL}/forms/${id}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setTitle(data.title ?? '');
          setFields((data.fields ?? []).sort((a: FormField, b: FormField) => (a.order ?? 0) - (b.order ?? 0)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.accessToken, id]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Form Preview
          </div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
            {title || 'ตัวอย่างแบบฟอร์ม'}
          </Title>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/cm/forms')}>
            กลับ
          </Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => router.push(`/forms/${id}/builder`)}>
            แก้ไข
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <Spin size="large" />
          <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
            กำลังโหลดแบบฟอร์ม...
          </Text>
        </div>
      ) : (
        <div style={{ maxWidth: 640 }}>
          <Card>
            {fields.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>ยังไม่มีฟิลด์ในแบบฟอร์มนี้</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {fields.map((field) => (
                  <FieldPreview key={field.id} field={field} />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
