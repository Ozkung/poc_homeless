# Patient Photo Upload (Create/Update Forms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let CASE_MANAGER/ADMIN/CARE_GIVER/MEDICAL_VOLUNTEER/SUPER_ADMIN attach or replace a patient's photo from the normal Create and Edit forms, fixing a pre-existing authorization bug that makes the upload endpoint currently unusable by any of them.

**Architecture:** Fix the backend's `updatePhoto()` authorization to branch on role (GUEST keeps its existing `reportedById` check for the LIFF flow; every other allowed role becomes org-scoped, matching `update()`'s existing model). Add one new reusable frontend component (`PatientPhotoInput`) styled after the existing profile-avatar pattern, and wire it into the two Create pages and the shared Edit drawer — in all three cases the actual file upload happens only after the patient record exists (at create-success or at save-time), not at file-selection time.

**Tech Stack:** NestJS + Prisma backend (existing `multer`/`FileInterceptor` upload endpoint, unchanged), Next.js + antd frontend.

## Global Constraints

- GUEST's existing `reportedById === userId` authorization for `POST /patients/:id/photo` must be preserved exactly — this plan must not touch the LIFF guest-report flow's security model.
- The newly-granted org-scoped access applies to exactly these roles: `CASE_MANAGER`, `ADMIN`, `CARE_GIVER`, `MEDICAL_VOLUNTEER`, `SUPER_ADMIN` (the same set already allowed to `POST /patients`). `DOCTOR` remains blocked (it's in the endpoint's `@Roles()` list today but was already non-functional there via the old check, and cannot create patients, so this is not a regression).
- Allowed file types: `image/jpeg`, `image/png`, `image/webp`; max size 5MB — both already enforced server-side; the new frontend component must enforce the same limits client-side for immediate feedback.
- No "remove photo" UI — only add-at-create or replace-at-edit.
- Upload happens at Save/Submit time, not at file-selection time, in both Create and Edit.

---

### Task 1: Fix `updatePhoto()` authorization

**Files:**
- Modify: `apps/backend/src/modules/patients/patients.service.ts`
- Modify: `apps/backend/src/modules/patients/patients.controller.ts`
- Create: `apps/backend/src/modules/patients/test/patient-photo.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PatientsService.updatePhoto(patientId: string, userId: string, userRole: string, orgId: string, photoUrl: string): Promise<{ photoUrl: string }>` — signature changes from the current `(patientId, userId, photoUrl)`, so both the controller call site and any other caller must be updated together in this task.

This task creates its own test file rather than adding to the existing
`apps/backend/src/modules/patients/test/patients.service.spec.ts`, because that file currently has
pre-existing, unrelated failing tests (confirmed before this plan was written) — keeping this
task's tests isolated avoids any risk of interacting with that unrelated breakage.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/modules/patients/test/patient-photo.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientsService } from '../patients.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AesGcmService } from '../../../common/crypto/aes-gcm.service';
import { NotificationsService } from '../../notifications/notifications.service';

