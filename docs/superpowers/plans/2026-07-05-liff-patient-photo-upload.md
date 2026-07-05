# LIFF Patient Photo Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้ LIFF ถ่ายรูปผู้ป่วยหลัง guest-report สำเร็จ แล้วอัพโหลดแสดงใน success screen และ admin patient detail page

**Architecture:** Two-step flow — สร้าง patient ก่อน (ได้ id) → แล้วค่อย upload รูปผ่าน `POST /patients/:id/photo` แยก multipart request. Backend ใช้ multer diskStorage (pattern เดียวกับ avatar upload ที่มีอยู่แล้ว). LIFF ใช้ `<input type="file" accept="image/*" capture="environment">` เพื่อ compatibility สูงสุดบน LINE WebView.

**Tech Stack:** NestJS + Prisma (backend), React + Vite (LIFF), Next.js + Ant Design (admin frontend), multer (file upload)

## Global Constraints

- File types accepted: `image/jpeg`, `image/png`, `image/webp` เท่านั้น
- Max file size: 5MB
- Storage path: `uploads/patients/` (relative to backend cwd)
- Static serve path: `/uploads/patients/<filename>` (ผ่าน ServeStaticModule ที่มีอยู่แล้ว)
- Authorization: GUEST user upload ได้เฉพาะ patient ที่ตัวเองสร้าง (`reportedById === userId`)
- Patient photo เป็น optional — user ข้ามได้

---

## File Map

| File | Action | เหตุผล |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modify | เพิ่ม `photoUrl` และ `reportedById` ใน Patient model |
| `apps/backend/src/modules/patients/patients.service.ts` | Modify | เพิ่ม `updatePhoto()`, แก้ `guestReport()` เก็บ `reportedById` |
| `apps/backend/src/modules/patients/patients.controller.ts` | Modify | เพิ่ม `POST :id/photo` endpoint |
| `apps/liff/src/lib/api.ts` | Modify | เพิ่ม `uploadPatientPhoto()` |
| `apps/liff/src/pages/ReportPage.tsx` | Modify | เพิ่ม photo capture UI ใน success screen |
| `apps/frontend/src/components/patients/PatientDetailPage.tsx` | Modify | เพิ่ม `photoUrl` ใน Patient interface + แสดงรูป |

---

## Task 1: Prisma — เพิ่ม photoUrl และ reportedById ใน Patient model

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (Patient model, บรรทัด 159–191)
- Modify: `apps/backend/src/modules/patients/patients.service.ts` (method `guestReport`, บรรทัด 73–110)

**Interfaces:**
- Produces: `Patient.photoUrl: String?`, `Patient.reportedById: String?`
- Produces: `guestReport()` เก็บ `reportedById: actorId` ตอนสร้าง patient

- [ ] **Step 1: เพิ่ม fields ใน schema.prisma**

ใน `apps/backend/prisma/schema.prisma` ให้เพิ่ม 2 บรรทัดนี้ใน Patient model ก่อน `createdAt`:

```prisma
  photoUrl         String?
  reportedById     String?
```

Patient model หลังแก้ (เฉพาะส่วนที่เปลี่ยน):
```prisma
model Patient {
  id               String        @id @default(uuid())
  organizationId   String
  organization     Organization  @relation(fields: [organizationId], references: [id])
  caseManagerId    String?
  caseManager      User?         @relation("ManagedPatients", fields: [caseManagerId], references: [id])
  nameEnc          String
  hn               String        @unique
  age              Int?
  gender           Gender?
  status           PatientStatus @default(PENDING)
  conditions       String[]
  initialComplaint String?
  locationText     String?
  phone            String?
  birthDate        DateTime?
  nationalIdEnc    String?
  followUpTarget   Int?
  zoneId           String?
  zone             Zone?         @relation(fields: [zoneId], references: [id])
  photoUrl         String?
  reportedById     String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  submissions         Submission[]
  activities          Activity[]
  eventTasks          EventTask[]
  carePlanItems       CarePlanItem[]
  carePlanAssessments CarePlanAssessment[]
  alerts              Alert[]
  diagnoses           Diagnosis[]
  prescriptions       Prescription[]
}
```

- [ ] **Step 2: รัน migration**

```bash
cd apps/backend && npx prisma migrate dev --name add_patient_photo_and_reporter
```

Expected output: `✔  Generated Prisma Client` และมี migration file ใหม่ใน `prisma/migrations/`

- [ ] **Step 3: แก้ guestReport() ให้เก็บ reportedById**

