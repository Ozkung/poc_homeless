# LIFF New Connection Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the LIFF onboarding flow so unlinked users see a Guest Register page directly after LINE login, then link existing accounts from the Profile page.

**Architecture:** Remove the `/auth` choice screen and auto-redirect. Unlinked users land on a new `/welcome` page (Guest Register form → TOU → done → Profile). Existing-account linking is accessible from Profile page via a card that appears only for GUEST role users.

**Tech Stack:** React 19, React Router DOM v7, @line/liff v2, TypeScript, Vite, inline styles + Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/liff/src/pages/WelcomePage.tsx` | **Create** | 3-step Guest Register flow for unlinked users |
| `apps/liff/src/pages/AuthPage.tsx` | **Rewrite** | Link-only flow (remove choice/register/done steps) |
| `apps/liff/src/pages/ProfilePage.tsx` | **Modify** | Add "เชื่อมบัญชีที่มีอยู่" card for GUEST role |
| `apps/liff/src/main.tsx` | **Modify** | Redirect unlinked users to `/welcome`, add `/welcome` route |

---

### Task 1: Create WelcomePage.tsx

**Files:**
- Create: `apps/liff/src/pages/WelcomePage.tsx`

- [ ] **Step 1: Create the file with full implementation**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';

type Step = 'form' | 'tou' | 'done';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zoneId: string;
}

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

const wrap = (children: React.ReactNode) => (
  <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 32 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
      {children}
    </div>
  </div>
);

export default function WelcomePage() {
  const [step, setStep] = useState<Step>('form');
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({ firstName: '', lastName: '', email: '', phone: '', zoneId: '' });
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    liff.getProfile().then(setLineProfile).catch(() => {});
    api.getPublicZones().then(setZones).catch(() => {});
  }, []);

  const idToken = liff.getIDToken() ?? '';

  const Header = () => (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      {lineProfile?.pictureUrl ? (
        <img
          src={lineProfile.pictureUrl}
          alt="LINE profile"
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f0f0f0', marginBottom: 10 }}
        />
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#06c755', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff' }}>
          {lineProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{lineProfile?.displayName ?? ''}</div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>ยินดีต้อนรับสู่โครงการ</div>
    </div>
  );

  if (step === 'form') {
    function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!formData.firstName || !formData.lastName || !formData.email) {
        setError('กรุณากรอกข้อมูลให้ครบ');
        return;
      }
      setError('');
      setStep('tou');
    }

    return wrap(
      <>
        <Header />
        <form onSubmit={handleSubmit}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>สมัครสมาชิก</h3>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>ชื่อ *</label>
              <input style={inp} value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>นามสกุล *</label>
              <input style={inp} value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>อีเมล *</label>
            <input style={inp} type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>เบอร์โทรศัพท์</label>
            <input style={inp} type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Zone ที่ต้องการลงพื้นที่</label>
            <select style={{ ...inp, background: '#fff' }} value={formData.zoneId} onChange={e => setFormData({ ...formData, zoneId: e.target.value })}>
              <option value="">-- เลือก Zone --</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <button type="submit" style={btn(true)}>ถัดไป →</button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
          มีบัญชีในระบบอยู่แล้ว?{' '}
          <span
            style={{ color: '#06c755', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => navigate('/auth')}
          >
            เชื่อมบัญชี →
          </span>
        </p>
      </>
    );
  }

  if (step === 'tou') {
    return wrap(
      <>
        <Header />
        <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>ข้อกำหนดและนโยบาย</h3>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
        <div
          onScroll={e => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
          }}
          style={{ height: '55vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', background: '#fafafa' }}
        >
          {TERMS}
        </div>
        {!scrolled && <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4 }}>
          <input type="checkbox" checked={checked} disabled={!scrolled} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 13 }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
        </label>
        <button
          style={btn(true)}
          disabled={!checked || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError('');
            try {
              const { accessToken } = await api.guestRegister({
                idToken,
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                phone: formData.phone,
                zoneId: formData.zoneId,
              });
              setToken(accessToken);
              setStep('done');
            } catch (err: any) {
              setError(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
              setStep('form');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? 'กำลังบันทึก...' : 'ยืนยัน ✓'}
        </button>
        <button style={btn(false)} onClick={() => setStep('form')}>← ย้อนกลับ</button>
      </>
    );
  }

  return wrap(
    <div style={{ textAlign: 'center' }}>
      <Header />
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>ยินดีต้อนรับ!</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af' }}>สมัครสมาชิกสำเร็จแล้ว</p>
      <span style={{ display: 'inline-block', background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '4px 16px', fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
        อาสาสมัคร (รออนุมัติ)
      </span>
      <button style={{ ...btn(true), marginTop: 0 }} onClick={() => navigate('/profile', { replace: true })}>
        ดูโปรไฟล์ →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/WelcomePage.tsx
git commit -m "feat(liff): add WelcomePage for unlinked user guest registration"
```

