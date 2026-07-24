'use client';
import { useState } from 'react';
import { Button, Card, Form, Input, Radio, Result, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import EntityColumnPicker from '@/components/api-access/EntityColumnPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE = 10 * 1024 * 1024;

export default function ApiAccessRequestPage() {
  const [form] = Form.useForm();
  const [scope, setScope] = useState<Record<string, string[]>>({});
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(values: any) {
    if (Object.keys(scope).length === 0) {
      message.error('กรุณาเลือกข้อมูลที่ต้องการเข้าถึงอย่างน้อย 1 รายการ');
      return;
    }
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.error('กรุณาแนบไฟล์ยื่นความประสงค์');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('requesterName', values.requesterName);
      if (values.requesterOrg) formData.append('requesterOrg', values.requesterOrg);
      formData.append('email', values.email);
      formData.append('phone', values.phone);
      formData.append('requestedLevel', values.requestedLevel);
      formData.append('requestedScope', JSON.stringify(scope));
      formData.append('justificationFile', file as File);

      const res = await fetch(`${API_URL}/api-access-requests`, { method: 'POST', body: formData });
      if (res.ok) {
        setSubmitted(true);
      } else {
        message.error('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch {
      message.error('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: 16 }}>
        <Result
          status="success"
          title="ส่งคำขอเรียบร้อยแล้ว"
          subTitle="เราจะแจ้งผลการพิจารณาไปทางอีเมลที่ท่านระบุ"
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: 16 }}>
      <Card title="ขอใช้งาน Open API">
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="requesterName" label="ชื่อผู้ขอ" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="requesterOrg" label="หน่วยงาน (ถ้ามี)">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="อีเมล" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="เบอร์โทร" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="ไฟล์ยื่นความประสงค์ (PDF, DOC, DOCX)"
            required
          >
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                if (!ALLOWED_MIME.includes(file.type)) {
                  message.error('รองรับเฉพาะไฟล์ PDF, DOC, DOCX');
                  return Upload.LIST_IGNORE;
                }
                if (file.size > MAX_SIZE) {
                  message.error('ไฟล์ต้องมีขนาดไม่เกิน 10MB');
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>เลือกไฟล์</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="requestedLevel" label="ระดับการใช้งาน" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: 'View (ดูข้อมูลอย่างเดียว)', value: 'VIEW' },
                { label: 'Create + Update (เพิ่ม/แก้ไขข้อมูล)', value: 'CREATE_UPDATE' },
              ]}
            />
          </Form.Item>
          <Form.Item label="ข้อมูลที่ต้องการเข้าถึง" required>
            <EntityColumnPicker value={scope} onChange={setScope} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            ส่งคำขอ
          </Button>
        </Form>
      </Card>
    </div>
  );
}
