# LIFF Patient Photo Upload — Design Spec

**Date:** 2026-07-05  
**Status:** Approved

---

## Overview

เพิ่มฟีเจอร์ถ่ายรูปและอัพโหลดภาพผู้ป่วยใน LIFF guest-report flow โดยใช้ `<input type="file" accept="image/*" capture="environment">` เพื่อความเสถียรสูงสุดบน LINE WebView ทุก version

---

## User Flow

```
[ReportPage] กรอกฟอร์ม → กด "บันทึกผู้ป่วย"
     ↓ POST /patients/guest-report  → ได้ { id, hn }
[Success Screen] แสดง HN + ปุ่ม "ถ่ายรูปผู้ป่วย"
     ↓ <input capture="environment"> → เลือกรูป → preview thumbnail
     ↓ POST /patients/:id/photo (multipart/form-data)
[Success Screen] แสดง HN + รูปที่อัพโหลด + ปุ่ม "กลับหน้าหลัก"
```

รูปเป็น **optional** — ผู้ใช้ข้ามได้โดยกด "กลับหน้าหลัก" โดยตรง

---

## Architecture

### Backend

**1. Prisma migration**
- เพิ่ม field `photoUrl String?` ใน `Patient` model

**2. Endpoint ใหม่: `POST /patients/:id/photo`**
- Controller: `PatientsController`
- Guard: `JwtAuthGuard` + role `GUEST`
- Interceptor: `FileInterceptor('photo')` + `multer diskStorage`
- Storage destination: `uploads/patients/`
- Filename: `{uuid}{ext}`
- File validation:
  - MIME: `image/jpeg`, `image/png`, `image/webp` เท่านั้น
  - Max size: 5MB
- Authorization: ตรวจว่า patient ถูก report โดย user คนนั้น (`reportedById === userId`) ก่อน update
- Response: `{ photoUrl: "/uploads/patients/<filename>" }`
- Service method: `PatientsService.updatePhoto(patientId, userId, photoUrl)`

### LIFF (`apps/liff`)

**แก้ `ReportPage.tsx`:**
- หลัง submit สำเร็จ success screen แสดง:
  - ปุ่ม "ถ่ายรูปผู้ป่วย" (trigger hidden `<input type="file">`)
  - Preview thumbnail เมื่อเลือกรูปแล้ว
  - Upload อัตโนมัติทันทีที่ onChange fires
  - State: `idle` → `uploading` → `uploaded` (แสดงรูป) / `error`
- State เพิ่มเติม: `photoUrl: string | null`, `photoState: 'idle' | 'uploading' | 'uploaded' | 'error'`

**แก้ `api.ts`:**
- เพิ่ม `uploadPatientPhoto(patientId: string, file: File): Promise<{ photoUrl: string }>`
- ส่ง `FormData` (ไม่ใช่ JSON — ไม่ set `Content-Type` เพื่อให้ browser set boundary เอง)
- ใช้ `request()` helper แต่ override headers ไม่ให้ set `Content-Type: application/json`

### Admin Frontend (`apps/frontend`)

**แก้ `PatientDetailPage.tsx`:**
- แสดง `<img src={patient.photoUrl}>` ใน patient detail ถ้า `photoUrl` มีค่า
- ขนาด thumbnail: 120×120px, rounded, object-fit cover

---

## Error Handling

| สถานการณ์ | การจัดการ |
|---|---|
| รูปใหญ่เกิน 5MB | แสดง "รูปใหญ่เกินไป (max 5MB)" ใน LIFF |
| MIME ไม่ถูกต้อง | backend return 400, LIFF แสดง error |
| Upload network fail | แสดง error + ปุ่ม "ลองใหม่" |
| User อื่น upload ทับ | backend return 403 |
| ไม่ถ่ายรูป | ได้ปุ่ม "กลับหน้าหลัก" โดยตรง (optional) |

---

## Files to Change

| File | การเปลี่ยนแปลง |
|---|---|
| `apps/backend/prisma/schema.prisma` | เพิ่ม `photoUrl String?` ใน Patient |
| `apps/backend/src/modules/patients/patients.controller.ts` | เพิ่ม `POST :id/photo` endpoint |
| `apps/backend/src/modules/patients/patients.service.ts` | เพิ่ม `updatePhoto()` method |
| `apps/liff/src/lib/api.ts` | เพิ่ม `uploadPatientPhoto()` |
| `apps/liff/src/pages/ReportPage.tsx` | เพิ่ม photo capture UI ใน success screen |
| `apps/frontend/src/components/patients/PatientDetailPage.tsx` | แสดงรูปผู้ป่วย |
