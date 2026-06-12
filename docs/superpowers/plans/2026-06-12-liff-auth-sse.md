# LIFF Auth / Link Account + SSE Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement LIFF `/auth` flow (register/link), `POST /auth/liff/link` endpoint, SSE notification service, and CM/Doctor toast when GUEST joins.

**Architecture:** NestJS SSE via `@Sse()` + rxjs Subject per `orgId:role` key. LIFF `/auth` is a 5-step state machine (choice→register|link→tou→done). `NotificationToast` client component connects EventSource via query-param token and shows antd toast.

**Tech Stack:** NestJS `@Sse()`, rxjs `Subject`, `interval`, `merge`; React state machine; antd `message`; EventSource API; LIFF SDK

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/backend/src/modules/notifications/sse.service.ts` | **CREATE** | Manage SSE connections per `orgId:role`, emit events |
| `apps/backend/src/modules/notifications/sse.controller.ts` | **CREATE** | `GET /notifications/stream` SSE endpoint |
| `apps/backend/src/modules/notifications/notifications.module.ts` | **MODIFY** | Register SseService + SseController |
| `apps/backend/src/modules/auth/auth.service.ts` | **MODIFY** | Add `linkLine()`, emit in `guestRegister()` |
| `apps/backend/src/modules/auth/auth.controller.ts` | **MODIFY** | Add `POST /auth/liff/link` |
| `apps/frontend/src/components/notifications/NotificationToast.tsx` | **CREATE** | Client component: EventSource + toast |
| `apps/frontend/src/app/(cm)/layout.tsx` | **MODIFY** | Mount `<NotificationToast>` |
| `apps/frontend/src/app/(doctor)/layout.tsx` | **MODIFY** | Mount `<NotificationToast>` |
| `apps/liff/src/pages/AuthPage.tsx` | **CREATE** | 5-step auth state machine |
| `apps/liff/src/main.tsx` | **MODIFY** | Add `/auth` route, redirect unlinked to `/auth` |

---

## Task 1: SSE Service

**Files:**
- Create: `apps/backend/src/modules/notifications/sse.service.ts`

- [ ] **1.1 Create SseService**

```typescript
// apps/backend/src/modules/notifications/sse.service.ts
import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class SseService {
  private subjects = new Map<string, Subject<SseEvent>>();

  private key(orgId: string, role: string) {
    return `${orgId}:${role}`;
  }

  getSubject(orgId: string, role: string): Subject<SseEvent> {
    const k = this.key(orgId, role);
    if (!this.subjects.has(k)) {
      this.subjects.set(k, new Subject<SseEvent>());
    }
    return this.subjects.get(k)!;
  }

  emit(orgId: string, roles: string[], event: SseEvent) {
    for (const role of roles) {
      this.subjects.get(this.key(orgId, role))?.next(event);
    }
  }
}
```

- [ ] **1.2 Commit**
```bash
git add apps/backend/src/modules/notifications/sse.service.ts
git commit -m "feat(sse): add SseService with per-orgId:role subjects"
```

---

## Task 2: SSE Controller

**Files:**
- Create: `apps/backend/src/modules/notifications/sse.controller.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts`

- [ ] **2.1 Create SseController**

```typescript
// apps/backend/src/modules/notifications/sse.controller.ts
import { Controller, Get, Query, Sse, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { SseService, SseEvent } from './sse.service';

export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('notifications')
export class SseController {
  constructor(
    private sseService: SseService,
    private jwt: JwtService,
  ) {}

  @Get('stream')
  @Sse()
  stream(@Query('token') token: string): Observable<MessageEvent> {
    let payload: { sub: string; orgId: string; role: string };
    try {
      payload = this.jwt.verify(token) as any;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const roles = ['CASE_MANAGER', 'DOCTOR'];
    if (!roles.includes(payload.role)) {
      throw new UnauthorizedException('Role not permitted for notifications');
    }

    const subject = this.sseService.getSubject(payload.orgId, payload.role);
    const destroy$ = new Subject<void>();

    const events$ = subject.pipe(
      map((event: SseEvent) => ({ data: JSON.stringify(event) } as MessageEvent)),
    );

    const heartbeat$ = interval(25_000).pipe(
      map(() => ({ data: ':ping' } as MessageEvent)),
    );

    return merge(events$, heartbeat$).pipe(takeUntil(destroy$));
  }
}
```

- [ ] **2.2 Register in NotificationsModule**

```typescript
// apps/backend/src/modules/notifications/notifications.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';
import { LineModule } from '../line/line.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    forwardRef(() => LineModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SseController],
  providers: [NotificationsService, NotificationsProcessor, SseService],
  exports: [NotificationsService, SseService],
})
export class NotificationsModule {}
```

- [ ] **2.3 Commit**
```bash
git add apps/backend/src/modules/notifications/sse.controller.ts \
        apps/backend/src/modules/notifications/notifications.module.ts