const mockPrisma: any = {
  patient: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockCrypto = { encrypt: jest.fn(), decrypt: jest.fn() };
const mockNotifications = { enqueueSosAlert: jest.fn() };

describe('PatientsService — updatePhoto authorization', () => {
  let service: PatientsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AesGcmService, useValue: mockCrypto },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(PatientsService);
    jest.clearAllMocks();
  });

  describe('GUEST role', () => {
    it('allows upload when the guest is the one who reported the patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: 'user1', organizationId: 'org1' });
      mockPrisma.patient.update.mockResolvedValue({});

      const result = await service.updatePhoto('p1', 'user1', 'GUEST', 'org1', '/uploads/patients/x.jpg');

      expect(result).toEqual({ photoUrl: '/uploads/patients/x.jpg' });
      expect(mockPrisma.patient.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { photoUrl: '/uploads/patients/x.jpg' },
      });
    });

    it('rejects upload when the guest did not report this patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: 'someone-else', organizationId: 'org1' });

      await expect(
        service.updatePhoto('p1', 'user1', 'GUEST', 'org1', '/uploads/patients/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('CASE_MANAGER / ADMIN / CARE_GIVER / MEDICAL_VOLUNTEER / SUPER_ADMIN roles', () => {
    it.each(['CASE_MANAGER', 'ADMIN', 'CARE_GIVER', 'MEDICAL_VOLUNTEER', 'SUPER_ADMIN'])(
      'allows %s to upload a photo for any patient in their org, regardless of reportedById',
      async (role) => {
        mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: null, organizationId: 'org1' });
        mockPrisma.patient.update.mockResolvedValue({});

        const result = await service.updatePhoto('p1', 'some-user', role, 'org1', '/uploads/patients/x.jpg');

        expect(result).toEqual({ photoUrl: '/uploads/patients/x.jpg' });
        expect(mockPrisma.patient.update).toHaveBeenCalled();
      },
    );

    it('rejects when the patient belongs to a different organization', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ reportedById: null, organizationId: 'org2' });

      await expect(
        service.updatePhoto('p1', 'some-user', 'CASE_MANAGER', 'org1', '/uploads/patients/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });
  });

  it('throws NotFoundException when the patient does not exist', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePhoto('missing', 'user1', 'CASE_MANAGER', 'org1', '/uploads/patients/x.jpg'),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/backend
npx jest patient-photo.service.spec.ts
```

Expected: FAIL — `service.updatePhoto` is called with 5 arguments in the tests but the current method only accepts 3 (`patientId, userId, photoUrl`), and the current implementation's `select: { reportedById: true }` doesn't select `organizationId`, so the org-scoping tests will fail (either a TypeScript-level mismatch caught by ts-jest, or the assertions failing because the old code always checks `reportedById !== userId` regardless of role).

- [ ] **Step 3: Implement the fix**

In `apps/backend/src/modules/patients/patients.service.ts`, replace:

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

with:

```typescript
  async updatePhoto(
    patientId: string, userId: string, userRole: string, orgId: string, photoUrl: string,
  ): Promise<{ photoUrl: string }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { reportedById: true, organizationId: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const authorized = userRole === 'GUEST'
      ? patient.reportedById === userId
      : patient.organizationId === orgId;
    if (!authorized) {
      throw new ForbiddenException('ไม่มีสิทธิ์อัพโหลดรูปผู้ป่วยรายนี้');
    }

    await this.prisma.patient.update({
      where: { id: patientId },
      data: { photoUrl },
    });
    return { photoUrl };
  }
```

- [ ] **Step 4: Update the controller call site**

In `apps/backend/src/modules/patients/patients.controller.ts`, the `uploadPhoto` method currently ends with:

```typescript
    if (!file) throw new BadRequestException('ไม่พบไฟล์ภาพ');
    const photoUrl = `/uploads/patients/${file.filename}`;
    return this.patients.updatePhoto(id, user.sub, photoUrl);
```

Change the last line to:

```typescript
    if (!file) throw new BadRequestException('ไม่พบไฟล์ภาพ');
    const photoUrl = `/uploads/patients/${file.filename}`;
    return this.patients.updatePhoto(id, user.sub, user.role, user.orgId, photoUrl);
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest patient-photo.service.spec.ts
```

Expected: PASS — all 9 tests green (2 GUEST tests, 5 parameterized role tests + 1 cross-org rejection, 1 not-found test).

- [ ] **Step 6: Type-check and run the full backend test suite to confirm no regression**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: `tsc` exits 0. Jest shows the same pre-existing unrelated failures as before this change (2 suites: `users.service.spec.ts`, `patients.service.spec.ts` — confirmed pre-existing and unrelated to this work before this plan started), plus the new `patient-photo.service.spec.ts` suite passing.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/patients/patients.service.ts apps/backend/src/modules/patients/patients.controller.ts apps/backend/src/modules/patients/test/patient-photo.service.spec.ts
git commit -m "fix: allow CM/Admin/CareGiver/MedVol/SuperAdmin to upload patient photos org-wide"
```

---

### Task 2: `PatientPhotoInput` component

**Files:**
- Create: `apps/frontend/src/components/patients/PatientPhotoInput.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a React component `PatientPhotoInput` with props `{ photoUrl?: string | null; onChange: (file: File | null) => void }` — consumed by Tasks 3 and 4.

No automated test for this task — no frontend component in this repo has a test file (confirmed convention); verification is type-check only, matching every other frontend task in this codebase's history.

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0. (This component isn't imported anywhere yet, so this only confirms the file itself is valid TypeScript — Tasks 3/4 confirm it type-checks correctly once wired in.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/patients/PatientPhotoInput.tsx
git commit -m "feat: add PatientPhotoInput component for patient photo upload"
```

---

### Task 3: Wire photo upload into both Create forms

**Files:**
- Modify: `apps/frontend/src/app/(cm)/cm/patients/new/page.tsx`
- Modify: `apps/frontend/src/app/(admin)/admin/patients/new/page.tsx`

**Interfaces:**
- Consumes: `PatientPhotoInput` (Task 2) — props `{ photoUrl?: string | null; onChange: (file: File | null) => void }`. `POST /patients`'s response includes `.id` (confirmed: `PatientsService.create()` returns `this.decrypt(patient)`, which spreads the full Prisma record).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import and state to `apps/frontend/src/app/(cm)/cm/patients/new/page.tsx`**

Add this import alongside the existing ones:

```tsx
import PatientPhotoInput from '@/components/patients/PatientPhotoInput';
```

Add this state alongside the existing `const [saving, setSaving] = useState(false);`:

```tsx
  const [photoFile, setPhotoFile] = useState<File | null>(null);
```

- [ ] **Step 2: Add the upload step to `handleSubmit` in the same file**

Replace:

```tsx
      const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success('เพิ่มผู้ป่วยเรียบร้อย');
        router.push('/cm/patients');
      } else {
        message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
```

with:

```tsx
      const res = await fetch(`${API_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        if (photoFile) {
          const photoForm = new FormData();
          photoForm.append('photo', photoFile);
          const photoRes = await fetch(`${API_URL}/patients/${created.id}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.accessToken}` },
            body: photoForm,
          });
          if (!photoRes.ok) {
            message.warning('สร้างผู้ป่วยสำเร็จ แต่ไม่สามารถอัปโหลดรูปได้');
          }
        }
        message.success('เพิ่มผู้ป่วยเรียบร้อย');
        router.push('/cm/patients');
      } else {
        message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
```

- [ ] **Step 3: Render the component in the form**

In the same file, add the photo input as the first field inside `<Form ...>`, right before the `{/* ── ชื่อ-นามสกุล ── */}` comment:

```tsx
          <PatientPhotoInput onChange={setPhotoFile} />

          {/* ── ชื่อ-นามสกุล ── */}
```

- [ ] **Step 4: Repeat Steps 1-3 for `apps/frontend/src/app/(admin)/admin/patients/new/page.tsx`**

Same import, same `photoFile` state, same `handleSubmit` change (identical — this file's `handleSubmit` body is byte-for-byte the same shape, just redirecting to `/admin/patients` instead of `/cm/patients`), and render `<PatientPhotoInput onChange={setPhotoFile} />` as the first field inside its `<Form ...>`, right before the first `<Row gutter={16}>` (this file has no `{/* ── ชื่อ-นามสกุล ── */}` comment, so anchor on the first `<Row gutter={16}>` block instead).

- [ ] **Step 5: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/frontend/src/app/(cm)/cm/patients/new/page.tsx" "apps/frontend/src/app/(admin)/admin/patients/new/page.tsx"
git commit -m "feat: add photo upload to patient create forms (cm + admin)"
```

---

### Task 4: Wire photo upload into the patient Edit drawer

**Files:**
- Modify: `apps/frontend/src/components/patients/PatientEditDrawer.tsx`
- Modify: `apps/frontend/src/components/patients/PatientDetailPage.tsx`

**Interfaces:**
- Consumes: `PatientPhotoInput` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add `photoUrl` to `PatientEditDrawer`'s props interface**

In `apps/frontend/src/components/patients/PatientEditDrawer.tsx`, change:

```tsx
interface PatientEditProps {
  patientId: string;
  token: string;
  initialValues: {
    name: string;
    age?: number;
    gender?: string;
    status: string;
    locationText?: string;
    conditions: string[];
    initialComplaint?: string;
    phone?: string;
    birthDate?: string;
    nationalId?: string;
  };
  onSuccess?: () => void;
}
```

to:

```tsx
interface PatientEditProps {
  patientId: string;
  token: string;
  initialValues: {
    name: string;
    age?: number;
    gender?: string;
    status: string;
    locationText?: string;
    conditions: string[];
    initialComplaint?: string;
    phone?: string;
    birthDate?: string;
    nationalId?: string;
    photoUrl?: string | null;
  };
  onSuccess?: () => void;
}
```

- [ ] **Step 2: Add the import and photo-file state**

Add this import alongside the existing ones:

```tsx
import PatientPhotoInput from './PatientPhotoInput';
```

Add this state alongside the existing `const [saving, setSaving] = useState(false);`:

```tsx
  const [photoFile, setPhotoFile] = useState<File | null>(null);
```

- [ ] **Step 3: Reset the photo file when the drawer opens**

In `handleOpen()`, add `setPhotoFile(null);` right after `setOpen(true);`:

```tsx
  function handleOpen() {
    const nameParts = initialValues.name.trim().split(' ');
    form.setFieldsValue({
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      age: initialValues.age,
      gender: initialValues.gender,
      status: initialValues.status,
      locationText: initialValues.locationText,
      conditions: initialValues.conditions.join(', '),
      initialComplaint: initialValues.initialComplaint,
      phone: initialValues.phone,
      birthDate: initialValues.birthDate ? dayjs(initialValues.birthDate) : undefined,
      nationalId: initialValues.nationalId,
    });
    setOpen(true);
    setPhotoFile(null);
  }
```

- [ ] **Step 4: Add the photo upload step to `handleSubmit`**

Replace:

```tsx
      const res = await fetch(`${API_URL}/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success('อัปเดตข้อมูลผู้ป่วยแล้ว');
        setOpen(false);
        if (onSuccess) { onSuccess(); } else { router.refresh(); }
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
```

with:

```tsx
      const res = await fetch(`${API_URL}/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (photoFile) {
          const photoForm = new FormData();
          photoForm.append('photo', photoFile);
          const photoRes = await fetch(`${API_URL}/patients/${patientId}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: photoForm,
          });
          if (!photoRes.ok) {
            message.warning('บันทึกข้อมูลแล้ว แต่ไม่สามารถอัปโหลดรูปได้');
          }
        }
        message.success('อัปเดตข้อมูลผู้ป่วยแล้ว');
        setOpen(false);
        if (onSuccess) { onSuccess(); } else { router.refresh(); }
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
```

- [ ] **Step 5: Render the component in the drawer's form**

Add it as the first item inside `<Form form={form} layout="vertical" onFinish={handleSubmit}>`, right before the `<Form.Item label="ชื่อ-นามสกุล">` block:

```tsx
          <PatientPhotoInput photoUrl={initialValues.photoUrl} onChange={setPhotoFile} />

          <Form.Item label="ชื่อ-นามสกุล">
