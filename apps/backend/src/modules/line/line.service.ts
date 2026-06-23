import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const LINE_API = 'https://api.line.me';

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);
  private readonly channelAccessToken: string;
  private readonly channelSecret: string;
  private readonly liffId: string;

  constructor(private config: ConfigService) {
    this.channelAccessToken = config.get<string>('line.channelAccessToken') ?? '';
    this.channelSecret = config.get<string>('line.channelSecret') ?? '';
    this.liffId = config.get<string>('line.liffId') ?? '';
  }

  verifySignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.channelSecret).update(rawBody).digest('base64');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async pushTaskNotification(lineUserId: string, task: {
    id: string; title: string; patientName: string; dueAt?: Date; token: string;
  }) {
    const liffUrl = `https://liff.line.me/${this.liffId}?taskId=${task.id}&token=${task.token}`;

    const body = {
      to: lineUserId,
      messages: [{
        type: 'flex',
        altText: `HomeMed Connect: งานใหม่ — ${task.title}`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical',
            backgroundColor: '#7c6af7',
            contents: [{ type: 'text', text: 'HomeMed Connect', weight: 'bold', color: '#ffffff', size: 'sm' }],
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
              { type: 'text', text: task.title, weight: 'bold', size: 'md', wrap: true },
              { type: 'text', text: `ผู้ป่วย: ${task.patientName}`, size: 'sm', color: '#666666', wrap: true },
              ...(task.dueAt ? [{ type: 'text', text: `กำหนด: ${task.dueAt.toLocaleDateString('th-TH')}`, size: 'sm', color: '#888888' }] : []),
            ],
          },
          footer: {
            type: 'box', layout: 'vertical',
            contents: [{
              type: 'button', style: 'primary', color: '#7c6af7',
              action: { type: 'uri', label: 'เปิดงาน', uri: liffUrl },
            }],
          },
        },
      }],
    };

    const res = await fetch(`${LINE_API}/v2/bot/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.channelAccessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      this.logger.error(`Line push failed: ${res.status} ${await res.text()}`);
    }
  }

  async pushOverdueAlert(lineUserId: string, data: {
    patientName: string; hn: string; status: string; daysMissed: number;
  }) {
    const statusLabel: Record<string, string> = {
      CRITICAL: '🔴 วิกฤต', PENDING: '🟡 รอดำเนินการ', STABLE: '🟢 ปกติ', MISSING: '⛔ สูญหาย',
    };
    const text = [
      '⚠️ แจ้งเตือน: เกินกำหนดเยี่ยม',
      `ผู้ป่วย: ${data.patientName} (HN ${data.hn})`,
      `ระดับ: ${statusLabel[data.status] ?? data.status}`,
      `เกินกำหนด: ${data.daysMissed} วัน`,
      'กรุณาติดตามหรือส่ง Caregiver โดยด่วน',
    ].join('\n');
    await this.pushText(lineUserId, text);
  }

  async pushSosAlert(lineUserId: string, data: {
    patientName: string; hn: string; caregiverName: string; lat?: number; lng?: number;
  }) {
    const location = data.lat != null && data.lng != null
      ? `📍 ${data.lat.toFixed(4)}°N, ${data.lng.toFixed(4)}°E`
      : '📍 ไม่ทราบตำแหน่ง';
    const text = [
      '🚨 SOS — เหตุฉุกเฉิน',
      `อาสา: ${data.caregiverName}`,
      `ผู้ป่วย: ${data.patientName} (HN ${data.hn})`,
      location,
    ].join('\n');
    await this.pushText(lineUserId, text);
  }

  async pushMorningBriefing(lineUserId: string, patients: {
    name: string; hn: string; status: string; locationText?: string;
  }[]) {
    const statusLabel: Record<string, string> = {
      CRITICAL: '🔴 วิกฤต', PENDING: '🟡 เฝ้าระวัง', STABLE: '🟢 ปกติ',
    };
    const lines = [
      '☀️ ผู้ป่วยที่ต้องเยี่ยมวันนี้',
      ...patients.map((p) =>
        `• ${p.name} (HN ${p.hn}) ${statusLabel[p.status] ?? p.status}${p.locationText ? ` — ${p.locationText}` : ''}`,
      ),
      `\nเปิด LIFF: https://liff.line.me/${this.liffId}`,
    ];
    await this.pushText(lineUserId, lines.join('\n'));
  }

  async pushRoleApproval(lineUserId: string, data: { displayName: string; newRole: string }) {
    const ROLE_LABEL: Record<string, string> = {
      CARE_GIVER: 'ผู้ดูแลภาคสนาม', CASE_MANAGER: 'Case Manager',
      MEDICAL_VOLUNTEER: 'อาสาพยาบาล', DOCTOR: 'แพทย์',
      ADMIN: 'ผู้ดูแลระบบ', SUPER_ADMIN: 'ผู้อำนวยการ',
    };
    const roleLabel = ROLE_LABEL[data.newRole] ?? data.newRole;
    const liffUrl = `https://liff.line.me/${this.liffId}`;

    const body = {
      to: lineUserId,
      messages: [{
        type: 'flex',
        altText: `HomeMed Connect: บัญชีของคุณได้รับการอนุมัติแล้ว — ${roleLabel}`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical',
            backgroundColor: '#6366F1',
            contents: [{ type: 'text', text: 'HomeMed Connect', weight: 'bold', color: '#ffffff', size: 'sm' }],
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
              { type: 'text', text: '✅ บัญชีของคุณได้รับการอนุมัติแล้ว', weight: 'bold', size: 'md', wrap: true, color: '#0F172A' },
              { type: 'text', text: `สวัสดีคุณ ${data.displayName}`, size: 'sm', color: '#64748B', wrap: true },
              { type: 'text', text: `Role: ${roleLabel}`, size: 'sm', color: '#6366F1', weight: 'bold' },
              { type: 'text', text: 'ตอนนี้คุณสามารถเข้าใช้งานระบบและดูรายการผู้ป่วยในพื้นที่ได้แล้ว', size: 'sm', color: '#64748B', wrap: true },
            ],
          },
          footer: {
            type: 'box', layout: 'vertical',
            contents: [{
              type: 'button', style: 'primary', color: '#6366F1',
              action: { type: 'uri', label: 'เปิดแอปพลิเคชัน', uri: liffUrl },
            }],
          },
        },
      }],
    };

    const res = await fetch(`${LINE_API}/v2/bot/message/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.channelAccessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      this.logger.error(`pushRoleApproval failed: ${res.status} ${await res.text()}`);
    }
  }

  async pushAdjNotify(lineUserId: string, data: { itemName: string; qty: number; adminName: string }) {
    const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
    await this.pushText(lineUserId,
      `📋 แจ้งทราบ: ปรับสต็อกอัตโนมัติ\n${data.itemName} ${dir} หน่วย\nโดย: ${data.adminName}`
    );
  }

  async pushAdjRequest(lineUserId: string, data: { itemName: string; qty: number; adminName: string; reason: string; adjId: string }) {
    const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
    await this.pushText(lineUserId,
      `⚠️ รออนุมัติ ADJ สต็อก\n${data.itemName} ${dir} หน่วย\nเหตุผล: ${data.reason}\nโดย: ${data.adminName}\n\nกรุณาอนุมัติที่ /inventory/approvals`
    );
  }

  async pushAdjResult(lineUserId: string, data: { itemName: string; qty: number; approved: boolean; reviewNote?: string }) {
    const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
    const status = data.approved ? '✅ อนุมัติแล้ว' : '❌ ปฏิเสธ';
    const note = data.reviewNote ? `\nหมายเหตุ: ${data.reviewNote}` : '';
    await this.pushText(lineUserId,
      `${status}: ADJ สต็อก\n${data.itemName} ${dir} หน่วย${note}`
    );
  }

  async pushLowStock(lineUserId: string, data: { itemName: string; currentStock: number; threshold: number }) {
    await this.pushText(lineUserId,
      `🔴 แจ้งเตือนสต็อกใกล้หมด\n${data.itemName}: ${data.currentStock} หน่วยเหลืออยู่ (ต่ำกว่า ${data.threshold})\nกรุณาสั่งซื้อเพิ่ม`
    );
  }

  private async pushText(lineUserId: string, text: string) {
    const res = await fetch(`${LINE_API}/v2/bot/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.channelAccessToken}`,
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      this.logger.error(`Line push failed: ${res.status} ${await res.text()}`);
    }
  }
}