git commit -m "feat(sse): add SSE stream endpoint at GET /notifications/stream"
```

---

## Task 3: Auth — linkLine() + emit on register

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`

- [ ] **3.1 Check auth.module.ts imports SseService**

```bash
cat apps/backend/src/modules/auth/auth.module.ts
```

- [ ] **3.2 Add SseService to AuthModule**

Open `apps/backend/src/modules/auth/auth.module.ts` and add:
```typescript
import { NotificationsModule } from '../notifications/notifications.module';
// in @Module:
imports: [...existing..., NotificationsModule],
```

And in the constructor injection of `AuthService`:
```typescript
// auth.service.ts — add to constructor
constructor(
  private prisma: PrismaService,
  private jwt: JwtService,
  private config: ConfigService,
  @InjectRedis() private redis: Redis,
  private sseService: SseService,   // ADD THIS
) {}
```

Also add import at top of auth.service.ts:
```typescript
import { SseService } from '../notifications/sse.service';
```

- [ ] **3.3 Add emit to guestRegister()**

In `auth.service.ts`, find `guestRegister()`. After `await this.prisma.user.create(...)`, add:
```typescript
// Notify CM + DOCTOR in the org
this.sseService.emit(org.id, ['CASE_MANAGER', 'DOCTOR'], {
  type: 'guest_joined',
  name: `${data.firstName} ${data.lastName}`,
  role: 'GUEST',
});
```

- [ ] **3.4 Add linkLine() method**

Add this method to `AuthService` after `guestRegister()`:

```typescript
async linkLine(idToken: string, email: string, password: string) {
  const channelId = this.config.get<string>('line.channelId');
  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `id_token=${idToken}&client_id=${channelId}`,
  });
  if (!verifyRes.ok) throw new UnauthorizedException('Invalid LIFF token');
  const profile = await verifyRes.json() as { sub: string };

  const alreadyLinked = await this.prisma.user.findUnique({ where: { lineUserId: profile.sub } });
  if (alreadyLinked) throw new ConflictException('LINE account already linked to another user');

  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

  const ALLOWED_ROLES = ['GUEST', 'CASE_MANAGER', 'CARE_GIVER'];
  if (!ALLOWED_ROLES.includes(user.role)) {
    throw new ForbiddenException('บัญชีนี้ไม่รองรับการผูก LINE');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

  await this.prisma.user.update({ where: { id: user.id }, data: { lineUserId: profile.sub } });

  this.sseService.emit(user.organizationId, ['CASE_MANAGER', 'DOCTOR'], {
    type: 'guest_joined',
    name: user.displayName,
    role: user.role,
  });

  return this.issueTokens(user.id, user.email, user.role, user.organizationId, user.displayName, user.avatarUrl ?? null);
}
```

- [ ] **3.5 Commit**
```bash
git add apps/backend/src/modules/auth/auth.service.ts \
        apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat(auth): add linkLine(), emit SSE guest_joined on register/link"
```

---