```

- [ ] **Step 6: Pass `photoUrl` through from `PatientDetailPage.tsx`**

In `apps/frontend/src/components/patients/PatientDetailPage.tsx`, the `<PatientEditDrawer>` call currently ends its `initialValues` object with:

```tsx
                nationalId: patient.nationalId,
              }}
```

Change to:

```tsx
                nationalId: patient.nationalId,
                photoUrl: patient.photoUrl,
              }}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend
npx tsc --noEmit -p tsconfig.json
```

Expected: exits 0, no errors. (If this fails because `patient.photoUrl` doesn't exist on whatever type `patient` has in `PatientDetailPage.tsx`, read that file's patient type definition and add `photoUrl?: string | null` to it — the field already exists on the backend response since `Patient.photoUrl` is a real Prisma column, so this would only be a frontend type annotation gap, not a backend change.)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/patients/PatientEditDrawer.tsx apps/frontend/src/components/patients/PatientDetailPage.tsx
git commit -m "feat: add photo upload to patient edit drawer"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild both containers**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
docker compose up -d --build backend_hl frontend_hl
```

Expected: both containers report `Built`/`Started`, no errors.

- [ ] **Step 2: Verify the authorization fix live — a CASE_MANAGER can now upload a photo for a patient they didn't personally report**

