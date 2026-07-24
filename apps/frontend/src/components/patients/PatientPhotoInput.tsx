'use client';
import { useRef, useState } from 'react';
import { Avatar, message } from 'antd';
import { CameraOutlined, UserOutlined } from '@ant-design/icons';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PatientPhotoInputProps {
  photoUrl?: string | null;
  onChange: (file: File | null) => void;
}

export default function PatientPhotoInput({ photoUrl, onChange }: PatientPhotoInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      message.error('รองรับเฉพาะไฟล์ภาพ JPEG, PNG, WebP');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      message.error('ไฟล์ภาพต้องมีขนาดไม่เกิน 5MB');
      e.target.value = '';
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    onChange(file);
  }

  const displaySrc = previewUrl ?? (photoUrl ? `${API_URL}${photoUrl}` : undefined);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
      <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
        <Avatar
          size={80}
          src={displaySrc}
          icon={!displaySrc ? <UserOutlined /> : undefined}
          style={{ background: '#f0f0f0' }}
        />
        <div style={{
          position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, background: '#fff',
          borderRadius: '50%', border: '1px solid #d9d9d9', display: 'flex', alignItems: 'center',
          justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.15)',
        }}>
          <CameraOutlined style={{ fontSize: 13 }} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
