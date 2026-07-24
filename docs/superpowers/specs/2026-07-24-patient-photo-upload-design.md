# Patient Photo Upload (Create/Update Forms) — Design

## Context

CASE_MANAGER and ADMIN (and other roles that can create/edit patients) need to attach a photo to
a patient record from the normal dashboard Create/Edit forms. A photo-upload endpoint
(`POST /patients/:id/photo`) and a `Patient.photoUrl` field already exist, built for a *different*
use case — the LIFF guest self-report flow — and its authorization is scoped to
`reportedById === userId` (the guest who filed the report). That check makes the endpoint
effectively **unusable by CM/Admin today**: when a patient is created via the normal dashboard
`create()` flow, `reportedById` is never set (only `caseManagerId` is), so the check always fails
with a 403 regardless of who's asking. This work both fixes that authorization gap and adds the
missing upload UI to the Create and Edit forms.

## Backend: authorization fix

In `apps/backend/src/modules/patients/patients.service.ts`, `updatePhoto()` currently does:

```typescript
const patient = await this.prisma.patient.findUnique({
  where: { id: patientId },
  select: { reportedById: true },
});
if (!patient) throw new NotFoundException('Patient not found');
if (patient.reportedById !== userId) {
  throw new ForbiddenException('ไม่มีสิทธิ์อัพโหลดรูปผู้ป่วยรายนี้');
}
```

Change the authorization to branch on the actor's role: if the role is `GUEST`, keep the exact
existing `reportedById === userId` check (preserves the LIFF flow's security model — a guest may
only touch the patient they personally reported). For every other role currently allowed to hit
this endpoint (`CASE_MANAGER`, `ADMIN`, `CARE_GIVER`, `MEDICAL_VOLUNTEER`, `SUPER_ADMIN` — the
same role set already permitted to create a patient via `POST /patients`), scope by
`patient.organizationId === orgId` instead, mirroring the existing `update()` method's
authorization model (which already trusts any of these roles to edit any patient in their org, not
just ones they personally created). `DOCTOR` is in the endpoint's `@Roles()` list today but cannot
create patients and is not part of this org-scoped grant — it remains blocked, exactly as it is
(uselessly, via the old check) today, so this is not a regression for that role.

This requires passing the caller's role into `updatePhoto()` and selecting `organizationId`
instead of just `reportedById` from the patient record.

## Frontend: reusable `PatientPhotoInput` component

New component: `apps/frontend/src/components/patients/PatientPhotoInput.tsx`. Visually modeled on
the existing avatar-upload pattern in `apps/frontend/src/components/profile/ProfilePage.tsx`
(circular photo, camera-icon overlay badge, hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`)
— reusing an established pattern rather than introducing antd's `<Upload>` as a second,
inconsistent style. Client-side validates mime type and the same 5MB limit the backend enforces,
showing an immediate error message rather than letting a bad file reach the server.

Unlike `ProfilePage`'s avatar uploader, this component does **not** upload on file selection. Both
Create and Edit need the photo to be sent at Save time (confirmed with the user), not the moment a
file is picked — for Create, the patient doesn't have an `id` yet to upload against; for Edit,
deferring to Save keeps the "Cancel doesn't change anything" expectation intact. So the component
just tracks the selected `File` in local state, shows a preview (`URL.createObjectURL(file)` when a
new file is picked, or the existing `photoUrl` prop otherwise), and reports the selected `File` up
to the parent via an `onChange(file: File | null)` callback. Uploading is the parent form's job.

## Wiring into the three call sites

- **`apps/frontend/src/app/(admin)/admin/patients/new/page.tsx`** and
  **`apps/frontend/src/app/(cm)/cm/patients/new/page.tsx`**: add `<PatientPhotoInput>` to the
  form, holding the selected `File` in a new piece of state. On submit: `POST /patients` first
  (as today) to get the new `id`; if a photo was selected, follow up with
  `POST /patients/:id/photo` (multipart, field name `photo`, matching the existing endpoint's
  `FileInterceptor('photo', ...)`). If that second call fails, show
  `message.warning('สร้างผู้ป่วยสำเร็จ แต่ไม่สามารถอัปโหลดรูปได้')` and still navigate/succeed as
  normal — the patient record itself isn't worth losing over an optional photo upload failure.
- **`apps/frontend/src/components/patients/PatientEditDrawer.tsx`**: add the same component,
  initialized with the patient's current `photoUrl`. On submit: `PATCH /patients/:id` for the
  other fields first (as today), then upload the new photo (if the user picked one) the same way.

## Out of scope

- No "remove photo" action — this only covers adding a photo at create time or replacing it at
  edit time, not clearing an existing one.
- The LIFF guest-report photo flow (`docs/superpowers/specs/2026-07-05-liff-patient-photo-upload-design.md`)
  is untouched — it already supports both gallery upload and camera capture on mobile, and its
  `reportedById`-based authorization is explicitly preserved by the branch above, not modified.