```bash
cd /Users/tae/Desktop/playground/poc_homeless
python3 -c "
from PIL import Image
img = Image.new('RGB', (10, 10), color='red')
img.save('/tmp/test-patient-photo.jpg')
" 2>/dev/null || printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/test-patient-photo.jpg

TOKEN=$(curl -s -X POST http://localhost:8085/auth/login -H "Content-Type: application/json" -d '{"email":"cm1@hospital.th","password":"CaseManager1!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

# Create a patient (as CM, so reportedById will be null, caseManagerId will be set)
PATIENT_ID=$(curl -s -X POST http://localhost:8085/patients -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ทดสอบ อัปโหลดรูป","status":"PENDING"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "created patient: $PATIENT_ID"

# Upload a photo for that patient — this MUST succeed now (previously always 403)
curl -s -o /dev/null -w "photo upload status: %{http_code}\n" -X POST "http://localhost:8085/patients/$PATIENT_ID/photo" \
  -H "Authorization: Bearer $TOKEN" -F "photo=@/tmp/test-patient-photo.jpg;type=image/jpeg"

rm -f /tmp/test-patient-photo.jpg
```

Expected: `photo upload status: 201` (or `200`, whichever the endpoint's `@HttpCode` — check the actual response; the key thing is NOT `403`, which is what this exact flow returned before Task 1).

- [ ] **Step 3: Browser check — patient Create form (CM) shows the photo picker and it works end-to-end**

Log in as `cm1@hospital.th` / `CaseManager1!` at `http://localhost:8080/login`, go to "เพิ่มผู้ป่วย" under ผู้ป่วย, confirm a circular photo placeholder with a camera icon appears above the name fields, click it, select a small JPEG/PNG file, confirm a preview appears in the circle, fill in the required fields (ชื่อ, นามสกุล, สถานะ), submit, and confirm success — then open the newly created patient's detail page and confirm the uploaded photo displays.

- [ ] **Step 4: Browser check — patient Edit drawer shows and preserves the existing photo, and replacing it works**

From the same patient's detail page, click "แก้ไขข้อมูล", confirm the drawer's photo picker shows the photo just uploaded in Step 3 (not a blank placeholder), select a different image file, confirm the preview updates, click "บันทึก", and confirm the detail page now shows the new photo.

- [ ] **Step 5: Report results**

No commit for this task — it's a verification checkpoint. If any step fails, go back to the relevant task and fix before considering this plan done.

---

## Self-Review Notes

- **Spec coverage:** authorization fix (role-branch, org-scoped for non-GUEST) ✓ Task 1; GUEST behavior preserved ✓ Task 1 (explicit test); reusable component matching the profile-avatar visual pattern ✓ Task 2; upload deferred to submit-time in both Create forms ✓ Task 3; upload deferred to submit-time in Edit, showing existing photo ✓ Task 4; no "remove photo" button ✓ (not implemented anywhere in this plan); LIFF flow untouched ✓ (no file in that flow is modified by this plan).
- **Placeholder scan:** none found — every step has complete, runnable code or an exact command.
- **Type consistency:** `PatientsService.updatePhoto`'s new 5-argument signature (`patientId, userId, userRole, orgId, photoUrl`) is used consistently at its only call site (Task 1, Step 4) and its only test file (Task 1, Step 1). `PatientPhotoInput`'s props (`photoUrl?: string | null`, `onChange: (file: File | null) => void`) are used identically in both consumers (Task 3's two Create pages call it with only `onChange`, since there's no existing photo yet; Task 4's Edit drawer calls it with both `photoUrl` and `onChange`).
