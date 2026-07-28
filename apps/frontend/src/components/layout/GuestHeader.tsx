'use client';
import { useIsLiffEmbed } from '@/hooks/useIsLiffEmbed';

export default function GuestHeader() {
  const isLiffEmbed = useIsLiffEmbed();
  if (isLiffEmbed) return null;

  return (
    <div style={{ background: '#06c755', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>🏥</span>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Homeless Mobile Clinic — Guest</span>
    </div>
  );
}
