'use client';
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { message } from 'antd';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function NotificationToast() {
  const { data: session } = useSession();
  const retryDelay = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;

    function connect() {
      const es = new EventSource(`${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.onopen = () => { retryDelay.current = 1000; };

      es.onmessage = (e) => {
        try {
          if (e.data === ':ping') return;
          const data = JSON.parse(e.data);
          if (data.type === 'guest_joined') {
            message.info(`🎉 ${data.name} (${data.role}) เข้าร่วมระบบแล้ว`, 5);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        timerRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
          connect();
        }, retryDelay.current);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [(session as any)?.accessToken]);

  return null;
}
