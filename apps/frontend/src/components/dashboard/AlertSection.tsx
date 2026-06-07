import Link from 'next/link';

interface AlertRow {
  id: string;
  type: 'OVERDUE' | 'MISSING' | 'SOS';
  daysMissed: number | null;
  lat: number | null;
  lng: number | null;
  sentAt: string;
  patient: {
    id: string;
    hn: string;
    nameEnc: string;
    status: string;
    locationText: string | null;
  };
}

interface AlertSectionProps {
  alerts: AlertRow[];
}

const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ', MISSING: 'สูญหาย',
};

export default function AlertSection({ alerts }: AlertSectionProps) {
  if (alerts.length === 0) return null;

  const sosCount = alerts.filter((a) => a.type === 'SOS').length;
  const total = alerts.length;

  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid #f0f0f0',
      marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>แจ้งเตือนที่รอดำเนินการ</span>
          <span style={{
            background: sosCount > 0 ? '#ff4d4f' : '#faad14',
            color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 99,
          }}>{total}</span>
        </div>
      </div>

      {/* Alert rows */}
      {alerts.map((alert) => {
        const isSos = alert.type === 'SOS';
        const isMissing = alert.type === 'MISSING';
        const bg = isSos
          ? '#fff0f0'
          : isMissing
          ? '#fff2f0'
          : alert.patient.status === 'CRITICAL' ? '#fff8f8' : '#fffdf0';
        const color = isSos || isMissing
          ? '#ff4d4f'
          : alert.patient.status === 'CRITICAL' ? '#ff4d4f' : '#d48806';
        const timeStr = new Date(alert.sentAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={alert.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', background: bg,
            borderBottom: '1px solid rgba(0,0,0,0.03)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                HN {alert.patient.hn}
                {alert.patient.locationText && (
                  <span style={{ fontSize: 10, color: '#888', fontWeight: 400, marginLeft: 6 }}>
                    {alert.patient.locationText}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color, marginTop: 1 }}>
                {isSos
                  ? `🚨 SOS · ${timeStr} น.${alert.lat ? ` · ${alert.lat.toFixed(4)}°N` : ''}`
                  : isMissing
                  ? `⛔ สูญหาย — ไม่ได้รับการเยี่ยม ${alert.daysMissed} วัน`
                  : `⏰ เกินกำหนด ${alert.daysMissed} วัน — ${STATUS_LABEL[alert.patient.status] ?? alert.patient.status}`
                }
              </div>
            </div>

            <Link
              href={`/patients/${alert.patient.id}`}
              style={{
                fontSize: 10,
                background: isSos ? '#ff4d4f' : '#f5f5f5',
                color: isSos ? '#fff' : '#555',
                border: 'none', borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer',
                fontWeight: isSos ? 700 : 400,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {isSos ? 'ดูเร่งด่วน' : 'จัดการ'}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