ใน `apps/backend/src/modules/patients/patients.service.ts` แก้ `prisma.patient.create` ใน `guestReport()` (บรรทัดประมาณ 92–108) เพิ่ม field:

```typescript
const patient = await this.prisma.patient.create({
  data: {
    organizationId: orgId,
    nameEnc: this.crypto.encrypt(name),
    hn,
    age: data.age,
    gender: data.gender as any,
    status: (data.status as any) ?? 'PENDING',
    conditions: data.conditions ?? [],
    initialComplaint: data.initialComplaint,
    locationText: data.locationText,
    phone: data.phone,
    birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    nationalIdEnc: data.nationalId ? this.crypto.encrypt(data.nationalId) : undefined,
    zoneId: actor?.preferredZoneId ?? null,
    reportedById: actorId,
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations apps/backend/src/modules/patients/patients.service.ts
git commit -m "feat: add photoUrl and reportedById to Patient model"
```

---

## Task 2: Backend — endpoint POST /patients/:id/photo

**Files:**
- Modify: `apps/backend/src/modules/patients/patients.service.ts` — เพิ่ม `updatePhoto()`
- Modify: `apps/backend/src/modules/patients/patients.controller.ts` — เพิ่ม endpoint

**Interfaces:**
- Consumes: `Patient.reportedById` (จาก Task 1)
- Produces: `PatientsService.updatePhoto(patientId: string, userId: string, photoUrl: string): Promise<{ photoUrl: string }>`
- Produces: `POST /patients/:id/photo` returns `{ photoUrl: string }`

- [ ] **Step 1: เพิ่ม updatePhoto() ใน PatientsService**

เพิ่ม method ต่อไปนี้ใน `apps/backend/src/modules/patients/patients.service.ts` ก่อน private method `decrypt()` (บรรทัดประมาณ 293):

```typescript
async updatePhoto(patientId: string, userId: string, photoUrl: string): Promise<{ photoUrl: string }> {
  const patient = await this.prisma.patient.findUnique({
    where: { id: patientId },
    select: { reportedById: true },
  });
  if (!patient) throw new NotFoundException('Patient not found');
  if (patient.reportedById !== userId) {
    throw new ForbiddenException('ไม่มีสิทธิ์อัพโหลดรูปผู้ป่วยรายนี้');
  }
  await this.prisma.patient.update({
    where: { id: patientId },
    data: { photoUrl },
  });
  return { photoUrl };
}
```

เพิ่ม import `ForbiddenException` ที่บรรทัด 1:
```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
```

- [ ] **Step 2: เพิ่ม endpoint ใน PatientsController**

ใน `apps/backend/src/modules/patients/patients.controller.ts` เพิ่ม imports:
```typescript
import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
```

เพิ่ม storage config หลัง imports (บรรทัดก่อน `@Controller`):
```typescript
const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

const patientPhotoStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'patients'),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});
```

เพิ่ม endpoint ใน class `PatientsController` หลัง `guestReport()` method (บรรทัดประมาณ 168):
```typescript
@Post(':id/photo')
@Roles(UserRole.GUEST)
@UseInterceptors(
  FileInterceptor('photo', {
    storage: patientPhotoStorage,
    limits: { fileSize: MAX_PHOTO_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_PHOTO_MIME.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('รองรับเฉพาะไฟล์ภาพ JPEG, PNG, WebP'), false);
      }
    },
  }),
)
async uploadPhoto(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: JwtPayload,
) {
  if (!file) throw new BadRequestException('ไม่พบไฟล์ภาพ');
  const photoUrl = `/uploads/patients/${file.filename}`;
  return this.patients.updatePhoto(id, user.sub, photoUrl);
}
```

- [ ] **Step 3: สร้าง uploads/patients/ directory**

```bash
mkdir -p apps/backend/uploads/patients
```

ตรวจ ServeStaticModule ใน `apps/backend/src/app.module.ts` ว่า rootPath ชี้ถูก:
```bash
grep -n "rootPath\|serveRoot" apps/backend/src/app.module.ts
```
Expected: `rootPath: join(__dirname, '..', '..', 'uploads')` และ `serveRoot: '/uploads'` — ถ้าใช่แสดงว่า `/uploads/patients/xxx.jpg` serve ได้ทันที ไม่ต้องแก้อะไรเพิ่ม

- [ ] **Step 4: ทดสอบด้วย curl**

เริ่ม backend:
```bash
cd apps/backend && npm run start:dev
```