---

### Task 2: Rewrite AuthPage.tsx to link-only flow

**Files:**
- Modify: `apps/liff/src/pages/AuthPage.tsx`

- [ ] **Step 1: Replace the entire file**

Replace the full content of `apps/liff/src/pages/AuthPage.tsx` with:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { api, setToken } from '../lib/api';

type Step = 'link' | 'tou';

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

const wrap = (children: React.ReactNode) => (
  <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, paddingTop: 32 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
      {children}
    </div>
  </div>
);

export default function AuthPage() {
  const [step, setStep] = useState<Step>('link');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const idToken = liff.getIDToken() ?? '';

  if (step === 'link') {
    function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!form.email || !form.password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
      setError('');
      setStep('tou');
    }

    return wrap(
      <form onSubmit={handleSubmit}>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>เชื่อมต่อบัญชี</h3>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px' }}>ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ</p>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>อีเมล *</label>
          <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>รหัสผ่าน *</label>
          <input style={inp} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <button type="submit" style={btn(true)}>ถัดไป →</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
          <span style={{ color: '#6b7280', cursor: 'pointer' }} onClick={() => navigate('/welcome')}>
            ← ยังไม่มีบัญชี? กลับไปสมัคร
          </span>
        </p>
      </form>
    );
  }

  return wrap(
    <>
      <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>ข้อกำหนดและนโยบาย</h3>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}
      <div
        onScroll={e => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          if (scrollTop + clientHeight >= scrollHeight - 10) setScrolled(true);
        }}
        style={{ height: '55vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap', background: '#fafafa' }}
      >
        {TERMS}
      </div>
      {!scrolled && <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>↓ เลื่อนลงเพื่ออ่านให้ครบ</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: scrolled ? 'pointer' : 'not-allowed', opacity: scrolled ? 1 : 0.4 }}>
        <input type="checkbox" checked={checked} disabled={!scrolled} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 13 }}>ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว</span>
      </label>
      <button
        style={btn(true)}
        disabled={!checked || submitting}
        onClick={async () => {
          setSubmitting(true);
          setError('');
          try {
            const { accessToken } = await api.linkLine({ idToken, email: form.email, password: form.password });
            setToken(accessToken);
            navigate('/profile', { replace: true });
          } catch (err: any) {
            const msg =
              err.status === 409 ? 'LINE Account นี้ผูกกับบัญชีอื่นอยู่แล้ว'
              : err.status === 403 ? 'บัญชีนี้ไม่รองรับการผูก LINE'
              : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
            setError(msg);
            setStep('link');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? 'กำลังบันทึก...' : 'ยืนยัน ✓'}
      </button>
      <button style={btn(false)} onClick={() => setStep('link')}>← ย้อนกลับ</button>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/AuthPage.tsx
git commit -m "feat(liff): rewrite AuthPage to link-only flow"
```

---

### Task 3: Update ProfilePage.tsx — add GUEST link card

**Files:**
- Modify: `apps/liff/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Add `useNavigate` import and GUEST link card**

In `apps/liff/src/pages/ProfilePage.tsx`:

1. The file already imports `useNavigate` — confirm it's present at line 3. If not, add it to the react-router-dom import.

2. Inside `ProfilePage`, after the `useEffect` block, add `role` extraction from JWT — it's already done (lines 43-47). We need to also pass `role` through to the render.

3. The `info` state already has `role`. Find the section that renders the info card (the `<div style={{ background: '#f9fafb', ... }}>` block) and add the GUEST card after it, before the close button.

Replace this block (after the info card, before the close button):

```tsx
      <button
        onClick={() => liff.closeWindow()}
        style={{ width: '100%', marginTop: 20, padding: 13, borderRadius: 12, border: 'none', background: '#f3f4f6', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        ปิดหน้าต่าง
      </button>
```

With:

```tsx
      {info.role === 'GUEST' && (
        <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>🔗 มีบัญชีในระบบอยู่แล้วใช่ไหม?</div>
          <div style={{ fontSize: 12, color: '#b45309', marginBottom: 12 }}>กดเพื่อเชื่อมบัญชีและอัปเกรด Role</div>
          <button
            onClick={() => navigate('/auth')}
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            เชื่อมบัญชีที่มีอยู่
          </button>
        </div>
      )}

      <button
        onClick={() => liff.closeWindow()}
        style={{ width: '100%', marginTop: 20, padding: 13, borderRadius: 12, border: 'none', background: '#f3f4f6', color: '#374151', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        ปิดหน้าต่าง
      </button>
```

`useNavigate` is already imported (line 3) and `const navigate = useNavigate()` is already declared (line 35) in `ProfilePage.tsx` — no changes needed for those.

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/liff/src/pages/ProfilePage.tsx
git commit -m "feat(liff): add link-account card for GUEST role in ProfilePage"
```

---

### Task 4: Update main.tsx — redirect to /welcome and add route

**Files:**
- Modify: `apps/liff/src/main.tsx`

- [ ] **Step 1: Add WelcomePage import**

At the top of `apps/liff/src/main.tsx`, after the existing page imports, add:

```tsx
import WelcomePage from './pages/WelcomePage';
```

- [ ] **Step 2: Change the redirect target for unlinked users**

Find this block in `main.tsx` (lines 33–37):

```tsx
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            // Preserve current path so AuthPage can redirect back after auth
            const from = location.pathname !== '/auth' ? location.pathname : '/';
            navigate('/auth', { state: { from } });
            setReady(true);
```

Replace it with:

```tsx
        } catch (e: any) {
          if (e.status === 401 || e.message?.includes('not linked')) {
            navigate('/welcome');
            setReady(true);
```

- [ ] **Step 3: Add the /welcome route**

Find the `<Routes>` block in `main.tsx`. It currently starts with:

```tsx
  return (
    <Routes>
      <Route path="/" element={<TaskPage />} />
      <Route path="/auth" element={<AuthPage />} />
```

Add the `/welcome` route after `/auth`:

```tsx
  return (
    <Routes>
      <Route path="/" element={<TaskPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Build to confirm no bundle errors**

```bash
cd apps/liff && npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add apps/liff/src/main.tsx
git commit -m "feat(liff): redirect unlinked users to /welcome, add /welcome route"
```

---

## Manual Verification Checklist

After all tasks complete, verify these flows manually in the browser (or LIFF simulator):

**Flow A — New user (not linked):**
1. Open LIFF URL → LINE login completes
2. Landing on `/welcome` — see LINE profile pic + "ยินดีต้อนรับสู่โครงการ"
3. Fill in ชื่อ, นามสกุล, email → click "ถัดไป"
4. TOU page appears — scroll disabled until bottom reached
5. After scrolling, checkbox enables → check it → "ยืนยัน" becomes active
6. Click "ยืนยัน" → POST to `/auth/liff/guest-register` → Done step appears
7. Click "ดูโปรไฟล์" → lands on `/profile`
8. Profile shows GUEST badge + amber "เชื่อมบัญชีที่มีอยู่" card

**Flow B — Existing account user (via Welcome page link):**
1. On `/welcome` form — click "เชื่อมบัญชี →" link at bottom
2. Navigates to `/auth` — sees "เชื่อมต่อบัญชี" with email + password fields
3. Enter valid credentials → "ถัดไป" → TOU → "ยืนยัน" → lands on `/profile`
4. Profile shows correct role (not GUEST) → no amber card shown

**Flow C — GUEST user revisiting (already linked):**
1. Open LIFF → `verifyLiff` succeeds → lands on `/` (TaskPage)
2. Click profile icon → `/profile` → GUEST amber card visible
3. Click "เชื่อมบัญชีที่มีอยู่" → `/auth` → link flow works

**Flow D — Non-GUEST linked user:**
1. `/profile` → no amber card shown (role is CARE_GIVER, CASE_MANAGER, etc.)
