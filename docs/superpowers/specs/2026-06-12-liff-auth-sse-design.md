# Spec #2 — LIFF สมัครสมาชิก / Link Account + Real-time Notification (SSE)

## Context

Rich Menu ปุ่ม "สมัครสมาชิก" เปิด LIFF ที่ `/auth` ให้ผู้ใช้เลือกว่าจะสมัครใหม่เป็น GUEST หรือผูก LINE ID เข้ากับบัญชีที่มีอยู่ หลังจากนั้นต้องยอมรับ Terms of Use และ Privacy Policy ก่อนดูข้อมูลสมาชิก เมื่อมีการลงทะเบียนหรือผูกบัญชี ระบบแจ้งเตือน CM และ Doctor ผ่าน SSE แบบ real-time

## Roles Allowed to Link LINE

GUEST, CASE_MANAGER, CARE_GIVER เท่านั้น ที่สามารถผูก LINE ID ได้ผ่านหน้านี้

---

## Backend

### 1. `POST /auth/liff/link`

- **Auth**: Public (ใช้ LINE idToken แทน JWT)
- **Body**: `{ idToken: string, email: string, password: string }`
- **Logic**:
  1. Verify LINE idToken → ได้ `lineUserId`
  2. ถ้า `lineUserId` ผูกกับ User อื่นแล้ว → 409 Conflict
  3. Login ด้วย email + password → ถ้าผิด → 401
  4. ตรวจ role ว่าเป็น GUEST / CASE_MANAGER / CARE_GIVER → ถ้าไม่ใช่ → 403
  5. Set `user.lineUserId = lineUserId`
  6. Emit SSE event `guest_joined` ไปยัง CM + DOCTOR ในองค์กรเดียวกัน
  7. Return `{ accessToken, refreshToken, role }`

### 2. SSE Notification Service

- **`GET /notifications/stream`** — ต้อง JWT auth
- Server เก็บ `Map<userId, Response>` ของ connected clients
- Heartbeat comment (`: ping`) ทุก 25 วิ กันให้ connection ไม่ timeout
- เมื่อ `guest-register` หรือ `link` สำเร็จ → emit ไปยัง User ที่มี role CM หรือ DOCTOR ในองค์กรเดียวกัน
- Event format: `data: {"type":"guest_joined","name":"สมชาย ใจดี","role":"GUEST"}\n\n`

### 3. Auth Service changes

- `guestRegister()` — เพิ่มการ emit `guest_joined` หลัง create user
- `link()` — emit `guest_joined` หลัง set lineUserId

---

## LIFF — `/auth` State Machine

```
[choice]
  ├─ "สมัครสมาชิกใหม่"   → [register]
  └─ "เชื่อมต่อบัญชี"    → [link]

[register] → POST /auth/liff/guest-register → [tou]
[link]     → POST /auth/liff/link           → [tou]
[tou]      → scroll + checkbox confirm      → [done]
[done]     → profile card (ชื่อ, role, zone)
```

### Choice Screen
- Card 2 ปุ่มใหญ่ พื้นหลังสี LINE green (#06c755)
- ปุ่มซ้าย: "สมัครสมาชิกใหม่" (icon 📝)
- ปุ่มขวา: "เชื่อมต่อบัญชี" (icon 🔗)

### Register Step
- ใช้ GuestRegisterPage เดิมที่มีอยู่แล้ว (refactor เป็น component แยก)
- Fields: ชื่อ, นามสกุล, email*, เบอร์โทร, zone dropdown

### Link Step
- Fields: email*, password*
- ข้อความ: "ใส่ email และรหัสผ่านของบัญชีที่มีอยู่ในระบบ"
- Error states: "email/รหัสผ่านไม่ถูกต้อง", "บัญชีนี้ไม่รองรับการผูก LINE"

### Terms of Use Screen
- Hardcode text ภาษาไทย (Terms + Privacy แยก section)
- Scroll container ความสูง fixed (~60vh) พร้อม indicator แสดงว่า scroll ถึงล่างหรือยัง
- Checkbox "ข้าพเจ้ายอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว" — enable หลัง scroll ถึงล่าง
- ปุ่ม "ยืนยัน" disabled จนกว่าจะ check

### Done Screen
- Card แสดง: ชื่อ, role tag, zone (ถ้ามี), email
- ข้อความ "ลงทะเบียนสำเร็จ! ยินดีต้อนรับสู่โครงการ"

---

## Web App — CM + Doctor Real-time Toast

### SSE Client Hook (`useNotificationStream`)
```typescript
// Custom hook ใช้ร่วมกันได้ทั้ง CM และ Doctor layouts
// - เชื่อมต่อ EventSource ที่ /api/notifications/stream
// - Auto-reconnect ด้วย exponential backoff (1s, 2s, 4s, max 30s)
// - `onMessage(event)` → message.info() toast
```

### CM Layout (`(cm)/layout.tsx`)
- Mount `useNotificationStream` พร้อม token
- Toast: "🎉 {ชื่อ} ({role}) เข้าร่วมระบบแล้ว"

### Doctor Layout (`(doctor)/layout.tsx`)
- เหมือนกัน

---

## Error Handling

| Scenario | Response |
|---|---|
| LINE idToken invalid | 401 "Invalid LIFF token" |
| lineUserId ผูกแล้ว | 409 "LINE account already registered" |
| email/password ผิด | 401 "อีเมลหรือรหัสผ่านไม่ถูกต้อง" |
| Role ไม่ได้รับอนุญาต | 403 "บัญชีนี้ไม่รองรับการผูก LINE" |
| SSE connection drop | client reconnects อัตโนมัติ |

---

## Out of Scope (spec นี้)

- Rich Menu configuration (spec #1)
- Points system (spec #3)
- ข้อมูลสมาชิก full page (spec #3)
- ตรวจผู้ป่วย / SSE patient status (spec #5)