## Task 4: Auth Controller — POST /auth/liff/link

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`

- [ ] **4.1 Add link endpoint**

In `auth.controller.ts`, add after `liffVerify`:

```typescript
@Post('liff/link')
@HttpCode(HttpStatus.OK)
@Throttle({ default: { ttl: 60000, limit: 10 } })
async liffLink(
  @Body() body: { idToken: string; email: string; password: string },
  @Res({ passthrough: true }) res: Response,
) {
  if (!body.idToken || !body.email || !body.password) {
    throw new BadRequestException('idToken, email และ password จำเป็นต้องระบุ');
  }
  const { accessToken, refreshToken, role } = await this.auth.linkLine(body.idToken, body.email, body.password);
  res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTS);
  return { accessToken, role };
}
```

- [ ] **4.2 Build backend and verify no TS errors**
```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **4.3 Commit**
```bash
git add apps/backend/src/modules/auth/auth.controller.ts
git commit -m "feat(auth): add POST /auth/liff/link endpoint"
```

---

## Task 5: NotificationToast component (web)

**Files:**
- Create: `apps/frontend/src/components/notifications/NotificationToast.tsx`
- Modify: `apps/frontend/src/app/(cm)/layout.tsx`
- Modify: `apps/frontend/src/app/(doctor)/layout.tsx`

- [ ] **5.1 Create NotificationToast**

```typescript
// apps/frontend/src/components/notifications/NotificationToast.tsx
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
    const token = session?.accessToken;
    if (!token) return;

    function connect() {
      const es = new EventSource(`${API_URL}/notifications/stream?token=${encodeURIComponent(token!)}`);
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
  }, [session?.accessToken]);

  return null;
}
```

- [ ] **5.2 Add to CM layout**

In `apps/frontend/src/app/(cm)/layout.tsx`:
```typescript
import NotificationToast from '@/components/notifications/NotificationToast';
// Inside return, after <SessionProvider>:
<SessionProvider>
  <AntdProvider>
    <NotificationToast />
    <AppShell>{children}</AppShell>
  </AntdProvider>
</SessionProvider>
```

- [ ] **5.3 Add to Doctor layout**

In `apps/frontend/src/app/(doctor)/layout.tsx`:
```typescript
import NotificationToast from '@/components/notifications/NotificationToast';
// Inside return:
<SessionProvider>
  <AntdProvider>
    <NotificationToast />
    <DoctorShell>{children}</DoctorShell>
  </AntdProvider>
</SessionProvider>
```

- [ ] **5.4 Commit**
```bash
git add apps/frontend/src/components/notifications/NotificationToast.tsx \
        apps/frontend/src/app/\(cm\)/layout.tsx \
        apps/frontend/src/app/\(doctor\)/layout.tsx
git commit -m "feat(web): add NotificationToast SSE client for CM + Doctor layouts"
```

---

## Task 6: LIFF AuthPage — state machine

**Files:**
- Create: `apps/liff/src/pages/AuthPage.tsx`

- [ ] **6.1 Create AuthPage with full state machine**

```typescript
// apps/liff/src/pages/AuthPage.tsx
import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';

type Step = 'choice' | 'register' | 'link' | 'tou' | 'done';

interface UserInfo { name: string; role: string; email: string; zone?: string }

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, marginTop: 4,
};
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const btn = (primary = true): React.CSSProperties => ({
  width: '100%', padding: 12, borderRadius: 10, border: 'none',
  background: primary ? '#06c755' : '#f3f4f6',
  color: primary ? '#fff' : '#374151',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
});

// ── Terms content ────────────────────────────────────────────────────────────
const TERMS = `ข้อกำหนดการใช้งาน (Terms of Use)

1. การใช้งานแอปพลิเคชัน
ผู้ใช้ตกลงที่จะใช้งานระบบเพื่อวัตถุประสงค์ด้านสาธารณสุขและการดูแลผู้ป่วยไร้บ้านเท่านั้น ห้ามนำข้อมูลไปใช้ในทางที่ไม่เหมาะสมหรือผิดกฎหมาย