ทดสอบ (ต้องมี GUEST token จริงจาก LIFF login ก่อน):
```bash
curl -X POST http://localhost:3001/patients/<patient-id>/photo \
  -H "Authorization: Bearer <guest-token>" \
  -F "photo=@/path/to/test.jpg"
```

Expected response:
```json
{ "photoUrl": "/uploads/patients/<uuid>.jpg" }
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/patients/patients.controller.ts apps/backend/src/modules/patients/patients.service.ts
git commit -m "feat: add POST /patients/:id/photo endpoint"
```

---

## Task 3: LIFF api.ts — เพิ่ม uploadPatientPhoto()

**Files:**
- Modify: `apps/liff/src/lib/api.ts`

**Interfaces:**
- Consumes: `accessToken` (จาก `getToken()` ที่มีอยู่แล้ว), `API_URL` (env var)
- Produces: `api.uploadPatientPhoto(patientId: string, file: File): Promise<{ photoUrl: string }>`

- [ ] **Step 1: เพิ่ม uploadPatientPhoto ใน api object**

ใน `apps/liff/src/lib/api.ts` เพิ่ม method ต่อไปนี้ต่อจาก `guestReportPatient` (ก่อนวงเล็บปิด `}`):

```typescript
uploadPatientPhoto: async (patientId: string, file: File): Promise<{ photoUrl: string }> => {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`${API_URL}/patients/${patientId}/photo`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error((err as any).message ?? 'อัพโหลดรูปไม่สำเร็จ'), { status: res.status });
  }
  return res.json();
},
```

หมายเหตุ: ไม่ set `Content-Type` ใน headers — ต้องให้ browser set `multipart/form-data; boundary=...` เองโดยอัตโนมัติ

- [ ] **Step 2: Commit**

```bash
git add apps/liff/src/lib/api.ts
git commit -m "feat(liff): add uploadPatientPhoto API method"
```

---

## Task 4: LIFF ReportPage — photo capture UI ใน success screen

**Files:**
- Modify: `apps/liff/src/pages/ReportPage.tsx`

**Interfaces:**
- Consumes: `api.uploadPatientPhoto(patientId, file)` (จาก Task 3)
- Consumes: `result: { id: string; hn: string }` (state ที่มีอยู่แล้ว)
- Produces: success screen พร้อม photo capture + preview + upload

- [ ] **Step 1: เพิ่ม photo state และ handlePhoto function**

ใน `ReportPage.tsx` เพิ่ม state ใหม่หลัง state ที่มีอยู่ (หลังบรรทัด `const [result, setResult] = ...`):

```tsx
const [photoUrl, setPhotoUrl] = useState<string | null>(null);
const [photoState, setPhotoState] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
const [photoError, setPhotoError] = useState('');
```

เพิ่ม function `handlePhoto` หลัง `submit` function:

```tsx
async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !result) return;

  if (file.size > 5 * 1024 * 1024) {
    setPhotoError('รูปใหญ่เกินไป (max 5MB)');
    setPhotoState('error');
    return;
  }

  setPhotoState('uploading');
  setPhotoError('');
  try {
    const data = await api.uploadPatientPhoto(result.id, file);
    setPhotoUrl(data.photoUrl);
    setPhotoState('uploaded');
  } catch (err: any) {
    setPhotoError(err.message ?? 'อัพโหลดรูปไม่สำเร็จ');
    setPhotoState('error');
  }
}
```

- [ ] **Step 2: แก้ success screen ให้แสดง photo UI**

แทนที่ success screen เดิม (บรรทัด 67–82 ใน ReportPage.tsx) ด้วย:

```tsx
if (result) return (
  <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ textAlign: 'center', maxWidth: 320, width: '100%' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 34 }}>✅</div>
      <h2 style={{ fontWeight: 700, fontSize: 18, color: '#0F172A', marginBottom: 8 }}>ส่งข้อมูลสำเร็จ</h2>
      <p style={{ fontSize: 14, color: '#64748B', marginBottom: 4 }}>ทีมงานจะติดตามผู้ป่วยรายนี้</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 24 }}>{result.hn}</p>

      {/* Photo section */}
      {photoState === 'uploaded' && photoUrl ? (
        <div style={{ marginBottom: 20 }}>
          <img
            src={`${import.meta.env.VITE_API_URL}${photoUrl}`}
            alt="รูปผู้ป่วย"
            style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', border: '2px solid #E2E8F0' }}
          />
          <p style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>บันทึกรูปผู้ป่วยแล้ว</p>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <input
            id="patient-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhoto}
          />
          <label
            htmlFor="patient-photo-input"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              background: photoState === 'uploading' ? '#CBD5E1' : '#F1F5F9',
              color: photoState === 'uploading' ? '#94A3B8' : '#334155',
              border: '1px dashed #CBD5E1',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              cursor: photoState === 'uploading' ? 'default' : 'pointer',
              pointerEvents: photoState === 'uploading' ? 'none' : 'auto',
            }}
          >
            {photoState === 'uploading' ? 'กำลังอัพโหลด...' : '📷 ถ่ายรูปผู้ป่วย'}
          </label>
          {photoState === 'error' && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: '#EF4444', margin: '0 0 6px' }}>{photoError}</p>
              <label
                htmlFor="patient-photo-input"
                style={{ fontSize: 12, color: ACCENT, cursor: 'pointer', textDecoration: 'underline' }}
              >
                ลองใหม่
              </label>
            </div>
          )}
          {photoState === 'idle' && (
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>ไม่บังคับ — สามารถข้ามได้</p>
          )}
        </div>
      )}

      <button
        onClick={() => navigate('/')}
        style={{ padding: '12px 32px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
      >
        กลับหน้าหลัก
      </button>
    </div>
  </div>
);
```

- [ ] **Step 3: ตรวจสอบ TypeScript compile ไม่มี error**

```bash
cd apps/liff && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/liff/src/pages/ReportPage.tsx
git commit -m "feat(liff): add patient photo capture to success screen"
```

---

## Task 5: Admin Frontend — แสดงรูปผู้ป่วยใน PatientDetailPage

**Files:**
- Modify: `apps/frontend/src/components/patients/PatientDetailPage.tsx`

**Interfaces:**
- Consumes: `patient.photoUrl: string | undefined` (จาก backend API response — มีอยู่แล้วหลัง Prisma migration Task 1)

- [ ] **Step 1: เพิ่ม photoUrl ใน Patient interface**

ใน `PatientDetailPage.tsx` แก้ interface `Patient` (บรรทัด 8–13):

```typescript
interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE' | 'MISSING';
  age?: number; gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[]; initialComplaint?: string; locationText?: string;
  photoUrl?: string;
}
```

- [ ] **Step 2: แสดงรูปใน info tab**

ในส่วน `'info'` tab ของ `tabs` array (บรรทัดประมาณ 100–126) เพิ่ม photo display ก่อน `<Descriptions>`:

```tsx
{
  key: 'info',
  label: 'ข้อมูล',
  children: (
    <>
      {patient.photoUrl && (
        <div style={{ marginBottom: 16 }}>
          <img
            src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}${patient.photoUrl}`}
            alt="รูปผู้ป่วย"
            style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', border: '1px solid #f0f0f0' }}
          />
        </div>
      )}
      <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" styles={{ label: { color: '#aaa', fontSize: 11 } }}>
        {/* ... เนื้อหาเดิมทั้งหมด ... */}
      </Descriptions>
    </>
  ),
},
```

หมายเหตุ: ต้องใช้ `process.env.NEXT_PUBLIC_API_URL` สำหรับ Next.js client-side image (แต่ component นี้เป็น Server Component ดังนั้นใช้ `process.env.API_URL` ได้เลย ไม่ต้อง NEXT_PUBLIC):

```tsx
src={`${process.env.API_URL ?? 'http://localhost:3001'}${patient.photoUrl}`}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/patients/PatientDetailPage.tsx
git commit -m "feat(frontend): show patient photo in PatientDetailPage"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Prisma migration — Task 1
- ✅ POST /patients/:id/photo endpoint — Task 2
- ✅ File validation (MIME + size) — Task 2 Step 1
- ✅ Authorization (reportedById) — Task 2 Step 1 + Task 1 Step 3
- ✅ api.uploadPatientPhoto() — Task 3
- ✅ Photo capture UI in LIFF success screen — Task 4
- ✅ Preview thumbnail — Task 4 Step 2
- ✅ idle/uploading/uploaded/error states — Task 4
- ✅ Error messages (>5MB, network fail, retry) — Task 4 Steps 1–2
- ✅ Optional photo (skip button) — Task 4 Step 2
- ✅ Admin frontend photo display — Task 5

**No placeholders:** ตรวจแล้ว — code blocks ครบทุก step

**Type consistency:**
- `uploadPatientPhoto(patientId: string, file: File)` — Task 3 defines, Task 4 consumes ✅
- `updatePhoto(patientId: string, userId: string, photoUrl: string)` — Task 2 service defines, controller consumes ✅
- `patient.photoUrl?: string` — Task 1 adds to DB, Task 5 reads ✅