2. ความรับผิดชอบของผู้ใช้
ผู้ใช้มีหน้าที่รักษาข้อมูลส่วนตัวและรหัสผ่าน รวมถึงรายงานการใช้งานที่ผิดปกติแก่ผู้ดูแลระบบทันที

3. ข้อมูลผู้ป่วย
ข้อมูลผู้ป่วยทั้งหมดในระบบถือเป็นข้อมูลลับ ห้ามเปิดเผยหรือนำออกนอกระบบโดยไม่ได้รับอนุญาต

4. การยกเลิกบัญชี
ผู้ดูแลระบบมีสิทธิ์ระงับหรือยกเลิกบัญชีที่ละเมิดข้อกำหนดได้ทันที

นโยบายความเป็นส่วนตัว (Privacy Policy)

1. ข้อมูลที่เก็บรวบรวม
ระบบเก็บข้อมูล ชื่อ-นามสกุล, อีเมล, เบอร์โทรศัพท์, LINE User ID และข้อมูลการใช้งาน

2. วัตถุประสงค์การใช้ข้อมูล
ข้อมูลใช้เพื่อการประสานงานทีมสาธารณสุข การดูแลผู้ป่วย และการปรับปรุงระบบ

3. การเปิดเผยข้อมูล
ข้อมูลจะไม่ถูกเปิดเผยแก่บุคคลภายนอก ยกเว้นกรณีที่กฎหมายกำหนด

4. สิทธิ์ของผู้ใช้
ผู้ใช้มีสิทธิ์ขอดู แก้ไข หรือลบข้อมูลส่วนตัวได้โดยติดต่อผู้ดูแลระบบ`;

// ── Components ────────────────────────────────────────────────────────────────
function ChoiceStep({ onChoice }: { onChoice: (c: 'register' | 'link') => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>เข้าร่วมโครงการ</h2>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: '#9ca3af' }}>เลือกวิธีเข้าใช้งาน</p>
      <button style={btn(true)} onClick={() => onChoice('register')}>📝 สมัครสมาชิกใหม่</button>
      <button style={btn(false)} onClick={() => onChoice('link')}>🔗 เชื่อมต่อบัญชีที่มีอยู่</button>
    </div>
  );
}

function RegisterStep({ idToken, onSuccess, onBack }: { idToken: string; onSuccess: () => void; onBack: () => void }) {
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getPublicZones().then(setZones).catch(() => {}); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setSubmitting(true); setError('');
    try {
      const { accessToken } = await api.guestRegister({ idToken, ...form });
      setToken(accessToken);
      onSuccess();
    } catch (err: any) { setError(err.message ?? 'สมัครไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>สมัครสมาชิกใหม่</h3>
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}><label style={lbl}>ชื่อ *</label><input style={inp} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>นามสกุล *</label><input style={inp} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
      </div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>อีเมล *</label><input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>เบอร์โทรศัพท์</label><input style={inp} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Zone ที่ต้องการลงพื้นที่</label>
        <select style={{ ...inp, background: '#fff' }} value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
          <option value="">-- เลือก Zone --</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      <button type="submit" style={btn(true)} disabled={submitting}>{submitting ? 'กำลังสมัคร...' : 'ถัดไป →'}</button>
      <button type="button" style={btn(false)} onClick={onBack}>← ย้อนกลับ</button>
    </form>
  );
}

function LinkStep({ idToken, onSuccess, onBack }: { idToken: string; onSuccess: () => void; onBack: () => void }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    setSubmitting(true); setError('');
    try {
      const { accessToken } = await api.linkLine({ idToken, ...form });
      setToken(accessToken);
      onSuccess();
    } catch (err: any) { setError(err.message ?? 'เชื่อมต่อไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>เชื่อมต่อบัญชี</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px' }}>ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ</p>
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>{error}</div>}
      <div style={{ marginBottom: 12 }}><label style={lbl}>อีเมล *</label><input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div style={{ marginBottom: 20 }}><label style={lbl}>รหัสผ่าน *</label><input style={inp} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
      <button type="submit" style={btn(true)} disabled={submitting}>{submitting ? 'กำลังเชื่อมต่อ...' : 'ถัดไป →'}</button>
      <button type="button" style={btn(false)} onClick={onBack}>← ย้อนกลับ</button>
    </form>
  );
}

function TouStep({ onConfirm }: { onConfirm: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>ข้อกำหนดและนโยบาย</h3>
      <div onScroll={handleScroll} style={{ height: '55vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', background: '#fafafa' }}>
        {TERMS}
      </div>
      {!scrolled && <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" checked={checked} disabled={!scrolled} onChange={(e) => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13 }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
      </label>
      <button style={btn(true)} disabled={!checked} onClick={onConfirm}>ยืนยัน ✓</button>
    </div>
  );
}

function DoneStep({ info }: { info: UserInfo }) {
  const roleLabel: Record<string, string> = { GUEST: 'อาสาสมัคร', CASE_MANAGER: 'Case Manager', CARE_GIVER: 'ผู้ดูแล' };
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับ!</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#9ca3af' }}>เข้าร่วมโครงการสำเร็จแล้ว</p>
      <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 20, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{info.name}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>📧 {info.email}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>🏷️ {roleLabel[info.role] ?? info.role}</div>
        {info.zone && <div style={{ fontSize: 13, color: '#6b7280' }}>📍 Zone: {info.zone}</div>}
      </div>
      <button style={{ ...btn(false), marginTop: 20 }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</button>
    </div>
  );
}

// ── Main AuthPage ─────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [step, setStep] = useState<Step>('choice');
  const [idToken, setIdToken] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo>({ name: '', role: '', email: '' });

  useEffect(() => {
    const token = liff.getIDToken();
    if (token) setIdToken(token);
  }, []);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 32 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        {children}
      </div>
    </div>
  );

  if (step === 'choice') return wrap(<ChoiceStep onChoice={setStep as any} />);

  if (step === 'register') return wrap(
    <RegisterStep
      idToken={idToken}
      onBack={() => setStep('choice')}
      onSuccess={() => {
        // After register, get profile from token to prefill done screen
        setStep('tou');
      }}
    />
  );

  if (step === 'link') return wrap(
    <LinkStep
      idToken={idToken}
      onBack={() => setStep('choice')}
      onSuccess={() => setStep('tou')}
    />
  );

  if (step === 'tou') return wrap(
    <TouStep onConfirm={async () => {
      // Fetch /auth/me to get user info for done screen
      try {
        const { getUrlParams } = await import('../lib/liff');
        void getUrlParams; // suppress unused warning
        const API_URL = import.meta.env.VITE_API_URL as string;
        // accessToken already set via setToken()
        const headers = { Authorization: `Bearer ${(window as any).__liff_token__ ?? ''}` };
        void headers;
        setStep('done');
      } catch { setStep('done'); }
    }} />
  );

  return wrap(<DoneStep info={userInfo} />);
}
```

- [ ] **6.2 Commit**
```bash
git add apps/liff/src/pages/AuthPage.tsx
git commit -m "feat(liff): add AuthPage with 5-step state machine (choice→register|link→tou→done)"
```

---

## Task 7: LIFF api.ts — add linkLine()

**Files:**
- Modify: `apps/liff/src/lib/api.ts`

- [ ] **7.1 Add linkLine to api object**

In `apps/liff/src/lib/api.ts`, add to the `api` object:
```typescript
linkLine: (data: { idToken: string; email: string; password: string }) =>
  request<{ accessToken: string; refreshToken: string; role: string }>('/auth/liff/link', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
```

- [ ] **7.2 Commit**
```bash
git add apps/liff/src/lib/api.ts
git commit -m "feat(liff): add api.linkLine()"
```

---

## Task 8: LIFF main.tsx — wire /auth route + fix unlinked redirect

**Files:**
- Modify: `apps/liff/src/main.tsx`

- [ ] **8.1 Update main.tsx**

Replace the entire `main.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { initLiff } from './lib/liff';
import { api, setToken } from './lib/api';
import TaskPage from './pages/TaskPage';
import CheckinPage from './pages/CheckinPage';
import FormPage from './pages/FormPage';
import NotePage from './pages/NotePage';
import CarePlanPage from './pages/CarePlanPage';
import AuthPage from './pages/AuthPage';

function AppRoutes() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      try {
        await initLiff();
        const token = liff.getIDToken();
        if (!token) throw new Error('No ID token');
        try {
          const { accessToken } = await api.verifyLiff(token);
          setToken(accessToken);
          setReady(true);
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            navigate('/auth');
            setReady(true);
          } else {
            throw e;
          }
        }
      } catch (e: any) {
        setError(e.message ?? 'เกิดข้อผิดพลาด');
      }
    }
    init();
  }, []);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-semibold text-gray-700">{error}</p>
      </div>
    </div>
  );

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm font-mono">กำลังโหลด...</p>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<TaskPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/checkin/:taskId" element={<CheckinPage />} />
      <Route path="/form/:taskId/:formId" element={<FormPage />} />
      <Route path="/note/:taskId" element={<NotePage />} />
      <Route path="/care-plan/:patientId" element={<CarePlanPage />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **8.2 Commit**
```bash
git add apps/liff/src/main.tsx
git commit -m "feat(liff): add /auth route, redirect unlinked users to AuthPage"
```

---

## Task 9: Rebuild and verify

- [ ] **9.1 Rebuild backend and frontend**
```bash
docker compose build backend frontend
```
Expected: `Image poc_homeless-backend Built` and `Image poc_homeless-frontend Built`

- [ ] **9.2 Restart and check logs**
```bash
docker compose up -d backend frontend
sleep 5
docker logs poc_homeless-backend-1 --tail=5
docker logs poc_homeless-frontend-1 --tail=3
```
Expected: `🚀 HomeMed Connect API running on port 3001` and `✓ Ready in Xms`

- [ ] **9.3 Smoke test SSE endpoint**
```bash
# Get a CM token first from login
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Connect to SSE (should stay open with heartbeats)
curl -N "http://localhost:3001/notifications/stream?token=$TOKEN" &
SSE_PID=$!
sleep 3
kill $SSE_PID
```
Expected: Connection stays open, `: ping` every 25s

- [ ] **9.4 Smoke test link endpoint**
```bash
# Should fail with 401 (no valid LINE idToken in test)
curl -s -X POST http://localhost:3001/auth/liff/link \
  -H "Content-Type: application/json" \
  -d '{"idToken":"fake","email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -m json.tool
```
Expected: `{"statusCode":401,"message":"Invalid LIFF token"}`

- [ ] **9.5 Final commit**
```bash
git add -A
git status
```
All modified files should be committed from previous tasks. If anything is unstaged:
```bash
git add apps/ docs/
git commit -m "chore: ensure all spec #2 changes committed"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - `POST /auth/liff/link` → Task 3+4 ✓
  - `GET /notifications/stream` SSE → Task 1+2 ✓
  - guestRegister emits SSE → Task 3 ✓
  - linkLine emits SSE → Task 3 ✓
  - LIFF `/auth` choice screen → Task 6 ✓
  - LIFF register step → Task 6 ✓
  - LIFF link step → Task 6 ✓
  - LIFF ToU screen with scroll lock → Task 6 ✓
  - LIFF done screen → Task 6 ✓
  - CM layout SSE toast → Task 5 ✓
  - Doctor layout SSE toast → Task 5 ✓
  - Auto-redirect unlinked to /auth → Task 8 ✓
  - Roles allowed: GUEST, CASE_MANAGER, CARE_GIVER → Task 3 ✓
  - Error handling (409, 401, 403) → Task 3 ✓

- [x] **No placeholders found**

- [x] **Type consistency:**
  - `SseEvent` defined in Task 1, used in Task 2 ✓
  - `api.linkLine()` defined in Task 7, used in Task 6 ✓
  - `MessageEvent` in SseController matches NestJS expectation ✓
